import math
import threading
import time

import yfinance as yf

CACHE_TTL_SECONDS = 60

_cache = {}
_cache_lock = threading.Lock()


class UnknownTicker(Exception):
    pass


def _as_price(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number) or number <= 0:
        return None
    return number


def _fetch_quote(ticker):
    history = yf.Ticker(ticker).history(period="5d", interval="1d", auto_adjust=False)
    if history is None or history.empty or "Close" not in history:
        raise UnknownTicker(ticker)

    closes = [_as_price(close) for close in history["Close"].tolist()]
    closes = [close for close in closes if close is not None]
    if not closes:
        raise UnknownTicker(ticker)

    return {
        "price": closes[-1],
        "previous_close": closes[-2] if len(closes) >= 2 else None,
    }


def get_quote(ticker):
    now = time.monotonic()
    with _cache_lock:
        cached = _cache.get(ticker)
        if cached and now - cached[0] < CACHE_TTL_SECONDS:
            return dict(cached[1])

    quote = _fetch_quote(ticker)

    with _cache_lock:
        _cache[ticker] = (now, quote)
    return dict(quote)
