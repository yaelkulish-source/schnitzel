// REST + WebSocket client shared by all screens.
//
// Production setup: open the browser console on your deployed frontend and run:
//   localStorage.setItem('apiBase', 'https://your-app.railway.app')
// This persists across page reloads.

const API_BASE = localStorage.getItem('apiBase') || 'https://schnitzel.onrender.com';
const WS_URL   = API_BASE.replace(/^http/, 'ws');

// ─── REST ─────────────────────────────────────────────────────────────────────

const api = {
  async get(path) {
    const res = await fetch(API_BASE + path);
    if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
    return res.json();
  },

  async post(path, body) {
    const res = await fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `POST ${path} → ${res.status}`);
    return data;
  },

  async patch(path, body) {
    const res = await fetch(API_BASE + path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`PATCH ${path} → ${res.status}`);
    return res.json();
  },

  async delete(path) {
    const res = await fetch(API_BASE + path, { method: 'DELETE' });
    if (!res.ok) throw new Error(`DELETE ${path} → ${res.status}`);
    return res.json();
  },
};

// ─── WebSocket (auto-reconnect) ───────────────────────────────────────────────

const ws = {
  _socket: null,
  _listeners: {},
  _reconnectTimer: null,

  connect() {
    if (this._socket && this._socket.readyState === WebSocket.OPEN) return;

    this._socket = new WebSocket(WS_URL);

    this._socket.onopen = () => {
      clearTimeout(this._reconnectTimer);
      this._emit('_connected');
    };

    this._socket.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        this._emit(msg.type, msg.payload);
      } catch { /* ignore malformed frames */ }
    };

    this._socket.onclose = () => {
      this._emit('_disconnected');
      this._reconnectTimer = setTimeout(() => this.connect(), 3000);
    };

    this._socket.onerror = () => this._socket.close();
  },

  on(type, fn) {
    (this._listeners[type] ??= []).push(fn);
  },

  _emit(type, data) {
    (this._listeners[type] ?? []).forEach(fn => fn(data));
  },
};
