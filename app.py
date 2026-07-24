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
    except Exception:
        return jsonify({"error": f"could not fetch price for {ticker}"}), 400

if __name__ == "__main__":
    app.run(debug=True)
