'use strict';

const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');

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
  });

  mainWin.on('closed', () => { mainWin = null; });
}

// ── App menu ───────────────────────────────────────────────────────────────────

function buildMenu() {
  const template = [
    {
      label: 'SweetEnglish',
      submenu: [
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
