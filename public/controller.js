// controller.js - Multi-Touch Engine für das neue Steuerkreuz rechts & Action-Buttons links
(function() {
    const state = {
        dpad: { x: 0, y: 0 },
        stick: {
            x: 0,           // Normalisierter Float: -1.0 .. +1.0 (256 Stufen quantisiert)
            y: 0,           // Normalisierter Float: -1.0 .. +1.0 (256 Stufen quantisiert)
            levelX: 128,    // 0 .. 255 (256 Stufen von linkem bis rechtem Anschlag, 128 = Mitte)
            levelY: 128,    // 0 .. 255 (256 Stufen von oberem bis unterem Anschlag, 128 = Mitte)
            rawX: 0,        // -128 .. +127 (8-bit signed integer)
            rawY: 0         // -128 .. +127 (8-bit signed integer)
        },
        stick8: { x: 128, y: 128 }, // 8-bit Analog: 0..255
        btn: {
            a: 0,
            b: 0,
            c: 0,
            x: 0,
            y: 0,
            l1: 0,
            r1: 0,
            start: 0,
            select: 0
        }
    };

    let ws = null;
    let isConnected = false;
    let wakeLock = null;

    // UI-Elemente
    const connDot = document.getElementById('conn-dot');
    const connStatus = document.getElementById('conn-status');
    const pingText = document.getElementById('ping-text');
    const btnFs = document.getElementById('btn-fs');
    const ipInfo = document.getElementById('ip-info');
    const giantDpad = document.getElementById('giant-dpad');

    if (ipInfo) ipInfo.textContent = window.location.host;

    // 1. Haptik / Vibration
    function triggerHaptic(ms = 18) {
        if ('vibrate' in navigator) {
            try { navigator.vibrate(ms); } catch (e) {}
        }
    }

    // 2. Display-Wakelock
    async function requestWakeLock() {
        if ('wakeLock' in navigator) {
            try {
                wakeLock = await navigator.wakeLock.request('screen');
            } catch (err) {}
        }
    }
    document.addEventListener('visibilitychange', async () => {
        if (wakeLock !== null && document.visibilityState === 'visible') {
            await requestWakeLock();
        }
    });

    // 3. Fullscreen toggle (automatically hidden when fullscreen is active)
    function syncFullscreenUI() {
        const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
        document.body.classList.toggle('is-fullscreen', isFs);
        if (btnFs) {
            btnFs.style.display = isFs ? 'none' : 'flex';
        }
    }

    if (btnFs) {
        btnFs.addEventListener('click', () => {
            triggerHaptic(20);
            if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                if (document.documentElement.requestFullscreen) {
                    document.documentElement.requestFullscreen().catch(() => {});
                } else if (document.documentElement.webkitRequestFullscreen) {
                    document.documentElement.webkitRequestFullscreen();
                }
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen().catch(() => {});
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                }
            }
            setTimeout(syncFullscreenUI, 120);
        });
        document.addEventListener('fullscreenchange', syncFullscreenUI);
        document.addEventListener('webkitfullscreenchange', syncFullscreenUI);
        syncFullscreenUI();
    }

    // 4. WebSocket Verbindung
    function connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;

        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            isConnected = true;
            if (connDot) connDot.classList.add('connected');
            if (connStatus) connStatus.textContent = 'ONLINE';

            ws.send(JSON.stringify({
                type: 'join',
                role: 'controller',
                room: 'MAIN'
            }));

            requestWakeLock();
            startPingLoop();
        };

        ws.onmessage = async (event) => {
            try {
                let text;
                if (typeof event.data === 'string') {
                    text = event.data;
                } else if (event.data instanceof Blob) {
                    text = await event.data.text();
                } else {
                    text = event.data.toString();
                }

                const data = JSON.parse(text);

                // Rumble / Feedback vom PC Spiel
                if (data.type === 'rumble' || data.type === 'feedback') {
                    const dur = data.duration || 120;
                    triggerHaptic(dur);
                }
            } catch (e) {
                console.error('[Controller] Error parsing message:', e);
            }
        };

        ws.onclose = () => {
            isConnected = false;
            if (connDot) connDot.classList.remove('connected');
            if (connStatus) connStatus.textContent = 'OFFLINE';
            setTimeout(connect, 1500);
        };

        ws.onerror = () => {
            ws.close();
        };
    }

    function startPingLoop() {
        const interval = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ping', time: Date.now() }));
            } else {
                clearInterval(interval);
            }
        }, 2000);
    }

    // Herzschlag: Solange eine Eingabe aktiv ist, regelmäßig den kompletten
    // Zustand senden.
    setInterval(() => {
        if (!isConnected) return;
        const active =
            state.dpad.x !== 0 || state.dpad.y !== 0 ||
            state.stick.levelX !== 128 || state.stick.levelY !== 128 ||
            Object.keys(state.btn).some(k => state.btn[k]);
        if (active) sendInput();
    }, 250);

    // Senden des Input-Zustands an den PC
    function sendInput() {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'input',
                ts: Date.now(),
                dpad: state.dpad,
                stick: state.stick,
                stick8: state.stick8,
                btn: state.btn
            }));
        }
    }

    // ==========================================
    // 5. STEUERKREUZ & ZENTRALER MINI-JOYSTICK
    // ==========================================
    const petals = {
        up: document.querySelector('.dpad-up'),
        down: document.querySelector('.dpad-down'),
        left: document.querySelector('.dpad-left'),
        right: document.querySelector('.dpad-right')
    };

    const miniStickNub = document.getElementById('mini-stick-nub');
    const NUB_TRAVEL = 28;  // sichtbare Nub-Auslenkung (px, bleibt im Hub)
    let stickRadius = 50;   // Daumenweg für vollen Ausschlag (Hub-basiert)

    function updateStickRadius() {
        const hub = document.getElementById('dpad-center-hub');
        if (!hub) return;
        const w = hub.getBoundingClientRect().width;
        if (w > 40) stickRadius = w * 0.42; // 120px-Hub → 50px Voll-Ausschlag
    }

    function updateMiniStick(dx, dy) {
        if (!miniStickNub) return;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.5) {
            miniStickNub.style.transition = 'transform 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            miniStickNub.style.transform = 'translate(0px, 0px)';
            miniStickNub.classList.remove('active');
            const changed = state.stick.levelX !== 128 || state.stick.levelY !== 128 || state.stick.x !== 0 || state.stick.y !== 0;
            state.stick.x = 0;
            state.stick.y = 0;
            state.stick.levelX = 128;
            state.stick.levelY = 128;
            state.stick.rawX = 0;
            state.stick.rawY = 0;
            state.stick8.x = 128;
            state.stick8.y = 128;
            if (changed) sendInput();
            return;
        }
        updateStickRadius();
        // Echter Analogweg: Daumenabstand zur Pad-Mitte, kreisförmig begrenzt (0..1)
        const mag = Math.min(dist / stickRadius, 1);
        const ang = Math.atan2(dy, dx);
        const vx = Math.cos(ang) * mag;                          // -1.0 .. +1.0
        const vy = Math.sin(ang) * mag;

        miniStickNub.style.transition = 'none';
        const nx = vx * NUB_TRAVEL;
        const ny = vy * NUB_TRAVEL;
        miniStickNub.style.transform = `translate(${nx.toFixed(1)}px, ${ny.toFixed(1)}px)`;
        miniStickNub.classList.add('active');

        // Exakt 256 diskrete Stufen end-to-end (0..255, 128 = Ruhelage/Neutral)
        const enc = v => Math.max(0, Math.min(255, Math.round(v * 127.5 + 127.5)));
        const lvlX = enc(vx);
        const lvlY = enc(vy);
        const rawX = lvlX - 128; // -128 .. +127
        const rawY = lvlY - 128; // -128 .. +127

        const changed = state.stick.levelX !== lvlX || state.stick.levelY !== lvlY;

        // Normalisierter Float passend zu den 256 Stufen
        state.stick.x = Number((rawX / 127.5).toFixed(4));
        state.stick.y = Number((rawY / 127.5).toFixed(4));
        state.stick.levelX = lvlX;
        state.stick.levelY = lvlY;
        state.stick.rawX = rawX;
        state.stick.rawY = rawY;
        state.stick8.x = lvlX;
        state.stick8.y = lvlY;

        if (changed) sendInput(); // Jede der 256 Stufen wird verzögerungsfrei gesendet
    }

    let activeDpadTouchId = null;

    function handleDpadTouch(e) {
        e.preventDefault();
        const rect = giantDpad.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        let found = false;

        for (let i = 0; i < e.touches.length; i++) {
            const t = e.touches[i];
            if (activeDpadTouchId !== null && t.identifier !== activeDpadTouchId) continue;
            const dx = t.clientX - centerX;
            const dy = t.clientY - centerY;

            // Berührung im Bereich des D-Pads (mit leichtem Puffer)
            if (Math.abs(dx) <= rect.width / 2 + 35 && Math.abs(dy) <= rect.height / 2 + 35) {
                activeDpadTouchId = t.identifier;
                found = true;

                // IMMER analog: Auslenkung von der Pad-Mitte (256 Stufen/Achse)
                updateMiniStick(dx, dy);

                // Petals (Pfeil-Tasten) wirken digital wie Cursortasten — Tipp
                // = volle Richtung, Halten = dauerhaft. Überall sonst (Hub,
                // Diagonal-Lücken) regiert der analoge Stick allein.
                const elem = document.elementFromPoint(t.clientX, t.clientY);
                const hitPetal = elem ? elem.closest('.dpad-petal') : null;
                if (hitPetal) {
                    const dir = hitPetal.dataset.dir;
                    let nx = 0, ny = 0;
                    if (dir === 'left') nx = -1;
                    else if (dir === 'right') nx = 1;
                    else if (dir === 'up') ny = -1;
                    else if (dir === 'down') ny = 1;
                    setDpad(nx, ny);
                } else {
                    setDpad(0, 0);
                }
                break;
            }
        }

        if (!found && activeDpadTouchId !== null) {
            releaseDpad();
        }
    }

    // Loslassen: erst Stick UND D-Pad zurücksetzen, DANN senden — und zwar
    // immer. Sonst geht als letzte Nachricht ein ausgelenkter Stick-Wert raus
    // und der Roboter bewegt sich nach dem Loslassen weiter.
    function releaseDpad() {
        activeDpadTouchId = null;
        updateMiniStick(0, 0);
        setDpad(0, 0);
        sendInput();
    }

    function setDpad(x, y) {
        if (state.dpad.x !== x || state.dpad.y !== y) {
            state.dpad.x = x;
            state.dpad.y = y;

            petals.up?.classList.toggle('active', y < 0);
            petals.down?.classList.toggle('active', y > 0);
            petals.left?.classList.toggle('active', x < 0);
            petals.right?.classList.toggle('active', x > 0);

            if (x !== 0 || y !== 0) triggerHaptic(14);
            sendInput();
        }
    }

    if (giantDpad) {
        giantDpad.addEventListener('touchstart', handleDpadTouch, { passive: false });
        giantDpad.addEventListener('touchmove', handleDpadTouch, { passive: false });
        giantDpad.addEventListener('touchend', (e) => {
            e.preventDefault();
            handleDpadTouch(e);
            if (e.touches.length === 0) {
                releaseDpad();
            }
        }, { passive: false });
        giantDpad.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            releaseDpad();
        }, { passive: false });

        // Desktop Maus-Unterstützung für D-Pad & Mini-Joystick
        let isMouseDownDpad = false;
        giantDpad.addEventListener('mousedown', (e) => {
            isMouseDownDpad = true;
            resolveDpadMouse(e);
        });
        window.addEventListener('mousemove', (e) => {
            if (isMouseDownDpad) resolveDpadMouse(e);
        });
        window.addEventListener('mouseup', () => {
            if (isMouseDownDpad) {
                isMouseDownDpad = false;
                releaseDpad();
            }
        });

        function resolveDpadMouse(e) {
            const rect = giantDpad.getBoundingClientRect();
            const dx = e.clientX - (rect.left + rect.width / 2);
            const dy = e.clientY - (rect.top + rect.height / 2);

            updateMiniStick(dx, dy);

            // Petals digital (Cursortasten), sonst reine Analog-Auslenkung
            const elem = document.elementFromPoint(e.clientX, e.clientY);
            const hitPetal = elem ? elem.closest('.dpad-petal') : null;
            if (hitPetal) {
                const dir = hitPetal.dataset.dir;
                let nx = 0, ny = 0;
                if (dir === 'left') nx = -1;
                else if (dir === 'right') nx = 1;
                else if (dir === 'up') ny = -1;
                else if (dir === 'down') ny = 1;
                setDpad(nx, ny);
            } else {
                setDpad(0, 0);
            }
        }
    }

    // ==========================================
    // 6. ACTION-BUTTONS (LINKER DAUMEN & SCHULTER)
    // ==========================================
    function setupButton(element) {
        const btnKey = element.dataset.btn;
        if (!btnKey) return;

        const press = (e) => {
            e.preventDefault();
            state.btn[btnKey] = 1;
            element.classList.add('active');
            triggerHaptic(18);
            sendInput();
        };

        const release = (e) => {
            e.preventDefault();
            state.btn[btnKey] = 0;
            element.classList.remove('active');
            sendInput();
        };

        element.addEventListener('touchstart', press, { passive: false });
        element.addEventListener('touchend', release, { passive: false });
        element.addEventListener('touchcancel', release, { passive: false });

        element.addEventListener('mousedown', press);
        element.addEventListener('mouseup', release);
        element.addEventListener('mouseleave', release);
    }

    document.querySelectorAll('[data-btn]').forEach(el => setupButton(el));

    // Verbindung initiieren
    connect();
})();
