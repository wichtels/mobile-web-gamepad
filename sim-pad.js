// Simulates the mobile controller via CLI argv
// node sim-pad.js walk   -> 2.5s forward drive
// node sim-pad.js vert   -> X (drone on), hold Y for 2.5s = ascend
const WebSocket = require('ws');
const mode = process.argv[2] || 'walk';
const ws = new WebSocket('ws://localhost:3000');
ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'join', role: 'controller', room: 'MAIN' }));
  const iv = setInterval(() => {
    const msg = mode === 'vert'
      ? { type: 'input', dpad: { x: 0, y: 0 }, btn: { y: true } }
      : { type: 'input', dpad: { x: 0, y: -1 }, btn: {} };
    ws.send(JSON.stringify(msg));
  }, 100);
  setTimeout(() => { clearInterval(iv); ws.close(); process.exit(0); }, 2600);
});
