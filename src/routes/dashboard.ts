import type { Environment } from '../types';
import { Hono } from 'hono';

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CROW CCTV — Dashboard</title>
<style>
  :root {
    --bg: #0a0a0f;
    --surface: #12121a;
    --surface-2: #1a1a26;
    --border: #2a2a3a;
    --text: #e0e0e8;
    --text-dim: #8888a0;
    --accent: #6366f1;
    --accent-dim: #4f46e5;
    --green: #22c55e;
    --red: #ef4444;
    --orange: #f59e0b;
    --font: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--font);
    font-size: 13px;
    line-height: 1.5;
    min-height: 100vh;
  }
  header {
    border-bottom: 1px solid var(--border);
    padding: 16px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--surface);
  }
  header h1 { font-size: 16px; font-weight: 600; letter-spacing: -0.5px; }
  header h1 span { color: var(--accent); }
  .status { display: flex; align-items: center; gap: 8px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); }
  .dot.offline { background: var(--red); }

  .toolbar {
    display: flex; gap: 12px; padding: 12px 24px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
    align-items: center; flex-wrap: wrap;
  }
  label { color: var(--text-dim); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
  input, select, button {
    font-family: var(--font);
    font-size: 13px;
    background: var(--surface-2);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 12px;
    outline: none;
  }
  input:focus, select:focus { border-color: var(--accent); }
  button {
    background: var(--accent);
    border-color: var(--accent);
    cursor: pointer;
    font-weight: 500;
    transition: background 0.15s;
  }
  button:hover { background: var(--accent-dim); }
  button.secondary { background: var(--surface-2); border-color: var(--border); }
  button.secondary:hover { border-color: var(--text-dim); }

  .tabs {
    display: flex; gap: 0; border-bottom: 1px solid var(--border);
    background: var(--surface); padding: 0 24px;
  }
  .tab {
    padding: 10px 20px; cursor: pointer;
    color: var(--text-dim); border-bottom: 2px solid transparent;
    transition: all 0.15s; font-size: 12px; text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .tab:hover { color: var(--text); }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); }

  main { padding: 24px; }
  .panel { display: none; }
  .panel.active { display: block; }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 12px;
  }
  .card-header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 8px;
  }
  .card-title { font-weight: 600; font-size: 14px; }
  .badge {
    display: inline-block; padding: 2px 8px; border-radius: 10px;
    font-size: 11px; font-weight: 500;
  }
  .badge.green { background: rgba(34,197,94,0.15); color: var(--green); }
  .badge.red { background: rgba(239,68,68,0.15); color: var(--red); }
  .badge.orange { background: rgba(245,158,11,0.15); color: var(--orange); }
  .badge.purple { background: rgba(99,102,241,0.15); color: var(--accent); }

  .meta { color: var(--text-dim); font-size: 12px; margin-top: 4px; }
  .summary { margin-top: 8px; padding: 10px; background: var(--surface-2); border-radius: 6px; font-size: 12px; white-space: pre-wrap; }

  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
  @media (max-width: 768px) { .grid-2, .grid-3 { grid-template-columns: 1fr; } }

  .stat-card { text-align: center; padding: 20px; }
  .stat-value { font-size: 28px; font-weight: 700; color: var(--accent); }
  .stat-label { color: var(--text-dim); font-size: 11px; margin-top: 4px; text-transform: uppercase; }

  .search-box { display: flex; gap: 8px; margin-bottom: 16px; }
  .search-box input { flex: 1; }

  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 8px 12px; color: var(--text-dim); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--border); }
  td { padding: 8px 12px; border-bottom: 1px solid var(--border); font-size: 12px; }
  tr:hover td { background: var(--surface-2); }

  .empty { text-align: center; padding: 48px; color: var(--text-dim); }
  .loading { text-align: center; padding: 48px; color: var(--text-dim); }
  .error-msg { color: var(--red); padding: 12px; background: rgba(239,68,68,0.1); border-radius: 6px; margin-bottom: 12px; }

  .confidence-bar {
    width: 100%; height: 6px; background: var(--surface-2);
    border-radius: 3px; overflow: hidden; margin-top: 4px;
  }
  .confidence-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }

  pre { font-size: 11px; overflow-x: auto; }
</style>
</head>
<body>

<header>
  <h1><span>CROW</span> CCTV Dashboard</h1>
  <div class="status">
    <div class="dot" id="health-dot"></div>
    <span id="health-text" style="font-size:12px;color:var(--text-dim)">Checking...</span>
  </div>
</header>

<div class="toolbar">
  <div>
    <label>Auth Token</label><br>
    <input type="password" id="auth-token" placeholder="Bearer token" style="width:200px">
  </div>
  <div>
    <label>Store ID</label><br>
    <input type="text" id="store-id" placeholder="e.g. store1" style="width:150px">
  </div>
  <div style="align-self:flex-end">
    <button onclick="loadAll()">Load</button>
  </div>
</div>

<div class="tabs">
  <div class="tab active" data-tab="overview" onclick="switchTab('overview')">Overview</div>
  <div class="tab" data-tab="interactions" onclick="switchTab('interactions')">Interactions</div>
  <div class="tab" data-tab="calibrations" onclick="switchTab('calibrations')">Calibrations</div>
  <div class="tab" data-tab="cameras" onclick="switchTab('cameras')">Cameras</div>
  <div class="tab" data-tab="search" onclick="switchTab('search')">Search</div>
</div>

<main>
  <!-- Overview -->
  <div class="panel active" id="panel-overview">
    <div class="grid-3" id="stats-grid">
      <div class="card stat-card">
        <div class="stat-value" id="stat-interactions">-</div>
        <div class="stat-label">Interactions</div>
      </div>
      <div class="card stat-card">
        <div class="stat-value" id="stat-calibrations">-</div>
        <div class="stat-label">Calibrations</div>
      </div>
      <div class="card stat-card">
        <div class="stat-value" id="stat-cameras">-</div>
        <div class="stat-label">Cameras</div>
      </div>
    </div>
    <div class="card" style="margin-top:12px">
      <div class="card-title">Recent Interactions</div>
      <div id="recent-interactions" class="empty">Load a store to see data</div>
    </div>
  </div>

  <!-- Interactions -->
  <div class="panel" id="panel-interactions">
    <div id="interactions-list" class="empty">Load a store to see interactions</div>
  </div>

  <!-- Calibrations -->
  <div class="panel" id="panel-calibrations">
    <div style="margin-bottom:12px">
      <button class="secondary" onclick="triggerCalibration()">Run Calibration (Today)</button>
    </div>
    <div id="calibrations-list" class="empty">Load a store to see calibrations</div>
  </div>

  <!-- Cameras -->
  <div class="panel" id="panel-cameras">
    <div id="cameras-list" class="empty">Load a store to see camera registry</div>
  </div>

  <!-- Search -->
  <div class="panel" id="panel-search">
    <div class="search-box">
      <input type="text" id="search-query" placeholder="Semantic search across interactions...">
      <button onclick="runSearch()">Search</button>
    </div>
    <div id="search-results" class="empty">Enter a query to search interactions</div>
  </div>
</main>

<script>
const BASE = location.origin;

function getAuth() { return document.getElementById('auth-token').value; }
function getStore() { return document.getElementById('store-id').value; }

async function api(path, opts = {}) {
  const headers = { 'Authorization': 'Bearer ' + getAuth(), ...opts.headers };
  const res = await fetch(BASE + path, { ...opts, headers });
  return res.json();
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));
}

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  if (s < 86400) return Math.floor(s/3600) + 'h ago';
  return Math.floor(s/86400) + 'd ago';
}

function formatTs(unix) {
  return new Date(unix * 1000).toISOString().replace('T', ' ').replace(/\\.\\d+Z/, ' UTC');
}

async function checkHealth() {
  try {
    const data = await fetch(BASE + '/health').then(r => r.json());
    document.getElementById('health-dot').className = 'dot';
    document.getElementById('health-text').textContent = data.status === 'ok' ? 'Online' : 'Degraded';
  } catch {
    document.getElementById('health-dot').className = 'dot offline';
    document.getElementById('health-text').textContent = 'Offline';
  }
}

async function loadAll() {
  const store = getStore();
  if (!store) return alert('Enter a Store ID');
  if (!getAuth()) return alert('Enter an Auth Token');

  await Promise.all([loadInteractions(store), loadCalibrations(store), loadCameras(store)]);
}

async function loadInteractions(store) {
  const el = document.getElementById('interactions-list');
  const recent = document.getElementById('recent-interactions');
  el.innerHTML = '<div class="loading">Loading...</div>';
  try {
    const data = await api('/interactions?store_id=' + encodeURIComponent(store));
    if (!data.ok) throw new Error(data.error);
    const list = data.interactions || [];

    document.getElementById('stat-interactions').textContent = list.length;

    if (list.length === 0) {
      el.innerHTML = '<div class="empty">No interactions found</div>';
      recent.innerHTML = '<div class="empty">No interactions yet</div>';
      return;
    }

    el.innerHTML = list.map(i => {
      const s = i.summary || {};
      return '<div class="card">' +
        '<div class="card-header">' +
          '<div class="card-title">' + i.id.substring(0,8) + '...</div>' +
          '<span class="badge purple">' + (s.periods_analyzed || 0) + '/' + (s.total_periods || 0) + ' periods</span>' +
        '</div>' +
        '<div class="meta">Session: ' + formatTs(i.session_start) + ' — ' + formatTs(i.session_end) + '</div>' +
        (s.text ? '<div class="summary">' + escHtml(s.text) + '</div>' : '') +
        (s.periods_failed > 0 ? '<div class="meta" style="color:var(--orange)">Failed periods: ' + s.periods_failed + '</div>' : '') +
      '</div>';
    }).join('');

    recent.innerHTML = list.slice(0, 3).map(i => {
      const s = i.summary || {};
      return '<div style="padding:8px 0;border-bottom:1px solid var(--border)">' +
        '<strong>' + i.id.substring(0,8) + '</strong> — ' +
        (s.periods_analyzed || 0) + ' periods — ' +
        '<span style="color:var(--text-dim)">' + timeAgo(i.created_at) + '</span>' +
      '</div>';
    }).join('');
  } catch (e) {
    el.innerHTML = '<div class="error-msg">Error: ' + escHtml(e.message) + '</div>';
  }
}

async function loadCalibrations(store) {
  const el = document.getElementById('calibrations-list');
  el.innerHTML = '<div class="loading">Loading...</div>';
  try {
    const data = await api('/calibrations?store_id=' + encodeURIComponent(store));
    if (!data.ok) throw new Error(data.error);
    const list = data.calibrations || [];

    document.getElementById('stat-calibrations').textContent = list.length;

    if (list.length === 0) {
      el.innerHTML = '<div class="empty">No calibrations yet</div>';
      return;
    }

    el.innerHTML = list.map(cal => {
      const r = cal.reasoning || {};
      const conf = r.confidence || 0;
      const confColor = conf >= 0.8 ? 'var(--green)' : conf >= 0.5 ? 'var(--orange)' : 'var(--red)';
      return '<div class="card">' +
        '<div class="card-header">' +
          '<div class="card-title">' + escHtml(cal.date) + '</div>' +
          '<span class="badge ' + (cal.applied ? 'green' : 'orange') + '">' + (cal.applied ? 'Applied' : 'Pending') + '</span>' +
        '</div>' +
        '<div style="display:flex;gap:16px;margin-top:8px">' +
          '<div><label>Confidence</label><div style="font-size:18px;font-weight:700;color:' + confColor + '">' + (conf * 100).toFixed(0) + '%</div>' +
            '<div class="confidence-bar"><div class="confidence-fill" style="width:' + (conf * 100) + '%;background:' + confColor + '"></div></div>' +
          '</div>' +
          '<div><label>Session</label><div>' + (cal.session_id || '-').substring(0,12) + '</div></div>' +
          '<div><label>Adjustments</label><div>' + ((cal.adjustments || []).length || 'None') + '</div></div>' +
        '</div>' +
        (r.analysis ? '<div class="summary">' + escHtml(r.analysis) + '</div>' : '') +
      '</div>';
    }).join('');
  } catch (e) {
    el.innerHTML = '<div class="error-msg">Error: ' + escHtml(e.message) + '</div>';
  }
}

async function loadCameras(store) {
  const el = document.getElementById('cameras-list');
  el.innerHTML = '<div class="loading">Loading...</div>';
  try {
    const data = await api('/registry?store_id=' + encodeURIComponent(store));
    if (!data.ok) throw new Error(data.error);
    const list = data.cameras || [];

    document.getElementById('stat-cameras').textContent = list.length;

    if (list.length === 0) {
      el.innerHTML = '<div class="empty">No cameras registered</div>';
      return;
    }

    el.innerHTML = '<div class="card"><table>' +
      '<thead><tr><th>Camera ID</th><th>Grid Position</th><th>Zone</th><th>Adjacency</th><th>Updated</th></tr></thead>' +
      '<tbody>' + list.map(cam =>
        '<tr>' +
          '<td><strong>' + escHtml(cam.camera_id) + '</strong></td>' +
          '<td>(' + cam.grid_row + ', ' + cam.grid_col + ')</td>' +
          '<td>' + (cam.zone || '-') + '</td>' +
          '<td style="font-size:11px">' + (cam.adjacency ? JSON.stringify(cam.adjacency) : '-') + '</td>' +
          '<td style="color:var(--text-dim)">' + timeAgo(cam.updated_at) + '</td>' +
        '</tr>'
      ).join('') +
      '</tbody></table></div>';
  } catch (e) {
    el.innerHTML = '<div class="error-msg">Error: ' + escHtml(e.message) + '</div>';
  }
}

async function triggerCalibration() {
  const store = getStore();
  if (!store) return alert('Enter a Store ID');
  const today = new Date().toISOString().split('T')[0];
  try {
    const data = await api('/calibrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_id: store, date: today }),
    });
    if (!data.ok) throw new Error(data.error);
    alert('Calibration complete! Confidence: ' + ((data.calibration?.reasoning?.confidence || 0) * 100).toFixed(0) + '%');
    loadCalibrations(store);
  } catch (e) {
    alert('Calibration failed: ' + e.message);
  }
}

async function runSearch() {
  const el = document.getElementById('search-results');
  const q = document.getElementById('search-query').value;
  const store = getStore();
  if (!store || !q) return alert('Enter a Store ID and query');

  el.innerHTML = '<div class="loading">Searching...</div>';
  try {
    const data = await api('/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_id: store, query: q, top_k: 10 }),
    });
    if (!data.ok) throw new Error(data.error);
    const results = data.results || [];

    if (results.length === 0) {
      el.innerHTML = '<div class="empty">No matching interactions found</div>';
      return;
    }

    el.innerHTML = results.map(r => {
      const score = ((r.score || 0) * 100).toFixed(1);
      return '<div class="card">' +
        '<div class="card-header">' +
          '<div class="card-title">' + escHtml(r.interaction_id || r.id || 'unknown').substring(0,12) + '...</div>' +
          '<span class="badge purple">' + score + '% match</span>' +
        '</div>' +
        (r.summary ? '<div class="summary">' + escHtml(typeof r.summary === 'string' ? r.summary : r.summary.text || JSON.stringify(r.summary)) + '</div>' : '') +
      '</div>';
    }).join('');
  } catch (e) {
    el.innerHTML = '<div class="error-msg">Error: ' + escHtml(e.message) + '</div>';
  }
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

checkHealth();
setInterval(checkHealth, 30000);
</script>
</body>
</html>`;

const app = new Hono<{ Bindings: Environment }>();

app.get('/', c => {
  return c.html(DASHBOARD_HTML);
});

export default app;
