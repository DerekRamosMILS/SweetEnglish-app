'use strict';

const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path  = require('path');
const fs    = require('fs');
const https = require('https');

// ── Update checking (free, no signing) ──────────────────────────────────────
// Asks GitHub Releases for the latest version; if it's newer than the running
// app, tells the renderer to show an in-app "update available" card with a
// one-click download link to the new .dmg.
const UPDATE_REPO = 'DerekRamosMILS/SweetEnglish-app';

function compareVersions(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d > 0 ? 1 : -1; }
  return 0;
}

function checkForUpdates(win, { notifyIfCurrent = false } = {}) {
  const opts = {
    hostname: 'api.github.com',
    path: `/repos/${UPDATE_REPO}/releases/latest`,
    headers: { 'User-Agent': 'SweetEnglish-Updater', 'Accept': 'application/vnd.github+json' },
  };
  https.get(opts, (res) => {
    if (res.statusCode !== 200) { res.resume(); if (notifyIfCurrent) win?.webContents.send('update:none'); return; }
    let data = '';
    res.on('data', d => { data += d; });
    res.on('end', () => {
      try {
        const rel = JSON.parse(data);
        const latest = rel.tag_name || rel.name || '';
        if (!latest) return;
        if (compareVersions(latest, app.getVersion()) > 0) {
          const dmg = (rel.assets || []).find(a => /\.dmg$/i.test(a.name));
          win?.webContents.send('update:available', {
            version: String(latest).replace(/^v/, ''),
            current: app.getVersion(),
            url: dmg ? dmg.browser_download_url : rel.html_url,
            notes: rel.body || '',
          });
        } else if (notifyIfCurrent) {
          win?.webContents.send('update:none');
        }
      } catch (err) { logToFile(`[checkForUpdates] ${err.message}`); }
    });
  }).on('error', (err) => { logToFile(`[checkForUpdates] ${err.message}`); });
}

ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('shell:open', (_evt, url) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); });
ipcMain.handle('update:check', () => { if (mainWin) checkForUpdates(mainWin, { notifyIfCurrent: true }); });

// ── Paths ──────────────────────────────────────────────────────────────────────

const IS_DEV      = !app.isPackaged;
const TEACHER_DIR = IS_DEV
  ? path.join(__dirname, '..', 'teacher')
  : path.join(process.resourcesPath, 'teacher');

const LOG_FILE = path.join(app.getPath('logs'), 'app.log');

fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });

// ── State ──────────────────────────────────────────────────────────────────────

let splashWin = null;
let mainWin   = null;

// ── Error guard ──────────────────────────────────────────────────────────────

process.on('uncaughtException',  (err)    => logToFile(`[uncaughtException] ${err.stack || err.message}`));
process.on('unhandledRejection', (reason) => logToFile(`[unhandledRejection] ${reason}`));

function logToFile(msg) {
  try { fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`); } catch (_) {}
}

// ── Splash window ──────────────────────────────────────────────────────────────

function createSplash() {
  splashWin = new BrowserWindow({
    width: 400, height: 300, frame: false, center: true,
    resizable: false, movable: true, alwaysOnTop: true, transparent: true,
    webPreferences: { nodeIntegration: false },
  });
  splashWin.loadFile(path.join(__dirname, 'splash.html'));
}

// ── Main window ────────────────────────────────────────────────────────────────

function createMain() {
  mainWin = new BrowserWindow({
    width: 1200, height: 800, show: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWin.loadFile(path.join(TEACHER_DIR, 'index.html'));

  mainWin.once('ready-to-show', () => {
    if (splashWin && !splashWin.isDestroyed()) { splashWin.close(); splashWin = null; }
    mainWin.show();
    if (IS_DEV) mainWin.webContents.openDevTools();
    // Check for a newer release a few seconds after launch (non-blocking).
    setTimeout(() => checkForUpdates(mainWin), 4000);
  });

  mainWin.on('closed', () => { mainWin = null; });
}

// ── App menu ───────────────────────────────────────────────────────────────────

function buildMenu() {
  const template = [
    {
      label: 'SweetEnglish',
      submenu: [
        { label: 'Buscar actualizaciones…', click: () => { if (mainWin) checkForUpdates(mainWin, { notifyIfCurrent: true }); } },
        { label: 'Abrir carpeta de datos', click: () => shell.openPath(app.getPath('userData')) },
        { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' }, { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Ventana',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'front' }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── Auto-backup to disk (IPC) ────────────────────────────────────────────────
// Keeps the last 10 snapshots in userData/backups so progress survives even a
// full localStorage wipe.

const BACKUP_DIR = path.join(app.getPath('userData'), 'backups');

ipcMain.handle('backup:save', (_evt, json) => {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const name = `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    fs.writeFileSync(path.join(BACKUP_DIR, name), json, 'utf8');
    // Rotate: keep newest 10
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json')).sort();
    while (files.length > 10) fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
    return { ok: true, name };
  } catch (err) {
    logToFile(`[backup:save] ${err.message}`);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('backup:list', () => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return [];
    return fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json')).sort().reverse();
  } catch (_) { return []; }
});

ipcMain.handle('backup:read', (_evt, name) => {
  try {
    const safe = path.basename(name); // prevent path traversal
    return fs.readFileSync(path.join(BACKUP_DIR, safe), 'utf8');
  } catch (_) { return null; }
});

// ── Bootstrap ──────────────────────────────────────────────────────────────────
// No Python, no backend, no dependency install. The app stores all data locally
// (localStorage via LocalDB), so it starts instantly and offline.

app.whenReady().then(() => {
  buildMenu();
  createSplash();
  logToFile('App ready — local-only mode (no backend)');
  createMain();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMain();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
