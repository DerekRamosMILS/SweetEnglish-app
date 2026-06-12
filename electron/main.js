'use strict';

const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path  = require('path');
const fs    = require('fs');
const http  = require('http');
const { spawn, execFileSync } = require('child_process');

// ── Paths ──────────────────────────────────────────────────────────────────────

const IS_DEV       = !app.isPackaged;
const BACKEND_DIR  = IS_DEV
  ? path.join(__dirname, '..', 'backend')
  : path.join(process.resourcesPath, 'backend');
const TEACHER_DIR  = IS_DEV
  ? path.join(__dirname, '..', 'teacher')
  : path.join(process.resourcesPath, 'teacher');

const APP_SUPPORT_DIR = app.getPath('userData');
const VENDOR_DIR      = path.join(APP_SUPPORT_DIR, 'vendor');
const DB_PATH         = path.join(APP_SUPPORT_DIR, 'english_teacher.db');
const DEPS_MARKER     = path.join(APP_SUPPORT_DIR, '.deps_installed');
const LOG_FILE        = path.join(app.getPath('logs'), 'backend.log');

// Ensure dirs exist
fs.mkdirSync(APP_SUPPORT_DIR, { recursive: true });
fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });

// ── State ──────────────────────────────────────────────────────────────────────

let splashWin   = null;
let mainWin     = null;
let backendProc = null;
let logStream   = null;

// ── Python discovery ───────────────────────────────────────────────────────────

function findPython() {
  const candidates = ['python3', 'python'];
  const extraPaths = [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/opt/homebrew/opt/python3/bin',
    '/usr/bin',
    '/bin',
  ];
  const PATH = [...extraPaths, ...(process.env.PATH || '').split(':')].join(':');

  for (const cmd of candidates) {
    try {
      const out = execFileSync(cmd, ['--version'], {
        env: { ...process.env, PATH },
        timeout: 5000,
      }).toString().trim();
      if (out.startsWith('Python 3')) return { cmd, PATH };
    } catch (_) {
      // try next
    }
  }
  return null;
}

// ── Dependency install ─────────────────────────────────────────────────────────

function installDeps(pythonCmd, envPATH) {
  if (fs.existsSync(DEPS_MARKER)) return;

  const reqFile = path.join(BACKEND_DIR, 'requirements.txt');
  if (!fs.existsSync(reqFile)) return;

  execFileSync(
    pythonCmd,
    ['-m', 'pip', 'install', '-r', reqFile, '--target', VENDOR_DIR, '--quiet'],
    {
      env:     { ...process.env, PATH: envPATH },
      timeout: 120_000,
    },
  );
  fs.writeFileSync(DEPS_MARKER, new Date().toISOString());
}

// ── Backend spawn ──────────────────────────────────────────────────────────────

function startBackend(pythonCmd, envPATH) {
  logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
  logStream.write(`\n[${new Date().toISOString()}] Starting backend\n`);

  backendProc = spawn(
    pythonCmd,
    ['-m', 'uvicorn', 'main:app', '--port', '8000', '--host', '127.0.0.1', '--log-level', 'warning'],
    {
      cwd: BACKEND_DIR,
      env: {
        ...process.env,
        PATH:       envPATH,
        PYTHONPATH: VENDOR_DIR,
        DB_PATH,
      },
    },
  );

  backendProc.stdout.on('data', d => logStream.write(d));
  backendProc.stderr.on('data', d => logStream.write(d));
  backendProc.on('exit', (code, sig) =>
    logStream.write(`[${new Date().toISOString()}] Backend exited code=${code} signal=${sig}\n`),
  );
}

// ── Health check ───────────────────────────────────────────────────────────────

function waitForBackend(retries = 40, delayMs = 500) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      http.get('http://localhost:8000/progress', res => {
        if (res.statusCode < 500) return resolve();
        retry();
      }).on('error', retry);
    };
    const retry = () => {
      attempts++;
      if (attempts >= retries) return reject(new Error('Backend did not start in time'));
      setTimeout(check, delayMs);
    };
    check();
  });
}

// ── Splash window ──────────────────────────────────────────────────────────────

function createSplash() {
  splashWin = new BrowserWindow({
    width:  400,
    height: 300,
    frame:  false,
    center: true,
    resizable:       false,
    movable:         true,
    alwaysOnTop:     true,
    transparent:     true,
    webPreferences:  { nodeIntegration: false },
  });
  splashWin.loadFile(path.join(__dirname, 'splash.html'));
}

// ── Main window ────────────────────────────────────────────────────────────────

function createMain() {
  mainWin = new BrowserWindow({
    width:  1200,
    height: 800,
    show:   false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload:            path.join(__dirname, 'preload.js'),
      contextIsolation:   true,
      nodeIntegration:    false,
    },
  });

  mainWin.loadFile(path.join(TEACHER_DIR, 'index.html'));

  mainWin.once('ready-to-show', () => {
    if (splashWin && !splashWin.isDestroyed()) {
      splashWin.close();
      splashWin = null;
    }
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
        {
          label: 'Abrir carpeta de datos',
          click: () => shell.openPath(APP_SUPPORT_DIR),
        },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Ventana',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'front' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── Last resort error dialog ───────────────────────────────────────────────────

function showBackendError(message) {
  let detail = message;
  try {
    if (fs.existsSync(LOG_FILE)) {
      const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean);
      detail += '\n\nÚltimas líneas del log:\n' + lines.slice(-10).join('\n');
    }
  } catch (_) {}

  dialog.showMessageBoxSync({
    type:    'error',
    title:   'SweetEnglish — Error de inicio',
    message: 'No se pudo iniciar el backend',
    detail,
    buttons: ['Cerrar'],
  });
  app.quit();
}

// ── Bootstrap ──────────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  buildMenu();
  createSplash();

  // 1. Find Python
  const python = findPython();
  if (!python) {
    if (splashWin && !splashWin.isDestroyed()) splashWin.close();
    const choice = dialog.showMessageBoxSync({
      type:    'error',
      title:   'Python no encontrado',
      message: 'SweetEnglish necesita Python 3',
      detail:  'No se encontró Python 3 en tu sistema. Descárgalo desde python.org e instálalo, luego vuelve a abrir la app.',
      buttons: ['Abrir python.org', 'Cerrar'],
    });
    if (choice === 0) shell.openExternal('https://www.python.org/downloads/');
    app.quit();
    return;
  }

  // 2. Install deps (first launch only)
  try {
    installDeps(python.cmd, python.PATH);
  } catch (err) {
    showBackendError(`No se pudieron instalar las dependencias de Python:\n${err.message}`);
    return;
  }

  // 3. Start uvicorn
  startBackend(python.cmd, python.PATH);

  // 4. Wait for backend
  try {
    await waitForBackend();
  } catch (err) {
    showBackendError('El servidor FastAPI no respondió a tiempo.');
    return;
  }

  // 5. Show main window
  createMain();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMain();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── Graceful shutdown ──────────────────────────────────────────────────────────

function killBackend() {
  if (!backendProc) return;
  try {
    backendProc.kill('SIGTERM');
    setTimeout(() => {
      try { backendProc.kill('SIGKILL'); } catch (_) {}
    }, 3000);
  } catch (_) {}
}

app.on('before-quit', killBackend);
process.on('exit',    killBackend);
