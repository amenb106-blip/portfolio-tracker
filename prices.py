import yfinance as yf

def get_price(ticker):
    stock = yf.Ticker(ticker)
    price = stock.fast_info["last_price"]
    return price
