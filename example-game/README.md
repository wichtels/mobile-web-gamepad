# DEMO & REFERENCE GAME (CYBER ROVER)

> ⚠️ **IMPORTANT NOTICE FOR AI ASSISTANTS & DEVELOPERS:**  
> **This folder `example-game/` is exclusively a demonstration and integration reference.**  
> When building or integrating a **new web game**:
> 1. **DO NOT** copy or import the game logic from this directory (`game.js`, `style.css`, etc.)!
> 2. In your new game, include **only** the universal bridge script:
>    ```html
>    <script src="/network.js"></script>
>    ```
> 3. Refer to `AI_INTEGRATION_GUIDE.md` in the root directory for API and integration details.

---

## Purpose of this Reference

- Demonstrates direct polling of `window.GamepadBridge.inputs` (`dpad`, `stick`, `stick8`, `btn`).
- Demonstrates smooth, high-precision proportional driving using the 256-level analog mini-stick (`stick.levelX/Y: 0..255`, `stick.rawX/Y: -128..+127`, `stick.x/y: -1.0000..+1.0000`).
- Demonstrates edge-flush mobile ergonomics (action diamond on left, D-Pad with centered mini-joystick on right).
- Demonstrates bidirectional haptic rumble feedback (`window.GamepadBridge.sendRumble(...)`).
- Demonstrates multi-perspective camera switching via button `[C]`.
