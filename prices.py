import yfinance as yf

def get_quote(ticker):
    info = yf.Ticker(ticker).fast_info
    price = info["last_price"]
    # previous_close is best-effort: a missing value shouldn't fail a
    # ticker whose live price is available.
    try:
        previous_close = info["previous_close"]
    except Exception:
        previous_close = None
    return {"price": price, "previous_close": previous_close}
