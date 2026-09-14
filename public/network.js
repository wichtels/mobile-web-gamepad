// network.js - Universelle Gamepad-Bridge für beliebige PC-Webspiele
(function() {
    // Event-Emitter für Spiele-Entwickler
    const listeners = {
        'input': [],
        'connect': [],
        'disconnect': [],
        'buttondown': [],
        'buttonup': [],
        'mousemove': [],
        'mousedown': [],
        'mouseup': [],
        'mouseclick': [],
        'scroll': []
    };

    window.GamepadBridge = {
        // Aktueller Zustand (wird laufend aktualisiert)
        inputs: {
            dpad: { x: 0, y: 0 },
            stick: {
                x: 0,           // Normalisierter Float: -1.0000 .. +1.0000 (mindestens 256 Stufen)
                y: 0,
                levelX: 128,    // 0 .. 255 (exakt 256 diskrete Stufen, 128 = Ruhelage/Neutral)
                levelY: 128,    // 0 .. 255 (exakt 256 diskrete Stufen, 128 = Ruhelage/Neutral)
                rawX: 0,        // -128 .. +127 (signed 8-bit integer)
                rawY: 0         // -128 .. +127 (signed 8-bit integer)
            },
            stick8: { x: 128, y: 128 }, // 0..255 Direktwert
            btn: {
                a: false,      // Primärfeuer / Schießen
                b: false,      // Dash / Sprung
                c: false,      // Kamerawechsel / Funktion
                x: false,      // Turbo / Spezial
                y: false,      // Scan / Sekundär
                l1: false,     // Schultertaste Links
                r1: false,     // Schultertaste Rechts
                start: false,  // Start / Pause
                select: false  // Select / Reset
            }
        },
        isConnected: false,
        controllerCount: 0,
        pingMs: 0,
        ws: null,

        // Hilfsmethode zum Abfragen des aktuellen Zustands
        getState() {
            return JSON.parse(JSON.stringify(this.inputs));
        },

        // Event-Registrierung: GamepadBridge.on('input', (inputs) => { ... })
        on(event, callback) {
            if (listeners[event]) {
                listeners[event].push(callback);
            }
        },

        emit(event, data) {
            if (listeners[event]) {
                for (const cb of listeners[event]) {
                    try { cb(data); } catch(e) { console.error(e); }
                }
            }
            // Standard DOM Event für jedes Spiel
            window.dispatchEvent(new CustomEvent('gamepad_' + event, { detail: data }));
        },

        // Haptisches Feedback (Rumble) an das verbundene Smartphone senden
        sendRumble(duration = 120) {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'rumble',
                    duration: duration
                }));
            }
        }
    };

    // UI Elemente des Displays (falls vorhanden)
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    const pingDisplay = document.getElementById('ping-display');
    const qrImage = document.getElementById('qr-image');
    const controllerUrlDisplay = document.getElementById('controller-url-display');
    const pairingModal = document.getElementById('pairing-modal');
    const btnToggleQr = document.getElementById('btn-toggle-qr');
    const btnStartGame = document.getElementById('btn-start-game');

    if (btnToggleQr && pairingModal) {
        btnToggleQr.addEventListener('click', () => pairingModal.classList.toggle('hidden'));
    }
    if (btnStartGame && pairingModal) {
        btnStartGame.addEventListener('click', () => pairingModal.classList.add('hidden'));
    }

    // 1. IP-Info & QR-Code vom Server laden
    async function loadNetworkInfo() {
        try {
            const res = await fetch('/api/info');
            const data = await res.json();
            if (qrImage && data.qrDataUrl) {
                qrImage.src = data.qrDataUrl;
            }
            if (controllerUrlDisplay && data.controllerUrl) {
                controllerUrlDisplay.innerHTML = `<strong>URL:</strong> ${data.controllerUrl}`;
            }
        } catch (e) {
            console.warn('[GamepadBridge] /api/info nicht erreichbar:', e);
        }
    }
    loadNetworkInfo();

    // 2. WebSocket Verbindung aufbauen
    function connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;

        console.log('[GamepadBridge] Verbinde mit WebSocket:', wsUrl);
        const ws = new WebSocket(wsUrl);
        window.GamepadBridge.ws = ws;

        ws.onopen = () => {
            console.log('[GamepadBridge] WebSocket verbunden! Registriere als Display...');
            ws.send(JSON.stringify({
                type: 'join',
                role: 'display',
                room: 'MAIN'
            }));
            startPingLoop(ws);
        };

        ws.onmessage = async (event) => {
            try {
                // Robustes Entpacken: Unterstützt String, Blob und ArrayBuffer
                let text;
                if (typeof event.data === 'string') {
                    text = event.data;
                } else if (event.data instanceof Blob) {
                    text = await event.data.text();
                } else if (event.data instanceof ArrayBuffer) {
                    text = new TextDecoder('utf-8').decode(event.data);
                } else {
                    text = event.data.toString();
                }

                const msg = JSON.parse(text);

                // Controller beigetreten
                if (msg.type === 'controller_joined' || (msg.type === 'status' && msg.controllersCount > 0)) {
                    window.GamepadBridge.isConnected = true;
                    window.GamepadBridge.controllerCount = msg.count || msg.controllersCount || 1;
                    if (statusDot) statusDot.classList.add('connected');
                    if (statusText) statusText.textContent = `Controller connected (${window.GamepadBridge.controllerCount})`;
                    if (pingDisplay) pingDisplay.style.display = 'inline';
                    if (pairingModal) pairingModal.classList.add('hidden');
                    window.GamepadBridge.emit('connect', { count: window.GamepadBridge.controllerCount });
                }

                // Controller getrennt
                if (msg.type === 'controller_left') {
                    window.GamepadBridge.controllerCount = msg.count || 0;
                    if (window.GamepadBridge.controllerCount === 0) {
                        window.GamepadBridge.isConnected = false;
                        if (statusDot) statusDot.classList.remove('connected');
                        if (statusText) statusText.textContent = 'Waiting for controller...';
                        if (pingDisplay) pingDisplay.style.display = 'none';
                        window.GamepadBridge.emit('disconnect', {});
                    }
                }

                // Controller Input empfangen
                if (msg.type === 'input') {
                    const prev = window.GamepadBridge.inputs;

                    if (msg.dpad) {
                        window.GamepadBridge.inputs.dpad.x = Number(msg.dpad.x) || 0;
                        window.GamepadBridge.inputs.dpad.y = Number(msg.dpad.y) || 0;
                    }
                    if (msg.stick) {
                        const st = window.GamepadBridge.inputs.stick;
                        st.x = typeof msg.stick.x === 'number' ? msg.stick.x : (Number(msg.stick.x) || 0);
                        st.y = typeof msg.stick.y === 'number' ? msg.stick.y : (Number(msg.stick.y) || 0);

                        if (msg.stick.levelX !== undefined) {
                            st.levelX = Number(msg.stick.levelX);
                        } else if (msg.stick8 && msg.stick8.x !== undefined) {
                            st.levelX = Number(msg.stick8.x);
                        } else {
                            st.levelX = Math.max(0, Math.min(255, Math.round(st.x * 127.5 + 127.5)));
                        }

                        if (msg.stick.levelY !== undefined) {
                            st.levelY = Number(msg.stick.levelY);
                        } else if (msg.stick8 && msg.stick8.y !== undefined) {
                            st.levelY = Number(msg.stick8.y);
                        } else {
                            st.levelY = Math.max(0, Math.min(255, Math.round(st.y * 127.5 + 127.5)));
                        }

                        st.rawX = msg.stick.rawX !== undefined ? Number(msg.stick.rawX) : (st.levelX - 128);
                        st.rawY = msg.stick.rawY !== undefined ? Number(msg.stick.rawY) : (st.levelY - 128);
                    }

                    if (msg.stick8) {
                        window.GamepadBridge.inputs.stick8.x = Number(msg.stick8.x) ?? 128;
                        window.GamepadBridge.inputs.stick8.y = Number(msg.stick8.y) ?? 128;
                    }

                    if (msg.btn) {
                        for (const key of ['a', 'b', 'c', 'x', 'y', 'l1', 'r1', 'start', 'select']) {
                            const isDown = !!msg.btn[key];
                            if (isDown && !prev.btn[key]) {
                                window.GamepadBridge.emit('buttondown', { button: key });
                            } else if (!isDown && prev.btn[key]) {
                                window.GamepadBridge.emit('buttonup', { button: key });
                            }
                            window.GamepadBridge.inputs.btn[key] = isDown;
                        }
                    }

                    window.GamepadBridge.emit('input', window.GamepadBridge.inputs);
                }

                // Pong Antwort für Ping-Berechnung
                if (msg.type === 'pong') {
                    const rtt = Date.now() - msg.clientTime;
                    window.GamepadBridge.pingMs = rtt;
                    if (pingDisplay) pingDisplay.textContent = `⚡ ${rtt} ms`;
                }
            } catch (e) {
                console.error('[GamepadBridge] Fehler beim Parsen:', e);
            }
        };

        ws.onclose = () => {
            window.GamepadBridge.isConnected = false;
            if (statusDot) statusDot.classList.remove('connected');
            if (statusText) statusText.textContent = 'Server disconnected';
            if (pingDisplay) pingDisplay.style.display = 'none';
            setTimeout(connectWebSocket, 1500);
        };

        ws.onerror = (err) => {
            console.error('[GamepadBridge] WebSocket Fehler:', err);
            ws.close();
        };
    }

    function startPingLoop(ws) {
        const interval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ping', time: Date.now() }));
            } else {
                clearInterval(interval);
            }
        }, 2000);
    }

    connectWebSocket();
})();
