from flask import Flask, render_template, request, jsonify
import prices

app = Flask(__name__)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/price")
def price():
    ticker = request.args.get("ticker")
    if not ticker:
        return jsonify({"error": "missing ticker"}), 400
    try:
        return jsonify({"price": prices.get_price(ticker)})
    except Exception:
        return jsonify({"error": f"could not fetch price for {ticker}"}), 400

if __name__ == "__main__":
    app.run(debug=True)
