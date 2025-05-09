// API configuration - Using Yahoo Finance API (free, no key required)
const API_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance';

// Cache configuration - reduced to 30 seconds for faster quotes
const CACHE_DURATION = 30 * 1000; // 30 seconds
const cache = new Map();

// Listen for messages from content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'GET_STOCK_DATA') {
        handleStockDataRequest(msg.symbol)
            .then(data => sendResponse({ success: true, data }))
            .catch(err => {
                console.error('Stock data request failed:', err);
                sendResponse({ 
                    success: false, 
                    error: err.message || 'Error loading data',
                    details: err.details || null
                });
            });
        return true; // async
    }
});

// Handle stock data request
async function handleStockDataRequest(symbol) {
    const now = Date.now();
    if (cache.has(symbol) && now - cache.get(symbol).timestamp < CACHE_DURATION) {
        return cache.get(symbol).data;
    }
    try {
        // Fetch quote and chart in parallel
        const [quote, chart] = await Promise.all([
            fetchQuote(symbol),
            fetchChart(symbol)
        ]);
        const data = { ...quote, sparkline: chart };
        cache.set(symbol, { data, timestamp: now });
        return data;
    } catch (error) {
        console.error('Error fetching stock data:', error);
        throw error;
    }
}

// Fetch quote data
async function fetchQuote(symbol) {
    try {
        const url = `${API_BASE_URL}/chart/${symbol}?interval=1d&range=1d`;
        const resp = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Origin': 'https://finance.yahoo.com'
            }
        });
        
        if (!resp.ok) {
            throw new Error(`Quote fetch failed: ${resp.status} ${resp.statusText}`);
        }
        
        const json = await resp.json();
        console.log('Quote API Response:', json); // Debug log
        
        // Validate response structure
        if (!json.chart || !json.chart.result || !json.chart.result[0]) {
            throw new Error('Invalid quote data structure');
        }
        
        const result = json.chart.result[0];
        if (!result.meta) {
            throw new Error('No meta data in quote response');
        }
        
        const q = result.meta;
        
        // Get the current price and change from the latest quote
        const quote = result.indicators.quote[0];
        const timestamps = result.timestamp;
        const lastIndex = timestamps.length - 1;
        
        const currentPrice = quote.close[lastIndex];
        const previousClose = quote.close[lastIndex - 1] || quote.close[0];
        const changePercent = previousClose ? ((currentPrice - previousClose) / previousClose) * 100 : 0;
        
        // Get additional market data
        const volume = quote.volume[lastIndex] || 0;
        const high = quote.high[lastIndex] || currentPrice;
        const low = quote.low[lastIndex] || currentPrice;
        const open = quote.open[lastIndex] || currentPrice;
        
        // Calculate market cap if available
        const marketCap = q.marketCap ? formatMarketCap(q.marketCap) : null;
        
        // Validate required fields with detailed error messages
        if (!q.symbol) {
            throw new Error('Missing symbol in quote data');
        }
        if (typeof currentPrice !== 'number' || isNaN(currentPrice)) {
            throw new Error('Missing or invalid price in quote data');
        }
        
        return {
            symbol: q.symbol,
            name: q.shortName || q.longName || q.symbol,
            price: currentPrice,
            change: changePercent,
            currency: q.currency || '',
            volume: volume,
            high: high,
            low: low,
            open: open,
            marketCap: marketCap,
            exchange: q.exchangeName || '',
            events: [] // Yahoo events API is not public; can be extended
        };
    } catch (error) {
        console.error('Error fetching quote:', error);
        error.details = {
            symbol,
            url: `${API_BASE_URL}/chart/${symbol}?interval=1d&range=1d`
        };
        throw error;
    }
}

// Helper function to format market cap
function formatMarketCap(marketCap) {
    if (marketCap >= 1e12) {
        return `$${(marketCap / 1e12).toFixed(2)}T`;
    } else if (marketCap >= 1e9) {
        return `$${(marketCap / 1e9).toFixed(2)}B`;
    } else if (marketCap >= 1e6) {
        return `$${(marketCap / 1e6).toFixed(2)}M`;
    } else if (marketCap >= 1e3) {
        return `$${(marketCap / 1e3).toFixed(2)}K`;
    }
    return `$${marketCap.toFixed(2)}`;
}

// Fetch chart data for sparkline
async function fetchChart(symbol) {
    try {
        const url = `${API_BASE_URL}/chart/${symbol}?interval=5m&range=1d`;
        const resp = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Origin': 'https://finance.yahoo.com'
            }
        });
        
        if (!resp.ok) {
            throw new Error(`Chart fetch failed: ${resp.status} ${resp.statusText}`);
        }
        
        const json = await resp.json();
        console.log('Chart API Response:', json); // Debug log
        
        // Validate response structure
        if (!json.chart || !json.chart.result || !json.chart.result[0]) {
            throw new Error('Invalid chart data structure');
        }
        
        const result = json.chart.result[0];
        if (!result.indicators || !result.indicators.quote || !result.indicators.quote[0]) {
            throw new Error('No quote data in chart response');
        }
        
        const closePrices = result.indicators.quote[0].close;
        if (!Array.isArray(closePrices)) {
            throw new Error('Invalid close prices data');
        }
        
        // Filter out null values and ensure we have enough data points
        const validPrices = closePrices.filter(x => x != null);
        if (validPrices.length < 2) {
            throw new Error('Insufficient price data available');
        }
        
        return validPrices;
    } catch (error) {
        console.error('Error fetching chart:', error);
        error.details = {
            symbol,
            url: `${API_BASE_URL}/chart/${symbol}?interval=5m&range=1d`
        };
        throw error;
    }
}

// Clear old cache entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [symbol, entry] of cache.entries()) {
        if (now - entry.timestamp > CACHE_DURATION) cache.delete(symbol);
    }
}, CACHE_DURATION); 