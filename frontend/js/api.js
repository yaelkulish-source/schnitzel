// REST + WebSocket client shared by all screens.
//
// Production setup: open the browser console on your deployed frontend and run:
//   localStorage.setItem('apiBase', 'https://your-app.railway.app')
// This persists across page reloads.

const API_BASE = localStorage.getItem('apiBase') || 'https://schnitzel.onrender.com';
const WS_URL   = API_BASE.replace(/^http/, 'ws');
const REQUEST_TIMEOUT_MS = 10000;

// Wraps fetch with a hard timeout so callers never hang forever waiting on a
// slow/unreachable server — important since every request now depends on a
// remote MongoDB connection instead of a local file.
async function fetchWithTimeout(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(API_BASE + path, { ...options, signal: controller.signal });
    // 502/503/504 = the server itself is down or restarting (e.g. Render deploy).
    if (res.status >= 502 && res.status <= 504) connection.reportFailure(new Error(`HTTP ${res.status} ${path}`));
    else connection.reportSuccess();
    return res;
  } catch (err) {
    const e = err.name === 'AbortError' ? new Error('השרת לא הגיב בזמן — נסה שוב') : err;
    e.offline = true; // network error / timeout — no answer from the server
    connection.reportFailure(e, path);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ─── REST ─────────────────────────────────────────────────────────────────────

const api = {
  async get(path) {
    const res = await fetchWithTimeout(path);
    if (!res.ok) throw Object.assign(new Error(`GET ${path} → ${res.status}`), { status: res.status });
    return res.json();
  },

  async post(path, body) {
    const res = await fetchWithTimeout(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `POST ${path} → ${res.status}`), { status: res.status });
    return data;
  },

  async patch(path, body) {
    const res = await fetchWithTimeout(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `PATCH ${path} → ${res.status}`), { status: res.status });
    return data;
  },

  async delete(path) {
    const res = await fetchWithTimeout(path, { method: 'DELETE' });
    if (!res.ok) throw Object.assign(new Error(`DELETE ${path} → ${res.status}`), { status: res.status });
    return res.json();
  },
};

// ─── connection status banner (reception / fryer / spreads) ──────────────────
// Opt-in: a page calls connection.start(); the order form doesn't, so it is
// unchanged. While the server can't be reached a non-blocking banner explains
// what to do, the server is re-checked every few seconds, and once it answers
// again (REST + WebSocket) the page's onRecover() reloads the data.

const RETRY_MS = 5000;

function isConnectionError(err) {
  return !!err && (err.offline || err.name === 'TypeError' || (err.status >= 502 && err.status <= 504));
}

const connection = {
  started:   false,
  wsOpen:    false,
  restDown:  false,
  wasDown:   false,  // something failed since the last good state → reload on recovery
  _opts:     null,
  _probe:    null,
  _grace:    null,
  _bannerOn: false,

  start({ dotId, textId, onRecover }) {
    this.started = true;
    this._opts = { dotId, textId, onRecover };
    injectConnectionStyles();
    ws.on('_connected',    () => { this.wsOpen = true;  this._update(); });
    ws.on('_disconnected', () => { this.wsOpen = false; this.wasDown = true; this._update(); });
    // First WebSocket connect may take a moment — only complain after a grace period.
    this._grace = setTimeout(() => { this._grace = null; this._update(); }, 6000);
    this._update();
  },

  reportFailure(err, path) {
    if (!this.started) return;
    console.error('[connection] request failed', path || '', err);
    this.restDown = true;
    this.wasDown  = true;
    this._update();
  },

  reportSuccess() {
    if (!this.started || !this.restDown) return;
    this.restDown = false;
    this._update();
  },

  _update() {
    if (!this.started) return;
    const up = this.wsOpen && !this.restDown;

    const dot  = document.getElementById(this._opts.dotId);
    const text = document.getElementById(this._opts.textId);
    if (dot)  dot.className    = up ? 'connected' : '';
    if (text) text.textContent = up ? 'מחובר' : (this._grace && !this.restDown ? 'מתחבר…' : 'מנותק');

    const showBanner = !up && (this.restDown || !this._grace);
    this._setBanner(showBanner);

    if (!up && !this._probe) {
      this._probe = setInterval(() => this._check(), RETRY_MS);
    } else if (up && this._probe) {
      clearInterval(this._probe);
      this._probe = null;
    }

    if (up && this.wasDown) {
      this.wasDown = false;
      console.info('[connection] back online — reloading data');
      try { this._opts.onRecover?.(); } catch (e) { console.error('[connection] reload failed', e); }
    }
  },

  async _check() {
    try {
      await fetchWithTimeout('/health');  // success → reportSuccess()
    } catch { /* still down — banner stays, next try in RETRY_MS */ }
    if (!this.wsOpen) ws.connect();
  },

  _setBanner(on) {
    let el = document.getElementById('conn-banner');
    if (on && !el) {
      el = document.createElement('div');
      el.id = 'conn-banner';
      el.setAttribute('role', 'status');
      el.innerHTML = `
        <div class="conn-banner-title">⚠️ אין חיבור לשרת – בודקים שוב…</div>
        <div class="conn-banner-help">בדקו את האינטרנט בטאבלט (Wi-Fi / נתונים). המסך יתעדכן לבד כשהחיבור יחזור.</div>`;
      document.body.appendChild(el);
    }
    if (el) el.style.display = on ? '' : 'none';
    if (on !== this._bannerOn) {
      this._bannerOn = on;
      if (on) console.warn('[connection] server unreachable — retrying every', RETRY_MS / 1000, 's');
    }
  },

  // Non-blocking message for a failed action (replaces alert popups).
  actionFailed(label, err) {
    console.error(`[action] ${label}`, err);
    const msg = isConnectionError(err)
      ? `${label} — לא נשמר: אין חיבור לשרת. נסו שוב כשהחיבור יחזור.`
      : `${label}${err?.message ? `: ${err.message}` : ''}`;
    showToast(msg);
  },
};

function showToast(msg) {
  injectConnectionStyles();
  let box = document.getElementById('toast-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast-box';
    document.body.appendChild(box);
  }
  const t = document.createElement('button');
  t.className = 'toast';
  t.textContent = `⚠️ ${msg}`;
  t.addEventListener('click', () => t.remove());
  box.appendChild(t);
  setTimeout(() => t.remove(), 7000);
}

function injectConnectionStyles() {
  if (document.getElementById('conn-styles')) return;
  const style = document.createElement('style');
  style.id = 'conn-styles';
  style.textContent = `
    #conn-banner {
      position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%);
      z-index: 400; width: min(640px, calc(100% - 24px));
      padding: 14px 18px; border-radius: 14px;
      background: #b91c1c; color: #fff; direction: rtl; text-align: center;
      box-shadow: 0 6px 24px rgba(0,0,0,.35); pointer-events: none;
      font-family: inherit;
    }
    .conn-banner-title { font-size: 1.3rem; font-weight: 900; }
    .conn-banner-help  { font-size: 1rem; font-weight: 600; margin-top: 4px; opacity: .95; }
    #toast-box {
      position: fixed; left: 50%; top: 14px; transform: translateX(-50%);
      z-index: 450; width: min(560px, calc(100% - 24px));
      display: flex; flex-direction: column; gap: 8px; direction: rtl;
    }
    .toast {
      padding: 12px 16px; border: none; border-radius: 12px;
      background: #7f1d1d; color: #fff; font: inherit; font-size: 1.05rem; font-weight: 700;
      text-align: right; cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,.3);
    }`;
  document.head.appendChild(style);
}

// ─── WebSocket (auto-reconnect) ───────────────────────────────────────────────

const ws = {
  _socket: null,
  _listeners: {},
  _reconnectTimer: null,

  connect() {
    if (this._socket && (this._socket.readyState === WebSocket.OPEN ||
                         this._socket.readyState === WebSocket.CONNECTING)) return;
    clearTimeout(this._reconnectTimer);

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

    this._socket.onclose = (e) => {
      console.warn('[ws] closed', e.code, e.reason || '');
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
