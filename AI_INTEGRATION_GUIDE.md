# SYSTEM PROMPT & SPECIFICATION FOR AI ASSISTANTS:
# Universal Mobile Web Gamepad & PC Browser Game Bridge

This document serves as the complete system architecture and integration guide for AI coding assistants (ChatGPT, Claude, Cursor, Copilot, Gemini, Antigravity) and human developers building new games or adapting existing web games for the mobile touch gamepad.

> ⚠️ **STRICT DIRECTORY SEPARATION (CRITICAL FOR AI ASSISTANTS):**  
> - **`public/`**: Contains the **CORE SYSTEM** (Mobile controller `controller.*`, universal bridge `network.js`, hub `index.html`).
> - **`example-game/`**: Contains the **DEMO REFERENCE GAME (Cyber Rover)**. This is solely for testing and verification!
> - **RULE FOR NEW GAMES:** **NEVER** import or copy files or game code from `example-game/`! Any new web game simply embeds:
>   ```html
>   <script src="/network.js"></script>
>   ```

---

## 1. System Architecture Overview

The system consists of three completely decoupled components:

1. **Relay Server (`server.js`):**
   - Node.js HTTP & WebSocket relay server (default port: `3000`).
   - Routes controller inputs and rumble commands with ultra-low latency (< 5ms) over local Wi-Fi / LAN via room `"MAIN"`.
   - Generates local Wi-Fi QR code and provides the `/api/info` discovery endpoint.

2. **Mobile Smartphone Controller (`public/controller.html`, `controller.css`, `controller.js`):**
   - Universal Progressive Web App (PWA) in landscape orientation.
   - Game-agnostic design: No hardcoded game labels, flexible for any title.
   - **Ergonomics & 0px Edge-Flush Layout:**
     - **Right Flank (Right Thumb):** Large directional D-Pad (`▲`, `▼`, `◀`, `▶`) flush to the right display border. In the center of the cross sits a damped **Mini-Joystick** featuring at least **256 levels end-to-end** for smooth 360° steering and throttle control.
     - **Left Flank (Left Thumb):** 5-button action diamond cluster with comfortable spacing:
       - `Y` (top, green)
       - `X` (left, yellow)
       - `C` (center, purple – e.g. camera switch / special action)
       - `A` (right, magenta)
       - `B` (bottom, cyan)
     - **Center (Spacer):**
       - Clean transparent `.center-spacer` ensuring clear thumb separation without clutter.
     - **Top Shoulders & Menu:** Shoulder triggers `L1` and `R1`, `SELECT`, `START`, and an auto-hiding fullscreen button.

3. **Client Bridge (`public/network.js`):**
   - Zero-dependency client library included in any PC web game.
   - Automatically establishes a WebSocket connection to `ws://<host>:3000` and initializes the global object `window.GamepadBridge`.

---

## 2. The API: `window.GamepadBridge`

In any new or existing web game, simply add:
```html
<script src="/network.js"></script>
```
`window.GamepadBridge` is immediately available on `window`.

### A. Polling State in Game Loop (`update(dt)`)

```javascript
const inputs = window.GamepadBridge.inputs;

// 1. D-Pad & 256-Level Analog Stick (Directional 2D Movement)
// NOTE: Cap vector magnitude at 1.0; DO NOT blindly divide by length!
inputs.dpad.x;        // -1 = Left,  0 = Neutral, 1 = Right (Digital)
inputs.dpad.y;        // -1 = Up,    0 = Neutral, 1 = Down  (Digital)

// High-precision analog joystick (256 discrete levels end-to-end):
inputs.stick.x;       // -1.0000 to +1.0000 (continuous normalized float)
inputs.stick.y;       // -1.0000 to +1.0000 (continuous normalized float)
inputs.stick.levelX;  // 0 .. 255 (256 discrete steps: 0 = Full Left, 128 = Neutral, 255 = Full Right)
inputs.stick.levelY;  // 0 .. 255 (256 discrete steps: 0 = Full Up,   128 = Neutral, 255 = Full Down)
inputs.stick.rawX;    // -128 .. +127 (signed 8-bit integer)
inputs.stick.rawY;    // -128 .. +127 (signed 8-bit integer)
inputs.stick8.x;      // 0 .. 255 (direct 8-bit byte for retro engines)
inputs.stick8.y;      // 0 .. 255 (direct 8-bit byte for retro engines)

// 2. Action Buttons (Booleans: true = pressed, false = released)
inputs.btn.a;         // Primary action (e.g. Fire / Confirm)
inputs.btn.b;         // Secondary action (e.g. Jump / Cancel)
inputs.btn.c;         // Center action button (e.g. Camera Switch / Ability)
inputs.btn.x;         // Left flank button (e.g. Turbo / Sprint / Nitro)
inputs.btn.y;         // Top button (e.g. Secondary weapon / Inventory)
inputs.btn.l1;        // Left shoulder button (e.g. Aim / Drift)
inputs.btn.r1;        // Right shoulder button (e.g. Handbrake)
inputs.btn.start;     // Pause / Menu
inputs.btn.select;    // Reset / Select
```

### B. Event Emitter (For One-Shot Triggers & Toggles)

```javascript
// Edge-triggered button events (fires exactly ONCE on press):
window.GamepadBridge.on('buttondown', ({ button }) => {
    // 'button' is one of: 'a' | 'b' | 'c' | 'x' | 'y' | 'l1' | 'r1' | 'start' | 'select'
    if (button === 'c') {
        cycleCameraView();
    }
    if (button === 'start') {
        togglePauseMenu();
    }
});

// Button release events:
window.GamepadBridge.on('buttonup', ({ button }) => {
    if (button === 'x') {
        deactivateNitroBoost();
    }
});

// Connection state lifecycle:
window.GamepadBridge.on('connect', ({ count }) => {
    console.log(`Controller connected! Active count: ${count}`);
});
window.GamepadBridge.on('disconnect', () => {
    console.log('Controller disconnected.');
});
```

### C. Haptic Rumble Feedback

Send vibration pulses to the smartphone at any time:
```javascript
// Duration in milliseconds
window.GamepadBridge.sendRumble(150); // e.g. for impacts, explosions, landings
```

---

## 3. Integration Patterns

### Pattern 1: Direct Game Loop (Phaser, PixiJS, Three.js, Canvas 2D)
```javascript
function gameLoop(dt) {
    const bridge = window.GamepadBridge;
    if (bridge && bridge.isConnected) {
        // Read 256-level analog stick or digital D-Pad
        let inX = bridge.inputs.stick.x;
        let inY = bridge.inputs.stick.y;

        // Fallback to D-pad if stick is near center
        if (Math.hypot(inX, inY) < 0.03) {
            inX = bridge.inputs.dpad.x;
            inY = bridge.inputs.dpad.y;
        }

        // Cap magnitude at 1.0 (preserves all 256 analog speed levels!)
        const mag = Math.hypot(inX, inY);
        if (mag > 1.0) {
            inX /= mag;
            inY /= mag;
        }

        player.vx = inX * player.maxSpeed;
        player.vy = inY * player.maxSpeed;

        if (bridge.inputs.btn.a) player.shoot();
        if (bridge.inputs.btn.b) player.jump();
    }
}
```

### Pattern 2: Zero-Code Keyboard Adapter for Existing Web Games
If adapting a legacy game that listens exclusively to keyboard events (`ArrowLeft`, `ArrowRight`, `Space`):

```javascript
function dispatchKey(code, type) {
    window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
}

// Button mapping
window.GamepadBridge.on('buttondown', ({ button }) => {
    if (button === 'a') dispatchKey('Space', 'keydown');
    if (button === 'b') dispatchKey('KeyK', 'keydown');
    if (button === 'c') dispatchKey('KeyC', 'keydown');
    if (button === 'start') dispatchKey('Enter', 'keydown');
});
window.GamepadBridge.on('buttonup', ({ button }) => {
    if (button === 'a') dispatchKey('Space', 'keyup');
    if (button === 'b') dispatchKey('KeyK', 'keyup');
    if (button === 'c') dispatchKey('KeyC', 'keyup');
    if (button === 'start') dispatchKey('Enter', 'keyup');
});

// D-Pad to arrow keys
let lastD = { x: 0, y: 0 };
window.GamepadBridge.on('input', (inputs) => {
    const d = inputs.dpad;
    if (d.x !== lastD.x) {
        if (d.x === -1) dispatchKey('ArrowLeft', 'keydown');
        else if (lastD.x === -1) dispatchKey('ArrowLeft', 'keyup');

        if (d.x === 1) dispatchKey('ArrowRight', 'keydown');
        else if (lastD.x === 1) dispatchKey('ArrowRight', 'keyup');
    }
    if (d.y !== lastD.y) {
        if (d.y === -1) dispatchKey('ArrowUp', 'keydown');
        else if (lastD.y === -1) dispatchKey('ArrowUp', 'keyup');

        if (d.y === 1) dispatchKey('ArrowDown', 'keydown');
        else if (lastD.y === 1) dispatchKey('ArrowDown', 'keyup');
    }
    lastD = { ...d };
});
```

---

## 4. Mandatory Rules for AI Assistants

1. **Never rename button identifiers in `network.js`:**  
   Buttons must remain strictly: `'a'`, `'b'`, `'c'`, `'x'`, `'y'`, `'l1'`, `'r1'`, `'start'`, `'select'`.
2. **Directional standards:**  
   - X axis: `-1` = Left, `+1` = Right.
   - Y axis: `-1` = Up (forward/north), `+1` = Down (backward/south).
3. **Always preserve analog magnitude (DO NOT normalize blindly):**  
   Never divide `inX` and `inY` by `inLen` unless `inLen > 1.0`! Blind division converts fine analog movements into 100% full speed, destroying analog precision.
4. **Mini-Joystick 256-level quantization:**  
   - `inputs.stick.levelX` and `levelY` provide exact `0..255` integer values (`128` neutral).
   - `inputs.stick.rawX` and `rawY` provide `-128..+127`.
   - Simultaneous update of `inputs.dpad` ensures backwards compatibility with older games.
5. **Always provide keyboard fallback:**  
   Any game should remain playable via WASD / Arrow keys for desktop testing and debugging without mobile pairing.
