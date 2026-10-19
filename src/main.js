const { app, BrowserWindow, Tray, Menu, ipcMain, screen, shell, nativeImage } = require('electron');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { fetchLives } = require('./youtube');
const { createStore } = require('./store');

const RENDERER_DIR = path.join(__dirname, 'renderer');
const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const WIN_WIDTH = 380;
const WIN_HEIGHT = 700;
const MARGIN = 10;
const LIVES_MAX_AGE = 5 * 60 * 1000;
const LIVES_REFRESH_EVERY = 5 * 60 * 1000;
// Ajouté par scripts/build.js (jour.mois.année.heure) ; absent en mode dev.
const VERSION_LABEL = require('../package.json').versionLabel || 'dev';

let tray = null;
let win = null;
let origin = null;
let quitting = false;
let lastBlurHide = 0;
let settings;
let livesCache;
let livesRequest = null;
const player = { id: null, title: null, playing: false };

// Une seule instance : relancer l'app ouvre simplement la fenêtre existante.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
  app.whenReady().then(init);
}

// Sans "Electron/x.y" dans l'user agent, YouTube traite l'app comme un Chrome normal.
app.userAgentFallback = app.userAgentFallback.replace(/ (Electron|lofi-tray)\/\S+/g, '');

app.on('before-quit', () => {
  quitting = true;
});
// L'app vit dans la zone de notification : on ne quitte pas quand la fenêtre se cache.
app.on('window-all-closed', () => {});

async function init() {
  app.setAppUserModelId('com.viraille.lofitray');
  settings = createStore('settings.json', {
    volume: 60,
    muted: false,
    lastId: null,
    lastTitle: null,
    autoplay: false,
    position: null, // { x, y } quand la fenêtre a été déplacée à la main
  });
  livesCache = createStore('lives-cache.json', { lives: [], fetchedAt: 0 });

  origin = await startServer();
  createWindow();
  createTray();
  registerIpc();
  refreshLives();
  // La liste reste à jour même fenêtre fermée (lives terminés / nouveaux lives).
  setInterval(() => refreshLives(true), LIVES_REFRESH_EVERY);

  if (!process.argv.includes('--hidden')) {
    win.webContents.once('did-finish-load', () => showWindow());
  }
}

// ---------------------------------------------------------------------------
// Serveur local : l'interface est servie sur http://127.0.0.1 pour que le
// lecteur YouTube intégré reçoive une vraie origine (il refuse file://).
// ---------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let rel = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
      if (rel === '/') rel = '/index.html';
      const isAsset = rel.startsWith('/assets/');
      const base = isAsset ? ASSETS_DIR : RENDERER_DIR;
      const file = path.normalize(path.join(base, isAsset ? rel.slice('/assets'.length) : rel));
      if (!file.startsWith(base + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      fs.readFile(file, (err, buf) => {
        if (err) {
          res.writeHead(404).end();
          return;
        }
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
          'Cache-Control': 'no-store',
        });
        res.end(buf);
      });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
}

// ---------------------------------------------------------------------------
// Fenêtre popup (cachée par défaut, le lecteur continue de jouer derrière)
// ---------------------------------------------------------------------------

function createWindow() {
  win = new BrowserWindow({
    width: WIN_WIDTH,
    height: WIN_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    title: 'Lofi Tray',
    icon: path.join(ASSETS_DIR, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
      spellcheck: false,
    },
  });

  win.loadURL(`${origin}/index.html`);

  win.on('blur', () => {
    if (win.webContents.isDevToolsOpened()) return;
    lastBlurHide = Date.now();
    win.hide();
  });
  // Fin d'un déplacement par l'utilisateur : on retient la position.
  win.on('moved', () => {
    const [x, y] = win.getPosition();
    settings.set({ position: { x, y } });
    win.webContents.send('settings:changed', getSettings());
  });
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });

  // Les liens (logo YouTube du lecteur, etc.) s'ouvrent dans le navigateur.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(origin)) {
      e.preventDefault();
      openExternal(url);
    }
  });
}

function showWindow(anchor) {
  if (!win) return;
  const saved = savedBounds();
  if (saved) win.setBounds(saved);
  else positionWindow(anchor || trayAnchor() || defaultAnchor());
  win.show();
  win.focus();
  win.webContents.send('window:shown');
}

function toggleWindow(_e, bounds) {
  if (win.isVisible()) {
    win.hide();
  } else if (Date.now() - lastBlurHide > 300) {
    // (le clic sur l'icône fait d'abord perdre le focus : on ne rouvre pas aussitôt)
    showWindow(centerOf(bounds) || trayAnchor() || screen.getCursorScreenPoint());
  }
}

function centerOf(b) {
  return b && b.width ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null;
}

// Quand l'icône est rangée dans les icônes cachées, Windows ne donne pas toujours sa position.
function trayAnchor() {
  return centerOf(tray.getBounds());
}

function defaultAnchor() {
  const { bounds } = screen.getPrimaryDisplay();
  return { x: bounds.x + bounds.width - 1, y: bounds.y + bounds.height - 1 };
}

// Position enregistrée, ramenée dans l'écran si besoin (écran débranché, résolution changée…).
function savedBounds() {
  const p = settings.get().position;
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  const area = screen.getDisplayMatching({ x: p.x, y: p.y, width: WIN_WIDTH, height: WIN_HEIGHT }).workArea;
  const height = Math.min(WIN_HEIGHT, area.height);
  return {
    x: Math.round(Math.min(Math.max(p.x, area.x), area.x + area.width - WIN_WIDTH)),
    y: Math.round(Math.min(Math.max(p.y, area.y), area.y + area.height - height)),
    width: WIN_WIDTH,
    height,
  };
}

function resetPosition() {
  settings.set({ position: null });
  positionWindow(trayAnchor() || defaultAnchor());
  return getSettings();
}

// Place la fenêtre contre la barre des tâches, à côté de l'icône, comme les menus de Windows 11.
function positionWindow(anchor) {
  const display = screen.getDisplayNearestPoint(anchor);
  const area = display.workArea;
  const db = display.bounds;
  const w = WIN_WIDTH;
  const h = Math.min(WIN_HEIGHT, area.height - 2 * MARGIN);

  // Le bord d'écran le plus proche de l'icône = côté de la barre des tâches.
  const edges = {
    bottom: db.y + db.height - anchor.y,
    top: anchor.y - db.y,
    left: anchor.x - db.x,
    right: db.x + db.width - anchor.x,
  };
  const side = Object.keys(edges).reduce((a, k) => (edges[k] < edges[a] ? k : a));

  let x = anchor.x - w / 2;
  let y = area.y + area.height - h - MARGIN;
  if (side === 'top') y = area.y + MARGIN;
  if (side === 'left' || side === 'right') {
    x = side === 'left' ? area.x + MARGIN : area.x + area.width - w - MARGIN;
    y = anchor.y - h / 2;
  }

  x = Math.min(Math.max(x, area.x + MARGIN), area.x + area.width - w - MARGIN);
  y = Math.min(Math.max(y, area.y + MARGIN), area.y + area.height - h - MARGIN);
  win.setBounds({ x: Math.round(x), y: Math.round(y), width: w, height: h });
}

// ---------------------------------------------------------------------------
// Icône dans la zone de notification
// ---------------------------------------------------------------------------

function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(ASSETS_DIR, 'tray.ico')));
  updateTray();
  tray.on('click', toggleWindow);
  tray.on('middle-click', () => sendCommand('toggle'));
  tray.on('right-click', () => tray.popUpContextMenu(buildTrayMenu()));
}

function updateTray() {
  if (!tray) return;
  const status = player.id ? `${player.playing ? '▶' : '⏸'} ${player.title}` : 'Clique pour choisir un live';
  tray.setToolTip(truncate(`Lofi Tray — ${status}`, 120));
}

function buildTrayMenu() {
  const lives = livesCache.get().lives;
  const menuText = (s, max) => truncate(s, max).replace(/&/g, '&&');
  return Menu.buildFromTemplate([
    { label: player.id ? menuText(player.title, 48) : 'Aucun live en cours', enabled: false },
    {
      label: player.playing ? 'Pause' : 'Lecture',
      enabled: !!player.id,
      click: () => sendCommand('toggle'),
    },
    {
      label: 'Lives',
      submenu: lives.length
        ? lives.map((l) => ({
            label: menuText(l.title, 60),
            type: 'radio',
            checked: l.id === player.id,
            click: () => sendCommand('play', l.id),
          }))
        : [{ label: 'Chargement…', enabled: false }],
    },
    { type: 'separator' },
    { label: 'Ouvrir Lofi Tray', click: () => showWindow() },
    {
      label: 'Lancer au démarrage de Windows',
      type: 'checkbox',
      checked: getOpenAtLogin(),
      click: (item) => setOpenAtLogin(item.checked),
    },
    { type: 'separator' },
    { label: 'Quitter', click: () => app.quit() },
  ]);
}

function sendCommand(name, arg) {
  win?.webContents.send('command', name, arg);
}

// ---------------------------------------------------------------------------
// Lancement au démarrage
// ---------------------------------------------------------------------------

function loginItemOptions() {
  // En version portable, l'exe tourne depuis un dossier temporaire : on pointe vers l'original.
  if (process.env.PORTABLE_EXECUTABLE_FILE) return { path: process.env.PORTABLE_EXECUTABLE_FILE, args: ['--hidden'] };
  if (app.isPackaged) return { args: ['--hidden'] };
  return { path: process.execPath, args: [app.getAppPath(), '--hidden'] };
}

function getOpenAtLogin() {
  return app.getLoginItemSettings(loginItemOptions()).openAtLogin;
}

function setOpenAtLogin(enabled) {
  app.setLoginItemSettings({ openAtLogin: enabled, ...loginItemOptions() });
  win?.webContents.send('settings:changed', getSettings());
}

// ---------------------------------------------------------------------------
// Liste des lives
// ---------------------------------------------------------------------------

function refreshLives(force = false) {
  const cached = livesCache.get();
  if (!force && cached.lives.length && Date.now() - cached.fetchedAt < LIVES_MAX_AGE) {
    return Promise.resolve({ ...cached, error: null });
  }
  livesRequest ??= fetchLives()
    .then((lives) => {
      if (!lives.length) return { ...livesCache.get(), error: 'Aucun live trouvé pour le moment' };
      return { ...livesCache.set({ lives, fetchedAt: Date.now() }), error: null };
    })
    .catch((err) => ({ ...livesCache.get(), error: `Impossible de joindre YouTube (${err.message})` }))
    .then((result) => {
      win?.webContents.send('lives:updated', result);
      return result;
    })
    .finally(() => {
      livesRequest = null;
    });
  return livesRequest;
}

// ---------------------------------------------------------------------------
// IPC avec l'interface
// ---------------------------------------------------------------------------

function getSettings() {
  return { ...settings.get(), openAtLogin: getOpenAtLogin(), version: VERSION_LABEL };
}

function registerIpc() {
  const handle = (channel, fn) =>
    ipcMain.handle(channel, (e, ...args) => {
      if (!isTrusted(e)) throw new Error('Origine refusée');
      return fn(...args);
    });
  const on = (channel, fn) =>
    ipcMain.on(channel, (e, ...args) => {
      if (isTrusted(e)) fn(...args);
    });

  handle('lives:get', (force) => refreshLives(!!force));
  handle('settings:get', () => getSettings());
  handle('window:resetPosition', () => resetPosition());
  handle('settings:set', (patch) => {
    const { openAtLogin, ...rest } = patch || {};
    if (typeof openAtLogin === 'boolean') setOpenAtLogin(openAtLogin);
    const allowed = ['volume', 'muted', 'lastId', 'lastTitle', 'autoplay'];
    settings.set(Object.fromEntries(Object.entries(rest).filter(([k]) => allowed.includes(k))));
    return getSettings();
  });

  on('player:state', (state) => {
    Object.assign(player, {
      id: state?.id ?? null,
      title: state?.title ?? null,
      playing: !!state?.playing,
    });
    updateTray();
  });
  on('window:hide', () => win.hide());
  on('app:quit', () => app.quit());
  on('open-external', (url) => openExternal(url));
}

function isTrusted(e) {
  return !!e.senderFrame && e.senderFrame.url.startsWith(`${origin}/`);
}

function openExternal(url) {
  if (/^https:\/\//i.test(url)) shell.openExternal(url);
}

function truncate(s, max) {
  s = String(s ?? '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
