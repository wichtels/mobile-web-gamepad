const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer, WebSocket } = require('ws');

const QRCode = require('qrcode');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const EXAMPLE_DIR = path.join(__dirname, 'example-game');

// 1. Automatic local LAN IP detection
function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    const candidates = [];

    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Only IPv4, non-internal addresses
            if (iface.family === 'IPv4' && !iface.internal) {
                // Prefer standard local subnets (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
                if (iface.address.startsWith('192.168.')) {
                    return iface.address;
                }
                candidates.push(iface.address);
            }
        }
    }
    return candidates[0] || '127.0.0.1';
}

const LOCAL_IP = getLocalIpAddress();

// MIME types for static file serving
const MIME_TYPES = {
    '.html': 'text/html; charset=UTF-8',
    '.js': 'application/javascript; charset=UTF-8',
    '.css': 'text/css; charset=UTF-8',
    '.json': 'application/json; charset=UTF-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// 2. HTTP Server
const server = http.createServer(async (req, res) => {
    // API endpoint for network info & QR code generation
    if (req.url === '/api/info') {
        const controllerUrl = `http://${LOCAL_IP}:${PORT}/controller.html`;
        try {
            const qrDataUrl = await QRCode.toDataURL(controllerUrl, {
                width: 320,
                margin: 2,
                color: { dark: '#000000', light: '#ffffff' }
            });

            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({
                ip: LOCAL_IP,
                port: PORT,
                controllerUrl: controllerUrl,
                gameUrl: `http://${LOCAL_IP}:${PORT}/example-game/`,
                hubUrl: `http://${LOCAL_IP}:${PORT}/`,
                qrDataUrl: qrDataUrl
            }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // Serve static files
    let reqPath = req.url.split('?')[0];

    let filePath;
    if (reqPath === '/example-game' || reqPath === '/example-game/') {
        filePath = path.join(EXAMPLE_DIR, 'index.html');
    } else if (reqPath.startsWith('/example-game/')) {
        const subPath = reqPath.slice('/example-game/'.length);
        const safePath = path.normalize(subPath).replace(/^(\.\.[\/\\])+/, '');
        filePath = path.join(EXAMPLE_DIR, safePath);
    } else {
        if (reqPath === '/') reqPath = '/index.html';
        const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
        filePath = path.join(PUBLIC_DIR, safePath);
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache'
        });

        fs.createReadStream(filePath).pipe(res);
    });
});

// 3. WebSocket Server for gamepad connectivity
const wss = new WebSocketServer({ server });

// Rooms for displays (PC / browser game) and controllers (Smartphone)
// Map: roomId => { displays: Set<WebSocket>, controllers: Set<WebSocket> }
const rooms = new Map();

function getRoom(roomId = 'MAIN') {
    if (!rooms.has(roomId)) {
        rooms.set(roomId, {
            displays: new Set(),
            controllers: new Set()
        });
    }
    return rooms.get(roomId);
}

wss.on('connection', (ws, req) => {
    let clientRoom = 'MAIN';
    let clientRole = 'unknown'; // 'display' or 'controller'

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // Registration / Handshake
            if (data.type === 'join') {
                clientRoom = data.room || 'MAIN';
                clientRole = data.role; // 'display' (PC) or 'controller' (Phone)
                const room = getRoom(clientRoom);

                if (clientRole === 'display') {
                    room.displays.add(ws);
                    console.log(`[PC Game] Connected in room "${clientRoom}". (Controllers in room: ${room.controllers.size})`);
                    // Inform PC about connected controllers
                    ws.send(JSON.stringify({
                        type: 'status',
                        controllersCount: room.controllers.size,
                        room: clientRoom
                    }));
                } else if (clientRole === 'controller') {
                    room.controllers.add(ws);
                    console.log(`[Mobile Controller] Connected in room "${clientRoom}".`);
                    // Confirmation to controller
                    ws.send(JSON.stringify({
                        type: 'connected',
                        room: clientRoom,
                        hasDisplay: room.displays.size > 0
                    }));
                    // Inform PC displays
                    for (const display of room.displays) {
                        if (display.readyState === WebSocket.OPEN) {
                            display.send(JSON.stringify({
                                type: 'controller_joined',
                                count: room.controllers.size
                            }));
                        }
                    }
                }
                return;
            }

            // Forward inputs from controller -> PC display
            if (data.type === 'input') {
                const room = getRoom(clientRoom);
                const payload = typeof message === 'string' ? message : message.toString('utf8');
                for (const display of room.displays) {
                    if (display.readyState === WebSocket.OPEN) {
                        display.send(payload);
                    }
                }
                return;
            }

            // Forward rumble / haptic feedback from PC -> mobile controller
            if (data.type === 'feedback' || data.type === 'rumble') {
                const room = getRoom(clientRoom);
                const payload = typeof message === 'string' ? message : message.toString('utf8');
                for (const controller of room.controllers) {
                    if (controller.readyState === WebSocket.OPEN) {
                        controller.send(payload);
                    }
                }
                return;
            }

            // Latency / Ping check
            if (data.type === 'ping') {
                ws.send(JSON.stringify({
                    type: 'pong',
                    clientTime: data.time,
                    serverTime: Date.now()
                }));
                return;
            }
        } catch (e) {
            console.error('Error processing message:', e);
        }
    });

    ws.on('close', () => {
        const room = rooms.get(clientRoom);
        if (room) {
            if (clientRole === 'display') {
                room.displays.delete(ws);
                console.log(`[PC Game] Disconnected from room "${clientRoom}".`);
            } else if (clientRole === 'controller') {
                room.controllers.delete(ws);
                console.log(`[Mobile Controller] Disconnected from room "${clientRoom}".`);
                for (const display of room.displays) {
                    if (display.readyState === WebSocket.OPEN) {
                        display.send(JSON.stringify({
                            type: 'controller_left',
                            count: room.controllers.size
                        }));
                    }
                }
            }
            if (room.displays.size === 0 && room.controllers.size === 0) {
                rooms.delete(clientRoom);
            }
        }
    });
});

// Heartbeat check
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (!ws.isAlive) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 10000);

wss.on('close', () => {
    clearInterval(interval);
});

server.listen(PORT, '0.0.0.0', () => {
    console.log('=====================================================');
    console.log('🎮 MOBILE WEB GAMEPAD SERVER STARTED');
    console.log('=====================================================');
    console.log(`📡 PC Game URL:           http://localhost:${PORT}/`);
    console.log(`📱 Mobile Controller URL: http://${LOCAL_IP}:${PORT}/controller.html`);
    console.log(`🌐 Detected LAN IP:       ${LOCAL_IP} (Port ${PORT})`);
    console.log('=====================================================');
});
