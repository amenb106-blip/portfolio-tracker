import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app as app_module
import prices


@pytest.fixture
def client():
    app_module.app.config["TESTING"] = True
    return app_module.app.test_client()


def test_index_renders(client):
    response = client.get("/")
    assert response.status_code == 200
    assert b"Portfolio Dashboard" in response.data


def test_price_requires_ticker(client):
    response = client.get("/price")
    assert response.status_code == 400
    assert response.get_json() == {"error": "missing ticker"}


@pytest.mark.parametrize("ticker", ["AA PL", "a!b", "x" * 21, "<script>"])
def test_price_rejects_invalid_ticker(client, monkeypatch, ticker):
    monkeypatch.setattr(prices, "get_quote", lambda _: pytest.fail("should not fetch"))
    response = client.get("/price", query_string={"ticker": ticker})
    assert response.status_code == 400
    assert response.get_json() == {"error": "invalid ticker"}


def test_price_normalizes_and_returns_quote(client, monkeypatch):
    seen = []

    def fake_quote(ticker):
        seen.append(ticker)
        return {"price": 101.5, "previous_close": 100.0}

    monkeypatch.setattr(prices, "get_quote", fake_quote)
    response = client.get("/price", query_string={"ticker": "  aapl "})
    assert response.status_code == 200
    assert response.get_json() == {"price": 101.5, "previous_close": 100.0}
    assert seen == ["AAPL"]


def test_price_unknown_ticker_is_404(client, monkeypatch):
    def fake_quote(ticker):
        raise prices.UnknownTicker(ticker)

    monkeypatch.setattr(prices, "get_quote", fake_quote)
    response = client.get("/price", query_string={"ticker": "ZZZZ"})
    assert response.status_code == 404
    assert response.get_json() == {"error": "no price found for ZZZZ"}


def test_price_upstream_failure_is_502(client, monkeypatch):
    def fake_quote(ticker):
        raise RuntimeError("yahoo is down")

    monkeypatch.setattr(prices, "get_quote", fake_quote)
    response = client.get("/price", query_string={"ticker": "AAPL"})
    assert response.status_code == 502
    assert response.get_json() == {"error": "price service unavailable"}


def test_get_quote_caches_results(monkeypatch):
    calls = []

    def fake_fetch(ticker):
        calls.append(ticker)
        return {"price": 10.0, "previous_close": 9.0}

    monkeypatch.setattr(prices, "_fetch_quote", fake_fetch)
    monkeypatch.setattr(prices, "_cache", {})

    first = prices.get_quote("MSFT")
    second = prices.get_quote("MSFT")
    assert first == second == {"price": 10.0, "previous_close": 9.0}
    assert calls == ["MSFT"]


def test_get_quote_cache_expires(monkeypatch):
    calls = []
    clock = [1000.0]

    monkeypatch.setattr(prices, "_fetch_quote", lambda t: calls.append(t) or {"price": 1.0, "previous_close": None})
    monkeypatch.setattr(prices, "_cache", {})
    monkeypatch.setattr(prices.time, "monotonic", lambda: clock[0])

    prices.get_quote("MSFT")
    clock[0] += prices.CACHE_TTL_SECONDS + 1
    prices.get_quote("MSFT")
    assert calls == ["MSFT", "MSFT"]
