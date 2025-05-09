// Ticker detection regex - improved to avoid false positives
const TICKER_REGEX = /\b(?<!\.)([A-Z]{1,5})(?!\.)\b/g;

// Common words to exclude from ticker detection
const EXCLUDED_WORDS = new Set([
    'A', 'I', 'THE', 'IN', 'ON', 'AT', 'TO', 'FOR', 'OF', 'AND', 'OR', 'BUT',
    'IS', 'ARE', 'WAS', 'WERE', 'BE', 'BEEN', 'BEING', 'HAVE', 'HAS', 'HAD',
    'DO', 'DOES', 'DID', 'WILL', 'WOULD', 'SHALL', 'SHOULD', 'MAY', 'MIGHT',
    'MUST', 'CAN', 'COULD', 'GET', 'GOT', 'GETS', 'GETTING'
]);

// Create tooltip element
const tooltip = document.createElement('div');
tooltip.className = 'hoverquote-tooltip';
document.body.appendChild(tooltip);

// Cache for stock data
const stockDataCache = new Map();

// Function to detect and wrap tickers
function wrapTickers() {
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function(node) {
                // Skip script and style tags
                if (node.parentElement.tagName === 'SCRIPT' || 
                    node.parentElement.tagName === 'STYLE' ||
                    node.parentElement.classList.contains('hoverquote-ticker')) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        },
        false
    );

    const nodesToReplace = [];
    let node;
    while (node = walker.nextNode()) {
        const matches = [...node.textContent.matchAll(TICKER_REGEX)];
        if (matches.length > 0) {
            // Filter out common words and false positives
            const validMatches = matches.filter(match => 
                !EXCLUDED_WORDS.has(match[0]) &&
                // Check if the match is not part of a larger word
                !/[a-z]/.test(node.textContent[match.index - 1] || '') &&
                !/[a-z]/.test(node.textContent[match.index + match[0].length] || '')
            );
            if (validMatches.length > 0) {
                nodesToReplace.push({ node, matches: validMatches });
            }
        }
    }

    nodesToReplace.forEach(({ node, matches }) => {
        let lastIndex = 0;
        const fragment = document.createDocumentFragment();
        
        matches.forEach(match => {
            // Add text before the match
            if (match.index > lastIndex) {
                fragment.appendChild(
                    document.createTextNode(node.textContent.slice(lastIndex, match.index))
                );
            }
            
            // Create ticker span
            const tickerSpan = document.createElement('span');
            tickerSpan.className = 'hoverquote-ticker';
            tickerSpan.textContent = match[0];
            tickerSpan.dataset.ticker = match[0];
            
            // Add hover events
            tickerSpan.addEventListener('mouseenter', handleTickerHover);
            tickerSpan.addEventListener('mouseleave', handleTickerLeave);
            
            fragment.appendChild(tickerSpan);
            lastIndex = match.index + match[0].length;
        });
        
        // Add remaining text
        if (lastIndex < node.textContent.length) {
            fragment.appendChild(
                document.createTextNode(node.textContent.slice(lastIndex))
            );
        }
        
        node.parentNode.replaceChild(fragment, node);
    });
}

// Handle ticker hover
async function handleTickerHover(event) {
    const ticker = event.target.dataset.ticker;
    
    // Position tooltip
    const rect = event.target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    
    // Calculate position to keep tooltip in viewport
    let left = rect.left + window.scrollX;
    let top = rect.bottom + window.scrollY + 5;
    
    // Adjust if tooltip would go off right edge
    if (left + tooltipRect.width > window.innerWidth) {
        left = window.innerWidth - tooltipRect.width - 10;
    }
    
    // Adjust if tooltip would go off bottom edge
    if (top + tooltipRect.height > window.innerHeight + window.scrollY) {
        top = rect.top + window.scrollY - tooltipRect.height - 5;
    }
    
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    
    // Show loading state
    tooltip.innerHTML = '<div class="tooltip-loading">Loading...</div>';
    tooltip.style.display = 'block';
    
    try {
        // Check cache first
        if (!stockDataCache.has(ticker)) {
            // Request data from background script
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({ type: 'GET_STOCK_DATA', symbol: ticker }, (res) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (res && res.success) {
                        resolve(res.data);
                    } else {
                        const error = new Error(res && res.error ? res.error : 'Error loading data');
                        if (res && res.details) {
                            error.details = res.details;
                        }
                        reject(error);
                    }
                });
            });
            stockDataCache.set(ticker, response);
        }
        const data = stockDataCache.get(ticker);
        renderTooltip(data);
    } catch (error) {
        console.error('Error loading stock data:', error);
        let errorMessage = 'Error loading data';
        if (error.message) {
            errorMessage = error.message;
        }
        if (error.details) {
            console.error('Error details:', error.details);
        }
        tooltip.innerHTML = `
            <div class="tooltip-error">
                <div class="error-message">${errorMessage}</div>
                <div class="error-ticker">${ticker}</div>
            </div>
        `;
    }
}

// Handle ticker leave
function handleTickerLeave() {
    tooltip.style.display = 'none';
}

// Render tooltip content
function renderTooltip(data) {
    if (!data || typeof data !== 'object') {
        tooltip.innerHTML = 'Error: Invalid data received';
        return;
    }

    const { symbol, price, sparkline, volume, high, low, open, marketCap, previousClose, currency } = data;
    
    // Validate required fields
    if (!symbol || typeof price !== 'number') {
        tooltip.innerHTML = 'Error: Missing required data';
        return;
    }

    // Format volume with commas
    const formattedVolume = volume ? volume.toLocaleString() : 'N/A';

    tooltip.innerHTML = `
        <div class="tooltip-header">
            <span class="ticker">${symbol}</span>
            <span class="price">$${price.toFixed(2)}</span>
        </div>
        <div class="tooltip-details organized-details">
            <div class="details-group">
                <div class="detail-row"><span class="detail-label">Open</span><span class="detail-value">$${open.toFixed(2)}</span></div>
                <div class="detail-row"><span class="detail-label">High</span><span class="detail-value">$${high.toFixed(2)}</span></div>
                <div class="detail-row"><span class="detail-label">Low</span><span class="detail-value">$${low.toFixed(2)}</span></div>
                ${previousClose ? `<div class="detail-row"><span class="detail-label">Prev Close</span><span class="detail-value">$${previousClose.toFixed(2)}</span></div>` : ''}
            </div>
            <div class="details-divider"></div>
            <div class="details-group">
                <div class="detail-row"><span class="detail-label">Volume</span><span class="detail-value">${formattedVolume}</span></div>
                ${marketCap ? `<div class="detail-row"><span class="detail-label">Market Cap</span><span class="detail-value">${marketCap}</span></div>` : ''}
                ${currency ? `<div class="detail-row"><span class="detail-label">Currency</span><span class="detail-value">${currency}</span></div>` : ''}
            </div>
        </div>
        <div class="tooltip-sparkline">
            ${generateSparkline(sparkline)}
        </div>
        <div class="tooltip-events">
            ${renderEvents(data.events)}
        </div>
    `;
}

// Generate sparkline SVG
function generateSparkline(data) {
    if (!data || data.length === 0) return '';
    
    const points = data.map((value, index) => 
        `${index},${100 - (value - Math.min(...data)) / (Math.max(...data) - Math.min(...data)) * 100}`
    ).join(' ');
    
    return `<svg viewBox="0 0 ${data.length} 100" preserveAspectRatio="none">
        <polyline points="${points}" fill="none" stroke="currentColor"/>
    </svg>`;
}

// Render upcoming events
function renderEvents(events) {
    if (!events || events.length === 0) return '';
    return events.map(event => `
        <div class="event">
            <span class="event-type">${event.type}</span>
            <span class="event-date">${new Date(event.date).toLocaleDateString()}</span>
        </div>
    `).join('');
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', wrapTickers);

// Handle dynamic content with debouncing
let debounceTimer;
const observer = new MutationObserver(mutations => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        wrapTickers();
    }, 250); // Debounce for 250ms
});

observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
}); 