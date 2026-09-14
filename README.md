# Universal Mobile Web Gamepad & PC Browser Game Bridge

A low-latency, zero-dependency system to control any PC browser game using a smartphone as a touch gamepad (directly in the mobile browser or installed as an Android PWA), operating seamlessly across local networks (e.g. PC via LAN, smartphone via Wi-Fi).

Developed by **wichtel.art**.

---

## Features

- **🎮 High-Precision 256-Level Analog Joystick:** End-to-end 8-bit quantized analog stick (`0` to `255`, `128` neutral; `-128` to `+127` signed; `-1.0000` to `+1.0000` float) seamlessly integrated into the center of the right D-Pad without affecting exterior pad dimensions.
- **⚡ Ultra-Low Latency (< 5ms):** Direct binary/JSON WebSocket communication over local Wi-Fi / LAN.
- **📱 Ergonomic Edge-Flush Layout:**
  - **Left Flank:** 5-button diamond action cluster (`Y`, `X`, `C`, `A`, `B`) comfortably sized and positioned for thumb access.
  - **Right Flank:** Directional D-Pad (`▲`, `▼`, `◀`, `▶`) with centered floating analog mini-joystick.
  - **Top Shoulders & Menu:** `L1`, `R1`, `SELECT`, `START`, and auto-hiding fullscreen button.
  - **Center:** Transparent `.center-spacer` ensuring clean thumb separation without clutter.
- **📳 Haptic Rumble Feedback:** Web Vibration API integration for realistic collision and action feedback on supported mobile devices.
- **🔌 1-Line Game Integration:** Add a single script `<script src="/network.js"></script>` to any web game to receive real-time gamepad state.

---

## Quick Start

1. **Install & Start Server:**
   ```bash
   node server.js
   ```
2. **Open PC Gamepad Hub:**
   [http://localhost:3000/](http://localhost:3000/)
3. **Launch Reference Demo Game:**
   [http://localhost:3000/example-game/](http://localhost:3000/example-game/)
4. **Connect Smartphone Controller:**
   Scan the QR code displayed on the Hub or Demo, or open in mobile browser:
   `http://<your-local-ip>:3000/controller.html`

---

## Project Structure

```
├── public/                       <-- CORE SYSTEM (REUSABLE FOR ALL GAMES)
│   ├── controller.html           <-- Universal mobile gamepad controller
│   ├── controller.css            <-- Responsive styling with 256-level stick
│   ├── controller.js             <-- Multi-touch engine & WebSocket client
│   ├── network.js                <-- Universal game bridge (window.GamepadBridge)
│   ├── manifest.json             <-- Android PWA configuration
│   └── index.html                <-- Gamepad Hub with QR code & network info
│
├── example-game/                 <-- STANDALONE DEMO (CYBER ROVER REFERENCE)
│   ├── README.md                 <-- Developer notice for AI & game developers
│   ├── index.html                <-- Cyber Rover arena demo
│   ├── game.js                   <-- Rover physics & 60 FPS Canvas renderer
│   └── style.css                 <-- HUD styling & layout
│
├── server.js                     <-- Lightweight Node.js WebSocket & HTTP relay
├── AI_INTEGRATION_GUIDE.md       <-- System specification & prompt guide for AI models
└── README.md                     <-- Project overview
```

---

## License & Author

- **Author:** wichtel.art
- **License:** MIT
