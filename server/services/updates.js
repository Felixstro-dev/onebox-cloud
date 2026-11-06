import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

const CACHE_MS = 15 * 60 * 1000;
const MAINTENANCE_FILE = path.join(config.dataDir, 'maintenance.json');
let releaseCache = { at: 0, data: null };
let stateCache = { at: 0, data: null };

function parseVersion(value) {
  const match = String(value || '').replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

/** true, wenn `latest` neuer als `current` ist. */
export function isNewerVersion(current, latest) {
  const a = parseVersion(current);
  const b = parseVersion(latest);
  if (!a || !b) return false;
  for (let index = 0; index < 3; index += 1) {
    if (b[index] > a[index]) return true;
    if (b[index] < a[index]) return false;
  }
  return false;
}

/**
 * Fragt das neueste GitHub-Release ab. Das Ergebnis wird 15 Minuten
 * zwischengespeichert, damit der Admin-Button und der Hintergrund-Check
 * nicht ins Rate-Limit laufen.
 */
export async function checkForUpdate({ force = false } = {}) {
  if (!force && releaseCache.data && Date.now() - releaseCache.at < CACHE_MS) return releaseCache.data;
  const fallback = {
    current: config.version,
    latest: null,
    updateAvailable: false,
    url: `https://github.com/${config.updateRepo}/releases`,
    notes: '',
    checkedAt: Date.now(),
    error: null,
  };
  try {
    const res = await fetch(`https://api.github.com/repos/${config.updateRepo}/releases/latest`, {
      headers: {
        'User-Agent': 'onebox-update-check',
        Accept: 'application/vnd.github+json',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) {
      // Noch kein Release veröffentlicht.
      releaseCache = { at: Date.now(), data: fallback };
      return fallback;
    }
    if (!res.ok) throw new Error(`GitHub antwortet mit HTTP ${res.status}.`);
    const release = await res.json();
    const latest = String(release.tag_name || '').replace(/^v/i, '');
    const data = {
      ...fallback,
      latest: latest || null,
      updateAvailable: isNewerVersion(config.version, latest),
      url: release.html_url || fallback.url,
      notes: String(release.body || '').slice(0, 1200),
    };
    releaseCache = { at: Date.now(), data };
    return data;
  } catch (error) {
    const data = { ...fallback, error: error.message };
    releaseCache = { at: Date.now(), data };
    return data;
  }
}

export function maintenanceState() {
  // Kurzer Cache: der Hook läuft bei jedem Request, ein synchroner
  // Dateizugriff pro Aufruf würde bei vielen Dateien unnötig bremsen.
  if (stateCache.data && Date.now() - stateCache.at < 1000) return stateCache.data;
  let data = { active: false, until: null, startedAt: null };
  try {
    const raw = fs.readFileSync(MAINTENANCE_FILE, 'utf8');
    const state = JSON.parse(raw);
    if (Number(state.until) > Date.now()) data = { ...state, active: true };
    else fs.rmSync(MAINTENANCE_FILE, { force: true });
  } catch {
    // Keine oder kaputte Datei: kein Wartungsmodus.
  }
  stateCache = { at: Date.now(), data };
  return data;
}

export function startMaintenance(seconds, meta = {}) {
  const now = Date.now();
  const state = {
    active: true,
    startedAt: now,
    until: now + Math.max(1, seconds) * 1000,
    reason: meta.reason || 'update',
    version: meta.version || config.version,
  };
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(MAINTENANCE_FILE, JSON.stringify(state, null, 2));
  stateCache = { at: Date.now(), data: state };
  return state;
}

export function clearMaintenance() {
  try { fs.rmSync(MAINTENANCE_FILE, { force: true }); } catch {}
  stateCache = { at: Date.now(), data: { active: false, until: null, startedAt: null } };
}

export function maintenanceSecondsLeft() {
  const state = maintenanceState();
  if (!state.active) return 0;
  return Math.max(1, Math.ceil((state.until - Date.now()) / 1000));
}

/**
 * Stößt Watchtower über dessen interne HTTP-API an. Der eigentliche
 * Pull-/Neustart-Prozess läuft dann außerhalb des Containers weiter.
 */
export async function triggerUpdater() {
  if (!config.updateApiUrl) throw new Error('UPDATE_API_URL ist nicht konfiguriert.');
  const res = await fetch(config.updateApiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.updateApiToken}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });
  if (!res.ok) throw new Error(`Updater antwortet mit HTTP ${res.status}.`);
  return true;
}

/** Selbstständige Wartungsseite – funktioniert ohne Build-Assets und JS-Bundles. */
export function maintenancePage() {
  const state = maintenanceState();
  const targetVersion = state.version || '';
  const startedAt = Number(state.startedAt) || Date.now();
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Onebox – Wartung</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 2rem;
      background: #1a1815; color: #f4efe6; font-family: ui-sans-serif, system-ui, sans-serif; }
    .card { width: min(36rem, 100%); padding: 2.25rem; border: 1px solid #3a352c; border-radius: 1.25rem; background: #221f1b; }
    .eyebrow { margin-bottom: 1.25rem; color: #b9b0a3; font: 600 .72rem/1 ui-sans-serif, system-ui, sans-serif; letter-spacing: .12em; text-transform: uppercase; }
    .mark { width: 3.25rem; height: 3.25rem; display: grid; place-items: center; border-radius: 0.9rem;
      background: #c9a26b; color: #221f1b; font-weight: 700; margin-bottom: 1.5rem; }
    h1 { font: 400 2rem/1.1 Georgia, 'Times New Roman', serif; margin: 0 0 .75rem; }
    p { margin: 0; color: #b9b0a3; line-height: 1.6; }
    .status-row { display: flex; align-items: center; gap: .65rem; margin-top: 1.5rem; color: #e6d9c2; }
    .pulse { width: .55rem; height: .55rem; border-radius: 50%; background: #c9a26b; box-shadow: 0 0 0 0 rgb(201 162 107 / .45); animation: pulse 1.8s ease-out infinite; }
    .meta { margin-top: 1rem; font-size: .82rem; }
    .meta strong { color: #e6d9c2; font-weight: 600; }
    .bar { height: .2rem; margin-top: 1.5rem; border-radius: 99px; background: #3a352c; overflow: hidden; }
    .bar span { display: block; width: 34%; height: 100%; background: #c9a26b; transform: translateX(-120%); animation: progress 1.5s ease-in-out infinite; }
    @keyframes pulse { 70% { box-shadow: 0 0 0 .55rem rgb(201 162 107 / 0); } 100% { box-shadow: 0 0 0 0 rgb(201 162 107 / 0); } }
    @keyframes progress { 100% { transform: translateX(360%); } }
    @media (prefers-reduced-motion: reduce) { .pulse, .bar span { animation: none; } }
    @media (prefers-color-scheme: light) {
      :root { color-scheme: light; }
      body { background: #f6f1e8; color: #231f19; }
      .card { background: #fffdf9; border-color: #e3d9cb; }
      p { color: #6d6357; }
      .status-row, .meta strong { color: #3b3329; }
      .bar { background: #e8ddcd; }
    }
  </style>
</head>
<body>
  <main class="card" role="status" aria-live="polite">
    <div class="eyebrow">Onebox · Live-Status</div>
    <div class="mark" aria-hidden="true">ob</div>
    <h1>Onebox wird aktualisiert</h1>
    <p id="status">Die Datenbank-Migrationen werden angewendet. Onebox wartet auf den neuen Container.</p>
    <div class="status-row"><span class="pulse" aria-hidden="true"></span><span>Verbindung wird automatisch geprüft</span></div>
    <p class="meta">Zielversion <strong>${targetVersion || 'wird geprüft'}</strong> · vergangen <strong id="elapsed">0 s</strong></p>
    <div class="bar" aria-hidden="true"><span id="bar"></span></div>
  </main>
  <script>
    (function () {
      var targetVersion = ${JSON.stringify(targetVersion)};
      var startedAt = ${startedAt};
      var elapsed = document.getElementById('elapsed');
      var status = document.getElementById('status');
      function render() {
        elapsed.textContent = Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) + ' s';
      }
      render();
      var timer = setInterval(render, 1000);
      async function poll() {
        try {
          var responses = await Promise.all([
            fetch('/api/v1/system/maintenance', { cache: 'no-store' }),
            fetch('/api/v1/system/health', { cache: 'no-store' }),
          ]);
          var state = await responses[0].json();
          var health = await responses[1].json();
          var ready = health.status === 'ok' && (!targetVersion || health.version === targetVersion);
          if (ready && !state.active) {
            clearInterval(timer);
            status.textContent = 'Onebox ist wieder erreichbar. Du wirst weitergeleitet …';
            window.location.replace('/');
            return;
          }
          status.textContent = ready
            ? 'Der neue Container läuft. Abschluss wird geprüft …'
            : 'Onebox wartet auf den neuen Container. Die Verbindung wird automatisch geprüft.';
          render();
        } catch (error) {
          status.textContent = 'Onebox startet gerade neu. Die Verbindung wird automatisch wiederhergestellt.';
          render();
        }
      }
      poll();
      setInterval(poll, 2000);
    })();
  </script>
</body>
</html>`;
}
