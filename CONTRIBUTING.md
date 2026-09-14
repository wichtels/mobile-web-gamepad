# Contributing to Mobile Web Gamepad

Thank you for your interest in contributing to **Mobile Web Gamepad**! We welcome ideas, bug reports, and pull requests to make browser gaming with smartphones even better.

## Code of Conduct

This project and everyone participating in it is governed by the [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## How Can I Contribute?

### Reporting Bugs
- Ensure the bug was not already reported by searching through existing [GitHub Issues](https://github.com/wichtels/mobile-web-gamepad/issues).
- If you're unable to find an open issue addressing the problem, open a new one.
- Include a clear title and detailed description, the device model and mobile browser (e.g. Safari on iOS 17 or Chrome on Android 14), and steps to reproduce.

### Suggesting Enhancements
- Open a new issue describing the feature, why it is useful, and how it could be implemented.
- Mockups or sample controller layouts are especially welcome!

### Pull Requests
1. Fork the repository and create your branch from `main`:
   ```bash
   git checkout -b feature/my-new-feature
   ```
2. Keep dependencies minimal: this project deliberately avoids heavy build steps or frontend frameworks. Pure standard HTML5, CSS3, and modern Vanilla JS (ES6+) are preferred.
3. Verify that the server starts cleanly:
   ```bash
   npm test
   npm start
   ```
4. Test controller responsiveness across both desktop browser simulations and actual mobile devices over local Wi-Fi.
5. Commit your changes with clear, descriptive commit messages:
   ```bash
   git commit -m "feat: add rumble vibration feedback on button press"
   ```
6. Push to your fork and submit a Pull Request against `main`.

---

Maintained by **[wichtel.art](https://wichtel.art)** (Torsten Wich Heiter).
