import yfinance as yf

def get_quote(ticker):
    info = yf.Ticker(ticker).fast_info
    price = info["last_price"]
    # best-effort: a missing previous_close shouldn't fail a ticker with a live price
    try:
        previous_close = info["previous_close"]
    except Exception:
        previous_close = None
    return {"price": price, "previous_close": previous_close}
