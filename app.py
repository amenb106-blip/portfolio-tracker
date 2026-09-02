from flask import Flask, render_template, request, jsonify
import re

import prices

TICKER_PATTERN = r"^[A-Z0-9.^=-]{1,20}$"

app = Flask(__name__)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/price")
def price():
    ticker = request.args.get("ticker", "").strip().upper()
    if not ticker:
        return jsonify({"error": "missing ticker"}), 400
    if not re.fullmatch(TICKER_PATTERN, ticker):
        return jsonify({"error": "invalid ticker"}), 400
    try:
        return jsonify(prices.get_quote(ticker))
    except prices.UnknownTicker:
        return jsonify({"error": f"no price found for {ticker}"}), 404
    except Exception:
        return jsonify({"error": "price service unavailable"}), 502

if __name__ == "__main__":
    app.run(debug=True)
