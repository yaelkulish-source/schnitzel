const http = require('http');
const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
const ordersRouter = require('./routes/orders');
const db = require('./db');
const demoStore = require('./demo');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ─── middleware ───────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());

// Attach broadcast to every request so route handlers can call req.broadcast()
function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  }
}

app.use((req, _res, next) => {
  req.broadcast = broadcast;
  next();
});

// ─── routes ───────────────────────────────────────────────────────────────────

app.use('/api/orders', ordersRouter);

app.get('/api/booth', async (_req, res) => {
  const booth = await db.getBooth();
  res.json(booth);
});

app.patch('/api/booth', async (req, res) => {
  const { open, open_time, close_time } = req.body;
  if (typeof open !== 'boolean') return res.status(400).json({ error: 'open must be boolean' });
  await db.setBooth({ open, open_time, close_time });
  const booth = await db.getBooth();
  broadcast({ type: 'booth:updated', payload: booth });
  res.json(booth);
});

// ─── demo mode endpoints ──────────────────────────────────────────────────────

app.post('/api/demo/open', (req, res) => {
  broadcast({ type: 'booth:updated', payload: { open: true } });
  res.json({ ok: true });
});

app.post('/api/demo/close', (req, res) => {
  const ids = demoStore.getAllDemoIds();
  demoStore.clear();
  broadcast({ type: 'demo:ended', payload: { ids } });
  broadcast({ type: 'booth:updated', payload: { open: false } });
  res.json({ ok: true });
});

app.get('/health', (_req, res) => res.json({ ok: true, clients: wss.clients.size }));

// ─── websocket ────────────────────────────────────────────────────────────────

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('error', err => console.error('WS client error:', err.message));
});

// Heartbeat every 30s — detects and cleans up dead connections (important on Railway/Render)
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30_000);

wss.on('close', () => clearInterval(heartbeat));

// ─── start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Schnitzel server listening on port ${PORT}`);
});
