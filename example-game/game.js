// game.js - CYBER ROVER: Bodendrohnen Testgelände & Physik-Simulation
(function() {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    // HUD Elemente
    const healthBar = document.getElementById('health-bar');
    const nitroVal = document.getElementById('nitro-val');
    const speedVal = document.getElementById('speed-val');
    const jumpVal = document.getElementById('jump-val');
    const scoreVal = document.getElementById('score-val');

    // ==========================================
    // 1. DYNAMISCHER AUDIO SYNTHESIZER
    // ==========================================
    class RoverAudioEngine {
        constructor() {
            this.ctx = null;
            this.engineOsc = null;
            this.engineGain = null;
        }

        init() {
            if (!this.ctx) {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                this.ctx = new AudioCtx();
                this.setupEngineSound();
            }
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
        }

        setupEngineSound() {
            this.engineOsc = this.ctx.createOscillator();
            this.engineGain = this.ctx.createGain();
            this.engineOsc.type = 'sawtooth';
            this.engineOsc.frequency.setValueAtTime(45, this.ctx.currentTime);
            this.engineGain.gain.setValueAtTime(0.02, this.ctx.currentTime);

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(220, this.ctx.currentTime);

            this.engineOsc.connect(filter);
            filter.connect(this.engineGain);
            this.engineGain.connect(this.ctx.destination);
            this.engineOsc.start();
        }

        updateEngine(speed, isNitro) {
            if (!this.engineOsc) return;
            const absSpeed = Math.abs(speed);
            const targetFreq = 40 + (absSpeed / 600) * 110 + (isNitro ? 50 : 0);
            const targetVol = 0.02 + Math.min(0.06, (absSpeed / 600) * 0.05);

            this.engineOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.08);
            this.engineGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.08);
        }

        playShoot() {
            this.init();
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(700, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.1);
        }

        playJump() {
            this.init();
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(140, this.ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(380, this.ctx.currentTime + 0.18);
            gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.2);
        }

        playLand() {
            this.init();
            const dur = 0.15;
            const bufferSize = this.ctx.sampleRate * dur;
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
            }
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(160, this.ctx.currentTime);
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);
            noise.start();
        }

        playExplosion() {
            this.init();
            const dur = 0.35;
            const bufferSize = this.ctx.sampleRate * dur;
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
            }
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(400, this.ctx.currentTime);
            filter.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + dur);
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);
            noise.start();
        }

        playCamSwitch() {
            this.init();
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(420, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(780, this.ctx.currentTime + 0.12);
            gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.12);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.12);
        }
    }

    const sound = new RoverAudioEngine();

    // Tastatur-Fallback für PC (WASD & Pfeiltasten für direkte Richtungssteuerung)
    const keys = {
        up: false,
        down: false,
        left: false,
        right: false,
        shoot: false,
        jump: false,
        nitro: false,
        handbrake: false,
        cam: false
    };

    window.addEventListener('keydown', (e) => {
        sound.init();
        if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.up = true;
        if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.down = true;
        if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.left = true;
        if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.right = true;
        if (e.code === 'Space' || e.code === 'KeyK') keys.jump = true;
        if (e.code === 'KeyJ' || e.code === 'Enter') keys.shoot = true;
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyE') keys.nitro = true;
        if (e.code === 'KeyQ') keys.handbrake = true;
        if (e.code === 'KeyC') keys.cam = true;
    });

    window.addEventListener('keyup', (e) => {
        if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.up = false;
        if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.down = false;
        if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.left = false;
        if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.right = false;
        if (e.code === 'Space' || e.code === 'KeyK') keys.jump = false;
        if (e.code === 'KeyJ' || e.code === 'Enter') keys.shoot = false;
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyE') keys.nitro = false;
        if (e.code === 'KeyQ') keys.handbrake = false;
        if (e.code === 'KeyC') keys.cam = false;
    });

    // ==========================================
    // KAMERA-SYSTEM (ARENA, CHASE, COCKPIT)
    // ==========================================
    const camera = {
        mode: 0, // 0 = Arena Overview, 1 = Chase Cam, 2 = Cockpit/Close Cam
        x: 0,
        y: 0,
        zoom: 1.0,
        modes: ['ARENA (OVERVIEW)', 'CHASE (FOLLOW)', 'COCKPIT (CLOSE)']
    };
    let wasCamPressed = false;

    // Skalierung
    let width = 0, height = 0;
    function resize() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
        if (camera.x === 0 && camera.y === 0) {
            camera.x = width / 2;
            camera.y = height / 2;
        }
    }
    window.addEventListener('resize', resize);
    resize();

    // ==========================================
    // 2. BODENDROHNE (WHEELED ROVER) PHYSIK
    // ==========================================
    const rover = {
        x: width / 2,
        y: height / 2,
        vx: 0,                 // 2D Geschwindigkeit X
        vy: 0,                 // 2D Geschwindigkeit Y
        angle: 0,              // Blick- und Fahrtrichtung in Radiant
        speed: 0,              // Aktuelle Geschwindigkeit
        maxForwardSpeed: 380,  // Standard Höchsttempo
        maxNitroSpeed: 580,    // Turbo Höchsttempo
        accel: 1400,           // Schnelle, direkte Beschleunigung
        friction: 0.88,        // Rollreibung beim Ausrollen

        // Räder & Lenkung
        steerAngle: 0,         // Radeinschlag der Vorderräder
        maxSteer: 0.6,         // Max Radeinschlag (ca. 34 Grad)
        steerSpeed: 10.0,      // Schnelles Einlenken

        // Vertikale Sprung-Physik (Z-Achse)
        z: 0,                  // Höhe über dem Boden (0 = am Boden)
        vz: 0,                 // Vertikale Sprunggeschwindigkeit
        gravity: 1200,         // Schwerkraft
        isGrounded: true,
        wasJumpPressed: false,

        // Status & Waffen
        hp: 100,
        nitro: 100,
        isNitroActive: false,
        shootCooldown: 0,
        turretRecoil: 0,

        reset() {
            this.x = width / 2;
            this.y = height / 2;
            this.vx = 0;
            this.vy = 0;
            this.angle = 0;
            this.speed = 0;
            this.steerAngle = 0;
            this.z = 0;
            this.vz = 0;
            this.isGrounded = true;
            this.wasJumpPressed = false;
            this.hp = 100;
            this.nitro = 100;
        }
    };

    // Spiel-Elemente
    let score = 0;
    let screenShake = 0;
    const skidmarks = [];
    const bullets = [];
    const crates = [];
    const barrels = [];
    const ramps = [];
    const targets = [];
    const particles = [];
    const floatTexts = [];

    // ==========================================
    // 3. TESTGELÄNDE AUFBAUEN (OBSTACLE COURSE)
    // ==========================================
    function setupPlayground() {
        crates.length = 0;
        barrels.length = 0;
        ramps.length = 0;
        targets.length = 0;

        // Schanzen / Sprung-Rampen
        ramps.push({ x: width * 0.25, y: height * 0.35, width: 80, height: 50, angle: 0 });
        ramps.push({ x: width * 0.75, y: height * 0.65, width: 80, height: 50, angle: Math.PI });

        // Holzkisten zum Verschieben & Zerschießen
        for (let i = 0; i < 14; i++) {
            crates.push({
                x: Math.random() * (width - 240) + 120,
                y: Math.random() * (height - 240) + 120,
                size: 32,
                vx: 0,
                vy: 0,
                hp: 2
            });
        }

        // Explosive Fässer
        for (let i = 0; i < 8; i++) {
            barrels.push({
                x: Math.random() * (width - 300) + 150,
                y: Math.random() * (height - 300) + 150,
                radius: 18,
                hp: 1
            });
        }

        // Ziel-Drohnen (Targets)
        for (let i = 0; i < 6; i++) {
            targets.push({
                x: Math.random() * (width - 200) + 100,
                y: Math.random() * (height - 200) + 100,
                radius: 20,
                hp: 3,
                angle: Math.random() * Math.PI * 2,
                speed: Math.random() * 60 + 30
            });
        }
    }
    setupPlayground();

    // Effekte
    function createSparks(x, y, color = '#00f0ff', count = 15) {
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const spd = Math.random() * 5 + 1;
            particles.push({
                x, y,
                vx: Math.cos(a) * spd,
                vy: Math.sin(a) * spd,
                color,
                size: Math.random() * 3 + 1,
                life: 1.0,
                decay: 0.04
            });
        }
    }

    function createFloatingText(x, y, text, color = '#ffe600') {
        floatTexts.push({ x, y, text, color, life: 1.0, vy: -1.2 });
    }

    // ==========================================
    // 4. HAUPTSCHLEIFE & PHYSIK-UPDATE
    // ==========================================
    let lastTime = performance.now();

    function gameLoop(now) {
        const dt = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;

        update(dt);
        render();

        requestAnimationFrame(gameLoop);
    }

    function update(dt) {
        // Inputs von Smartphone-Controller oder Tastatur
        const c = window.GamepadBridge ? window.GamepadBridge.inputs : { dpad: { x: 0, y: 0 }, btn: {} };

        // 1. Richtungssteuerung (Direktionale Steuerung):
        // Oben: Fahrzeug fährt nach OBEN (y < 0)
        // Unten: Fahrzeug fährt nach UNTEN (y > 0)
        // Links: Fahrzeug fährt nach LINKS (x < 0)
        // Rechts: Fahrzeug fährt nach RECHTS (x > 0)
        let inX = 0;
        let inY = 0;

        // Echter 256-Stufen-Analogstick mit sanfter 3%-Deadzone
        const stickMag = (c.stick && (typeof c.stick.x === 'number' || typeof c.stick.y === 'number'))
            ? Math.hypot(c.stick.x || 0, c.stick.y || 0)
            : 0;

        if (stickMag > 0.03) {
            inX = c.stick.x;
            inY = c.stick.y;
        } else {
            if (c.dpad.x < 0 || keys.left) inX -= 1;
            if (c.dpad.x > 0 || keys.right) inX += 1;
            if (c.dpad.y < 0 || keys.up) inY -= 1;
            if (c.dpad.y > 0 || keys.down) inY += 1;
        }

        const hasInput = (inX !== 0 || inY !== 0);
        const inLen = Math.hypot(inX, inY);
        // Nur bei Auslenkungen > 1.0 kappen – sanfte analoge Beträge (256 Stufen) bleiben 1:1 erhalten!
        if (inLen > 1.0) {
            inX /= inLen;
            inY /= inLen;
        }

        const isShoot = !!(c.btn.a || keys.shoot);
        const isJump = !!(c.btn.b || keys.jump);
        const isCam = !!(c.btn.c || keys.cam);
        const isNitro = !!(c.btn.x || keys.nitro);
        const isHandbrake = !!(c.btn.l1 || c.btn.r1 || keys.handbrake);

        // Kamerawechsel über Taste [C]
        if (isCam && !wasCamPressed) {
            camera.mode = (camera.mode + 1) % 3;
            sound.playCamSwitch();
            createFloatingText(rover.x, rover.y - 45, `CAMERA: ${camera.modes[camera.mode]}`, '#d946ef');
            if (window.GamepadBridge) window.GamepadBridge.sendRumble(60);
        }
        wasCamPressed = isCam;

        // Nitro Boost
        if (isNitro && rover.nitro > 5 && rover.isGrounded) {
            rover.isNitroActive = true;
            rover.nitro = Math.max(0, rover.nitro - 35 * dt);
        } else {
            rover.isNitroActive = false;
            rover.nitro = Math.min(100, rover.nitro + 12 * dt);
        }
        nitroVal.textContent = Math.round(rover.nitro) + '%';

        // Höchstgeschwindigkeit berechnen
        const maxSpd = rover.isNitroActive ? rover.maxNitroSpeed : rover.maxForwardSpeed;

        // Fahrzeug-Bewegung & Beschleunigung
        if (rover.isGrounded) {
            if (hasInput) {
                // Direkte Beschleunigung in die gedrückte Richtung
                const targetVx = inX * maxSpd;
                const targetVy = inY * maxSpd;
                const accelRate = rover.accel * (rover.isNitroActive ? 1.5 : 1.0);

                rover.vx += (targetVx - rover.vx) * Math.min(1, accelRate * dt / maxSpd);
                rover.vy += (targetVy - rover.vy) * Math.min(1, accelRate * dt / maxSpd);

                // Ziel-Winkel für Karosserie
                const targetAngle = Math.atan2(inY, inX);
                let diff = targetAngle - rover.angle;
                while (diff < -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;

                // Karosserie dreht sich flüssig zur Bewegungsrichtung
                const turnSpeed = rover.isNitroActive ? 18 : 13;
                rover.angle += diff * Math.min(1, turnSpeed * dt);

                // Vorderräder schlagen sichtbar in die Kurve ein
                const targetSteer = Math.max(-rover.maxSteer, Math.min(rover.maxSteer, diff * 1.3));
                rover.steerAngle += (targetSteer - rover.steerAngle) * rover.steerSpeed * dt;
            } else {
                // Sanftes Ausrollen bei Loslassen
                rover.vx *= Math.pow(rover.friction, dt * 60);
                rover.vy *= Math.pow(rover.friction, dt * 60);
                if (Math.abs(rover.vx) < 1) rover.vx = 0;
                if (Math.abs(rover.vy) < 1) rover.vy = 0;

                // Räder stellen sich wieder gerade
                rover.steerAngle += (0 - rover.steerAngle) * rover.steerSpeed * dt;
            }

            // Handbremse / Drift
            if (isHandbrake) {
                rover.vx *= Math.pow(0.85, dt * 60);
                rover.vy *= Math.pow(0.85, dt * 60);
            }
        }

        rover.speed = Math.hypot(rover.vx, rover.vy);

        // Position des Rovers aktualisieren
        rover.x += rover.vx * dt;
        rover.y += rover.vy * dt;

        // Spielfeldgrenzen mit Puffer
        if (rover.x < 30) { rover.x = 30; rover.vx = 0; }
        if (rover.x > width - 30) { rover.x = width - 30; rover.vx = 0; }
        if (rover.y < 30) { rover.y = 30; rover.vy = 0; }
        if (rover.y > height - 30) { rover.y = height - 30; rover.vy = 0; }

        // ==========================================
        // SPRUNG-PHYSIK (HYDRAULIK-HOPPER)
        // ==========================================
        if (isJump && rover.isGrounded && !rover.wasJumpPressed) {
            rover.vz = 420; // Katapultiert nach oben
            rover.isGrounded = false;
            sound.playJump();
            createSparks(rover.x, rover.y, '#00f0ff', 12);
            if (window.GamepadBridge) window.GamepadBridge.sendRumble(80);
            createFloatingText(rover.x, rover.y - 40, 'JUMP!', '#00f0ff');
        }
        rover.wasJumpPressed = isJump;

        // Schwerkraft auf Z-Achse
        if (!rover.isGrounded) {
            rover.vz -= rover.gravity * dt;
            rover.z += rover.vz * dt;

            if (rover.z <= 0) {
                rover.z = 0;
                rover.vz = 0;
                rover.isGrounded = true;
                sound.playLand();
                screenShake = 6;
                createSparks(rover.x, rover.y, '#ffffff', 14);
                if (window.GamepadBridge) window.GamepadBridge.sendRumble(160);
            }
        }

        // Reifenspuren beim Beschleunigen, Bremsen oder Driften
        if (rover.isGrounded && (rover.isNitroActive || isHandbrake || (Math.abs(rover.steerAngle) > 0.4 && Math.abs(rover.speed) > 200))) {
            const rearDist = 20;
            const trackWidth = 18;
            const rx = rover.x - Math.cos(rover.angle) * rearDist;
            const ry = rover.y - Math.sin(rover.angle) * rearDist;
            const perpA = rover.angle + Math.PI / 2;

            skidmarks.push({
                x1: rx + Math.cos(perpA) * trackWidth,
                y1: ry + Math.sin(perpA) * trackWidth,
                x2: rx - Math.cos(perpA) * trackWidth,
                y2: ry - Math.sin(perpA) * trackWidth,
                life: 1.0
            });
            if (skidmarks.length > 250) skidmarks.shift();
        }

        // HUD Updates
        const kmh = Math.round(Math.abs(rover.speed) * 0.25);
        speedVal.textContent = kmh;
        jumpVal.textContent = (rover.z / 30).toFixed(1);
        sound.updateEngine(rover.speed, rover.isNitroActive);

        // ==========================================
        // KANONE SCHIESSEN
        // ==========================================
        if (rover.shootCooldown > 0) rover.shootCooldown -= dt;
        if (isShoot && rover.shootCooldown <= 0) {
            rover.shootCooldown = 0.16;
            rover.turretRecoil = 8;
            sound.playShoot();

            // Kugel fliegt in Blickrichtung des Rovers
            const cannonDist = 26;
            const bSpeed = 750;
            bullets.push({
                x: rover.x + Math.cos(rover.angle) * cannonDist,
                y: rover.y + Math.sin(rover.angle) * cannonDist,
                vx: Math.cos(rover.angle) * bSpeed + Math.cos(rover.angle) * rover.speed,
                vy: Math.sin(rover.angle) * bSpeed + Math.sin(rover.angle) * rover.speed,
                life: 1.2
            });

            if (window.GamepadBridge) window.GamepadBridge.sendRumble(25);
        }
        if (rover.turretRecoil > 0) rover.turretRecoil -= dt * 40;

        // Kugeln aktualisieren
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.life -= dt;

            // Treffer auf Kisten
            for (const c of crates) {
                if (Math.abs(b.x - c.x) < c.size / 2 + 4 && Math.abs(b.y - c.y) < c.size / 2 + 4) {
                    c.hp--;
                    c.vx += b.vx * 0.15;
                    c.vy += b.vy * 0.15;
                    createSparks(b.x, b.y, '#ffaa00', 8);
                    bullets.splice(i, 1);
                    break;
                }
            }

            // Treffer auf Fässer (EXPLOSION!)
            for (let j = barrels.length - 1; j >= 0; j--) {
                const bar = barrels[j];
                if (Math.hypot(b.x - bar.x, b.y - bar.y) < bar.radius + 6) {
                    detonateBarrel(bar.x, bar.y);
                    barrels.splice(j, 1);
                    bullets.splice(i, 1);
                    break;
                }
            }

            // Treffer auf Ziel-Drohnen
            for (let j = targets.length - 1; j >= 0; j--) {
                const t = targets[j];
                if (Math.hypot(b.x - t.x, b.y - t.y) < t.radius + 6) {
                    t.hp--;
                    createSparks(b.x, b.y, '#00ff66', 10);
                    bullets.splice(i, 1);
                    if (t.hp <= 0) {
                        createSparks(t.x, t.y, '#00ff66', 30);
                        sound.playExplosion();
                        addScore(250, t.x, t.y);
                        targets.splice(j, 1);
                    }
                    break;
                }
            }

            if (b.life <= 0) bullets.splice(i, 1);
        }

        // ==========================================
        // INTERAKTION MIT KISTEN & RAMPEN
        // ==========================================
        // Schanzen / Sprung-Rampen prüfen
        for (const ramp of ramps) {
            if (rover.isGrounded && Math.abs(rover.x - ramp.x) < ramp.width / 2 && Math.abs(rover.y - ramp.y) < ramp.height / 2) {
                if (rover.speed > 100) {
                    rover.vz = 480; // Katapultiert Drohne hoch in die Luft!
                    rover.isGrounded = false;
                    sound.playJump();
                    createFloatingText(rover.x, rover.y - 40, 'MEGA RAMP JUMP!', '#ffe600');
                    if (window.GamepadBridge) window.GamepadBridge.sendRumble(150);
                }
            }
        }

        // Kisten verschieben & zerstören
        for (let i = crates.length - 1; i >= 0; i--) {
            const cr = crates[i];
            cr.x += cr.vx * dt;
            cr.y += cr.vy * dt;
            cr.vx *= Math.pow(0.1, dt);
            cr.vy *= Math.pow(0.1, dt);

            // Kollision mit Rover
            if (rover.isGrounded && Math.hypot(rover.x - cr.x, rover.y - cr.y) < cr.size / 2 + 22) {
                const pushAngle = Math.atan2(cr.y - rover.y, cr.x - rover.x);
                cr.vx += Math.cos(pushAngle) * Math.abs(rover.speed) * 0.8;
                cr.vy += Math.sin(pushAngle) * Math.abs(rover.speed) * 0.8;
                rover.vx *= 0.6;
                rover.vy *= 0.6;
                rover.speed *= 0.6; // Bremsen beim Aufprall
                createSparks(cr.x, cr.y, '#ffaa00', 4);
            }

            if (cr.hp <= 0) {
                createSparks(cr.x, cr.y, '#ffaa00', 20);
                addScore(100, cr.x, cr.y);
                crates.splice(i, 1);
            }
        }

        // Fässer: Kollision mit fahrendem Rover
        for (let i = barrels.length - 1; i >= 0; i--) {
            const bar = barrels[i];
            if (rover.isGrounded && Math.hypot(rover.x - bar.x, rover.y - bar.y) < bar.radius + 20) {
                detonateBarrel(bar.x, bar.y);
                barrels.splice(i, 1);
                rover.hp = Math.max(0, rover.hp - 25);
                healthBar.style.width = rover.hp + '%';
                rover.vx = -Math.cos(rover.angle) * 280;
                rover.vy = -Math.sin(rover.angle) * 280;
                break;
            }
        }

        // Ziel-Drohnen bewegen
        for (const t of targets) {
            t.x += Math.cos(t.angle) * t.speed * dt;
            t.y += Math.sin(t.angle) * t.speed * dt;
            if (t.x < 40 || t.x > width - 40) t.angle = Math.PI - t.angle;
            if (t.y < 40 || t.y > height - 40) t.angle = -t.angle;
        }

        // Partikel
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= p.decay;
            if (p.life <= 0) particles.splice(i, 1);
        }

        // Texte
        for (let i = floatTexts.length - 1; i >= 0; i--) {
            const ft = floatTexts[i];
            ft.y += ft.vy;
            ft.life -= dt * 1.5;
            if (ft.life <= 0) floatTexts.splice(i, 1);
        }

        // Kamera Position & Zoom an Modus anpassen
        let targetCamX = width / 2;
        let targetCamY = height / 2;
        let targetZoom = 1.0;

        if (camera.mode === 1) {
            // Chase Cam: folgt dem Rover flüssig
            targetCamX = rover.x;
            targetCamY = rover.y;
            targetZoom = 1.35;
        } else if (camera.mode === 2) {
            // Cockpit / Close Cam: nah vor der Motorhaube
            targetCamX = rover.x + Math.cos(rover.angle) * 45;
            targetCamY = rover.y + Math.sin(rover.angle) * 45;
            targetZoom = 1.75;
        }

        camera.x += (targetCamX - camera.x) * Math.min(1, 8 * dt);
        camera.y += (targetCamY - camera.y) * Math.min(1, 8 * dt);
        camera.zoom += (targetZoom - camera.zoom) * Math.min(1, 7 * dt);

        if (screenShake > 0) screenShake = Math.max(0, screenShake - dt * 25);
    }

    function detonateBarrel(x, y) {
        sound.playExplosion();
        screenShake = 16;
        createSparks(x, y, '#ff2200', 40);
        createSparks(x, y, '#ffe600', 25);
        createFloatingText(x, y - 30, 'BOOOM!', '#ff0055');
        if (window.GamepadBridge) window.GamepadBridge.sendRumble(300);

        // Zerstöre umliegende Kisten & Ziele
        for (const c of crates) {
            if (Math.hypot(c.x - x, c.y - y) < 130) c.hp = 0;
        }
        for (let i = targets.length - 1; i >= 0; i--) {
            if (Math.hypot(targets[i].x - x, targets[i].y - y) < 130) {
                addScore(250, targets[i].x, targets[i].y);
                targets.splice(i, 1);
            }
        }
    }

    function addScore(pts, x, y) {
        score += pts;
        scoreVal.textContent = String(score).padStart(5, '0');
        createFloatingText(x, y, `+${pts}`, '#00ff66');
    }

    // ==========================================
    // 5. RENDER ENGINE (60 FPS CANVAS)
    // ==========================================
    function render() {
        ctx.save();
        if (screenShake > 0) {
            ctx.translate((Math.random() - 0.5) * screenShake * 2, (Math.random() - 0.5) * screenShake * 2);
        }

        // Dunkler Asphalt / Test-Hallenboden
        ctx.fillStyle = '#0a0e16';
        ctx.fillRect(0, 0, width, height);

        // Kamera-Transformation anwenden
        ctx.save();
        ctx.translate(width / 2, height / 2);
        ctx.scale(camera.zoom, camera.zoom);
        ctx.translate(-camera.x, -camera.y);

        // Boden-Gitter (Cyber-Grid)
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.04)';
        ctx.lineWidth = 1;
        const gridSize = 60;
        for (let x = 0; x < width; x += gridSize) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
        }
        for (let y = 0; y < height; y += gridSize) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
        }

        // Reifenspuren (Skidmarks)
        for (const sm of skidmarks) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
            ctx.beginPath();
            ctx.arc(sm.x1, sm.y1, 2.5, 0, Math.PI * 2);
            ctx.arc(sm.x2, sm.y2, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // Schanzen / Sprung-Rampen zeichnen
        for (const r of ramps) {
            ctx.save();
            ctx.translate(r.x, r.y);
            ctx.rotate(r.angle);
            ctx.fillStyle = '#ffe600';
            ctx.fillRect(-r.width / 2, -r.height / 2, r.width, r.height);
            ctx.fillStyle = '#000';
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('RAMP ▲', 0, 4);
            ctx.restore();
        }

        // Holzkisten zeichnen
        for (const cr of crates) {
            ctx.save();
            ctx.translate(cr.x, cr.y);
            ctx.fillStyle = '#785028';
            ctx.fillRect(-cr.size / 2, -cr.size / 2, cr.size, cr.size);
            ctx.strokeStyle = '#a67c48';
            ctx.lineWidth = 2;
            ctx.strokeRect(-cr.size / 2, -cr.size / 2, cr.size, cr.size);
            ctx.restore();
        }

        // Explosive Fässer zeichnen
        for (const bar of barrels) {
            ctx.save();
            ctx.translate(bar.x, bar.y);
            ctx.beginPath();
            ctx.arc(0, 0, bar.radius, 0, Math.PI * 2);
            ctx.fillStyle = '#dd1122';
            ctx.fill();
            ctx.strokeStyle = '#ffe600';
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('TNT', 0, 3);
            ctx.restore();
        }

        // Ziel-Drohnen zeichnen
        for (const t of targets) {
            ctx.save();
            ctx.translate(t.x, t.y);
            ctx.beginPath();
            ctx.arc(0, 0, t.radius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 255, 102, 0.2)';
            ctx.fill();
            ctx.strokeStyle = '#00ff66';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, 0, 6, 0, Math.PI * 2);
            ctx.fillStyle = '#00ff66';
            ctx.fill();
            ctx.restore();
        }

        // Kugeln zeichnen
        ctx.fillStyle = '#ffe600';
        ctx.shadowColor = '#ffe600';
        ctx.shadowBlur = 10;
        for (const b of bullets) {
            ctx.beginPath();
            ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.shadowBlur = 0;

        // ==========================================
        // BODENDROHNE RENDERN (MIT 4 RÄDERN & SPRUNG)
        // ==========================================
        // 1. SCHATTEN AM BODEN (bleibt unten wenn Drohne springt!)
        const scale = 1.0 + (rover.z / 180); // Drohne wird beim Springen optisch größer
        const shadowScale = Math.max(0.4, 1.0 - (rover.z / 350));

        ctx.save();
        ctx.translate(rover.x, rover.y);
        ctx.rotate(rover.angle);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.beginPath();
        ctx.ellipse(0, 0, 26 * shadowScale, 16 * shadowScale, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 2. DROHNE IN DER LUFT (Höhe z verschiebt nach oben & vergrößert)
        ctx.save();
        ctx.translate(rover.x, rover.y - rover.z * 0.7); // 3D-Versatz nach oben
        ctx.scale(scale, scale);
        ctx.rotate(rover.angle);

        // Scheinwerfer-Lichtkegel nach vorne
        if (rover.isGrounded) {
            ctx.save();
            const grad = ctx.createRadialGradient(24, 0, 10, 160, 0, 140);
            grad.addColorStop(0, 'rgba(0, 240, 255, 0.35)');
            grad.addColorStop(1, 'rgba(0, 240, 255, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(24, -8);
            ctx.lineTo(160, -60);
            ctx.lineTo(160, 60);
            ctx.lineTo(24, 8);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        // 4 RÄDER (Tires)
        const wheelL = 16, wheelW = 8;

        // Vorderräder (LENKBAR: drehen sich mit steerAngle!)
        const frontX = 18, frontY = 16;

        // Vorne Links
        ctx.save();
        ctx.translate(frontX, -frontY);
        ctx.rotate(rover.steerAngle);
        ctx.fillStyle = '#181b22';
        ctx.fillRect(-wheelL / 2, -wheelW / 2, wheelL, wheelW);
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 1;
        ctx.strokeRect(-wheelL / 2, -wheelW / 2, wheelL, wheelW);
        ctx.restore();

        // Vorne Rechts
        ctx.save();
        ctx.translate(frontX, frontY);
        ctx.rotate(rover.steerAngle);
        ctx.fillStyle = '#181b22';
        ctx.fillRect(-wheelL / 2, -wheelW / 2, wheelL, wheelW);
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 1;
        ctx.strokeRect(-wheelL / 2, -wheelW / 2, wheelL, wheelW);
        ctx.restore();

        // Hinterräder (FEST: Antrieb)
        const rearX = -18, rearY = 16;
        ctx.fillStyle = '#181b22';
        ctx.strokeStyle = rover.isNitroActive ? '#ff0055' : '#475569';
        ctx.lineWidth = 1.5;

        // Hinten Links
        ctx.fillRect(rearX - wheelL / 2, -rearY - wheelW / 2, wheelL, wheelW);
        ctx.strokeRect(rearX - wheelL / 2, -rearY - wheelW / 2, wheelL, wheelW);

        // Hinten Rechts
        ctx.fillRect(rearX - wheelL / 2, rearY - wheelW / 2, wheelL, wheelW);
        ctx.strokeRect(rearX - wheelL / 2, rearY - wheelW / 2, wheelL, wheelW);

        // Chassis / Drohnen-Körper
        ctx.beginPath();
        ctx.roundRect(-22, -14, 44, 28, 6);
        ctx.fillStyle = '#0f1724';
        ctx.fill();
        ctx.strokeStyle = rover.isNitroActive ? '#ffe600' : '#00f0ff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Dach-Sensor / Akkustatus
        ctx.fillStyle = rover.isNitroActive ? '#ffe600' : '#00ff66';
        ctx.fillRect(-8, -6, 16, 12);

        // Drehturm mit Doppel-Kanone
        ctx.save();
        ctx.translate(-rover.turretRecoil, 0); // Rückstoß bei Schuss!
        ctx.fillStyle = '#1c2434';
        ctx.beginPath();
        ctx.arc(4, 0, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Kanonenrohre
        ctx.fillStyle = '#00f0ff';
        ctx.fillRect(10, -4, 14, 3);
        ctx.fillRect(10, 1, 14, 3);
        ctx.restore();

        // Nitro-Auspuff Flamme
        if (rover.isNitroActive) {
            ctx.fillStyle = '#ff0055';
            ctx.beginPath();
            ctx.moveTo(-24, -6);
            ctx.lineTo(-38 - Math.random() * 12, 0);
            ctx.lineTo(-24, 6);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();

        // Partikel rendern
        for (const p of particles) {
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.life;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1.0;

        // Schwebende Texte
        for (const ft of floatTexts) {
            ctx.save();
            ctx.font = 'bold 15px monospace';
            ctx.fillStyle = ft.color;
            ctx.globalAlpha = ft.life;
            ctx.textAlign = 'center';
            ctx.fillText(ft.text, ft.x, ft.y);
            ctx.restore();
        }

        ctx.restore(); // Ende der Kamera-Transformation

        // Feste HUD-Einblendung für den Kamera-Modus
        ctx.save();
        ctx.fillStyle = 'rgba(13, 18, 28, 0.8)';
        ctx.beginPath();
        ctx.roundRect(14, height - 38, 195, 26, 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(217, 70, 239, 0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#d946ef';
        ctx.font = 'bold 10px monospace';
        ctx.fillText(`CAM [C]: ${camera.modes[camera.mode]}`, 22, height - 21);
        ctx.restore();
    }

    requestAnimationFrame(gameLoop);
})();
