from flask import Flask, request, jsonify
import yfinance as yf

app = Flask(__name__)

@app.route('/stock')
def stock():
    symbol = request.args.get('symbol')
    if not symbol:
        return jsonify({'error': 'No symbol provided'}), 400
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info
        return jsonify(info)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000)