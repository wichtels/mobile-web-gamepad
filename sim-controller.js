const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3000');
ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'join', role: 'controller', room: 'MAIN' }));
  let n = 0;
  const iv = setInterval(() => {
    n++;
    ws.send(JSON.stringify({ type: 'input', dpad: { x: 0, y: -1 }, stick: { x: 0, y: -1 }, btn: { a: n % 4 < 2 } }));
  }, 100);
  setTimeout(() => { clearInterval(iv); process.exit(0); }, 4500);
});
