const {
  app,
  BrowserWindow,
  screen,
  ipcMain,
  shell,
  safeStorage,
  Notification,
} = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const crypto = require('node:crypto');

let island;
let resizeTimer = null;
let notificationBridge = null;
let notificationStartupTimer = null;
let notificationAccessStatus = 'disabled';
const collapsed = { width: 370, height: 76 };
const expanded = { width: 520, height: 570 };
const tucked = { width: 76, height: 14 };
const spotifyScopes = 'user-read-playback-state user-modify-playback-state';
const spotifyRedirectUri = 'http://127.0.0.1:43821/callback';

function spotifyTokenPath() {
  return path.join(app.getPath('userData'), 'spotify-token.bin');
}

function readToken() {
  const tokenPath = spotifyTokenPath();
  if (!fs.existsSync(tokenPath)) return null;
  if (!safeStorage.isEncryptionAvailable())
    throw new Error('O armazenamento seguro do Windows não está disponível.');
  return JSON.parse(safeStorage.decryptString(fs.readFileSync(tokenPath)));
}

function saveToken(token) {
  if (!safeStorage.isEncryptionAvailable())
    throw new Error('O armazenamento seguro do Windows não está disponível.');
  fs.writeFileSync(spotifyTokenPath(), safeStorage.encryptString(JSON.stringify(token)));
}

function saveClientId(clientId) {
  const settingsPath = path.join(app.getPath('userData'), 'settings.json');
  fs.writeFileSync(settingsPath, JSON.stringify({ spotifyClientId: clientId }, null, 2), 'utf8');
}

function notificationPreferencesPath() {
  return path.join(app.getPath('userData'), 'notification-preferences.json');
}

function readNotificationPreferences() {
  try {
    const preferences = JSON.parse(fs.readFileSync(notificationPreferencesPath(), 'utf8'));
    return { gmail: Boolean(preferences.gmail), whatsapp: Boolean(preferences.whatsapp) };
  } catch {
    return { gmail: false, whatsapp: false };
  }
}

function saveNotificationPreferences(preferences) {
  fs.writeFileSync(notificationPreferencesPath(), JSON.stringify(preferences, null, 2), 'utf8');
}

function logNotificationDiagnostic(event, detail = '') {
  try {
    const logPath = path.join(app.getPath('userData'), 'notification-bridge.log');
    const safeDetail = String(detail || '')
      .replace(/[\r\n]+/g, ' ')
      .slice(0, 1000);
    fs.appendFileSync(
      logPath,
      `${new Date().toISOString()} ${event}${safeDetail ? `: ${safeDetail}` : ''}\n`,
      'utf8',
    );
  } catch {}
}

function reportNotificationStatus(status, detail = '') {
  notificationAccessStatus = status;
  if (
    ['error', 'package-required', 'permission-required', 'permission-denied', 'allowed'].includes(
      status,
    )
  ) {
    logNotificationDiagnostic(status, detail);
  }
  if (island && !island.isDestroyed())
    island.webContents.send('notifications:status', { status, detail });
}

function handleBridgeMessage(message) {
  if (message.type === 'state') {
    if (notificationStartupTimer) clearTimeout(notificationStartupTimer);
    notificationStartupTimer = null;
    reportNotificationStatus(message.status || 'error', message.body || '');
    return;
  }
  if (message.type !== 'notification') return;

  const preferences = readNotificationPreferences();
  const source = String(message.source || '').toLowerCase();
  const isWhatsapp = source.includes('whatsapp');
  const isOpera = source.includes('opera');
  if (
    (isWhatsapp && !preferences.whatsapp) ||
    (isOpera && !preferences.gmail) ||
    (!isWhatsapp && !isOpera)
  )
    return;
  if (island && !island.isDestroyed()) {
    island.webContents.send('notifications:incoming', {
      source: isWhatsapp ? 'WhatsApp' : 'Gmail · Opera',
      title: String(message.title || '').slice(0, 140),
      body: String(message.body || '').slice(0, 360),
    });
  }
}

function startNotificationBridge() {
  if (notificationBridge && !notificationBridge.killed) return notificationAccessStatus;
  const bridgePath = app.isPackaged
    ? path.join(process.resourcesPath, 'notification-bridge', 'IlhaNotificationBridge.exe')
    : path.join(
        __dirname,
        'native',
        'notification-bridge',
        'publish',
        'IlhaNotificationBridge.exe',
      );
  if (!fs.existsSync(bridgePath)) {
    reportNotificationStatus('bridge-missing', 'Compile a ponte de notificações antes de ativar.');
    return notificationAccessStatus;
  }

  reportNotificationStatus('starting');
  logNotificationDiagnostic('launch', `packaged=${app.isPackaged}; path=${bridgePath}`);
  notificationBridge = spawn(bridgePath, [], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let receivedBridgeState = false;
  let output = '';
  notificationBridge.stdout.setEncoding('utf8');
  notificationBridge.stdout.on('data', (chunk) => {
    output += chunk;
    const lines = output.split(/\r?\n/);
    output = lines.pop() || '';
    for (const line of lines) {
      try {
        const message = JSON.parse(line);
        if (message.type === 'state') receivedBridgeState = true;
        handleBridgeMessage(message);
      } catch {}
    }
  });
  notificationBridge.stderr.on('data', (chunk) => {
    const detail = String(chunk).trim();
    console.error('[notification-bridge]', detail);
    logNotificationDiagnostic('stderr', detail);
  });
  notificationBridge.on('error', (error) => {
    if (notificationStartupTimer) clearTimeout(notificationStartupTimer);
    notificationStartupTimer = null;
    notificationBridge = null;
    reportNotificationStatus('error', error.message);
  });
  notificationBridge.on('spawn', () => {
    notificationStartupTimer = setTimeout(() => {
      if (notificationBridge && !receivedBridgeState && notificationAccessStatus === 'starting') {
        reportNotificationStatus(
          'error',
          'A ponte abriu, mas não confirmou o acesso. Feche e abra a Ilha para tentar novamente.',
        );
      }
    }, 8000);
  });
  notificationBridge.on('exit', (code, signal) => {
    if (notificationStartupTimer) clearTimeout(notificationStartupTimer);
    notificationStartupTimer = null;
    notificationBridge = null;
    if (notificationAccessStatus === 'starting') {
      reportNotificationStatus(
        'error',
        `A ponte encerrou sem responder (código ${code ?? signal ?? 'desconhecido'}).`,
      );
    } else if (notificationAccessStatus === 'allowed') {
      reportNotificationStatus('stopped');
    }
    logNotificationDiagnostic('exit', `code=${code ?? ''}; signal=${signal ?? ''}`);
  });
  return notificationAccessStatus;
}

function stopNotificationBridge() {
  if (notificationBridge && !notificationBridge.killed) notificationBridge.kill();
  notificationBridge = null;
  reportNotificationStatus('disabled');
}

function exchangeToken(form) {
  return fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form),
  }).then(async (response) => {
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error_description || data.error || 'Falha na autenticação Spotify.');
    return data;
  });
}

function beginSpotifyAuthorization(clientId) {
  return new Promise((resolve, reject) => {
    const state = crypto.randomBytes(24).toString('hex');
    const verifier = crypto.randomBytes(64).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    let settled = false;
    let timeout;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (server.listening) server.close();
      error ? reject(error) : resolve(value);
    };

    const server = http.createServer(async (request, response) => {
      const callbackUrl = new URL(request.url, 'http://127.0.0.1');
      if (callbackUrl.pathname !== '/callback') {
        response.writeHead(404).end('Não encontrado.');
        return;
      }
      if (callbackUrl.searchParams.get('state') !== state) {
        response
          .writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
          .end('Estado inválido. Volte ao app e tente novamente.');
        finish(new Error('A validação de segurança do Spotify falhou.'));
        return;
      }
      const code = callbackUrl.searchParams.get('code');
      const authError = callbackUrl.searchParams.get('error');
      if (!code || authError) {
        response
          .writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          .end(
            '<h2>Conexão com o Spotify cancelada</h2><p>Você pode fechar esta aba e voltar ao app.</p>',
          );
        finish(new Error(authError || 'O Spotify não retornou o código de autorização.'));
        return;
      }
      response
        .writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        .end('<h2>Spotify conectado</h2><p>Volte para a Ilha. Esta aba pode ser fechada.</p>');
      try {
        const tokenData = await exchangeToken({
          client_id: clientId,
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          code_verifier: verifier,
        });
        saveToken({ ...tokenData, expiresAt: Date.now() + tokenData.expires_in * 1000 });
        finish(null, true);
      } catch (error) {
        finish(error);
      }
    });

    let redirectUri;
    server.on('error', (error) => finish(error));
    server.listen(43821, '127.0.0.1', async () => {
      redirectUri = spotifyRedirectUri;
      const authUrl = new URL('https://accounts.spotify.com/authorize');
      authUrl.search = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: spotifyScopes,
        state,
        code_challenge_method: 'S256',
        code_challenge: challenge,
      }).toString();
      timeout = setTimeout(
        () => finish(new Error('A autenticação expirou. Tente conectar novamente.')),
        3 * 60 * 1000,
      );
      try {
        await shell.openExternal(authUrl.toString());
      } catch (error) {
        finish(error);
      }
    });
  });
}

async function getAccessToken() {
  const token = readToken();
  if (!token) throw new Error('Conecte sua conta Spotify primeiro.');
  if (token.expiresAt > Date.now() + 60_000) return token.access_token;
  if (!token.refresh_token) throw new Error('A sessão expirou. Conecte o Spotify novamente.');
  const settings = JSON.parse(
    fs.readFileSync(path.join(app.getPath('userData'), 'settings.json'), 'utf8'),
  );
  const refreshed = await exchangeToken({
    client_id: settings.spotifyClientId,
    grant_type: 'refresh_token',
    refresh_token: token.refresh_token,
  });
  const updated = {
    ...token,
    ...refreshed,
    refresh_token: refreshed.refresh_token || token.refresh_token,
    expiresAt: Date.now() + refreshed.expires_in * 1000,
  };
  saveToken(updated);
  return updated.access_token;
}

async function spotifyApi(endpoint, method = 'GET') {
  const accessToken = await getAccessToken();
  const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 204) return null;
  if (!response.ok) {
    let detail = '';
    try {
      detail = (await response.json()).error?.message || '';
    } catch {}
    if (response.status === 401)
      throw new Error('A sessão Spotify expirou. Desconecte e conecte novamente.');
    if (response.status === 403) {
      const reason = detail.toLowerCase();
      if (reason.includes('premium') || reason.includes('subscription')) {
        throw new Error(
          'O Spotify exige uma conta Premium para controlar a reprodução. Confira se a conta conectada tem Premium.',
        );
      }
      if (reason.includes('scope') || reason.includes('permission')) {
        throw new Error(
          'O Spotify não autorizou o controle. Desconecte e conecte a conta novamente para renovar a permissão de reprodução.',
        );
      }
      throw new Error(
        detail
          ? `O Spotify recusou o controle: ${detail}`
          : 'O Spotify recusou o controle. Os comandos de reprodução exigem Premium e a permissão de controle do app.',
      );
    }
    if (response.status === 404)
      throw new Error('Abra o Spotify e inicie uma música em um dispositivo ativo.');
    throw new Error(detail || `Spotify respondeu com erro ${response.status}.`);
  }
  // Player commands often succeed without a JSON response body.
  if (method !== 'GET') return null;
  const body = await response.text();
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    throw new Error('O Spotify respondeu em um formato inesperado ao consultar a reprodução.');
  }
}

ipcMain.handle('spotify:connect', async (_event, rawClientId) => {
  const clientId = String(rawClientId || '').trim();
  if (!clientId) throw new Error('Cole o Client ID do seu app Spotify.');
  saveClientId(clientId);
  return beginSpotifyAuthorization(clientId);
});

ipcMain.handle('spotify:settings', async () => {
  const settingsPath = path.join(app.getPath('userData'), 'settings.json');
  let clientId = '';
  if (fs.existsSync(settingsPath)) {
    try {
      clientId = JSON.parse(fs.readFileSync(settingsPath, 'utf8')).spotifyClientId || '';
    } catch {}
  }
  return { clientId, connected: Boolean(readToken()) };
});

ipcMain.handle('spotify:current', async () => {
  if (!readToken()) return null;
  const data = await spotifyApi('/me/player');
  if (!data?.item)
    return {
      isPlaying: false,
      title: 'Nada tocando',
      artist: 'Abra o Spotify e inicie uma música.',
    };
  return {
    isPlaying: data.is_playing,
    title: data.item.name,
    artist: data.item.artists?.map((artist) => artist.name).join(', ') || 'Spotify',
    image: data.item.album?.images?.[0]?.url || '',
    progressMs: data.progress_ms || 0,
    durationMs: data.item.duration_ms || 0,
  };
});

ipcMain.handle('spotify:control', async (_event, action) => {
  const endpoints = {
    play: ['/me/player/play', 'PUT'],
    pause: ['/me/player/pause', 'PUT'],
    next: ['/me/player/next', 'POST'],
    previous: ['/me/player/previous', 'POST'],
  };
  const command = endpoints[action];
  if (!command) throw new Error('Comando Spotify desconhecido.');
  await spotifyApi(command[0], command[1]);
  return true;
});

ipcMain.handle('spotify:disconnect', async () => {
  const tokenPath = spotifyTokenPath();
  if (fs.existsSync(tokenPath)) fs.unlinkSync(tokenPath);
  return true;
});

ipcMain.handle('notifications:settings', () => ({
  ...readNotificationPreferences(),
  status: notificationAccessStatus,
}));

ipcMain.handle('notifications:configure', (_event, rawPreferences) => {
  const preferences = {
    gmail: Boolean(rawPreferences?.gmail),
    whatsapp: Boolean(rawPreferences?.whatsapp),
  };
  saveNotificationPreferences(preferences);
  if (!preferences.gmail && !preferences.whatsapp) stopNotificationBridge();
  return { ...preferences, status: notificationAccessStatus };
});

ipcMain.handle('notifications:activate', () => {
  const preferences = readNotificationPreferences();
  if (!preferences.gmail && !preferences.whatsapp) return { status: 'select-source' };
  if (
    notificationBridge &&
    !notificationBridge.killed &&
    notificationAccessStatus !== 'permission-denied'
  ) {
    return { status: notificationAccessStatus };
  }
  stopNotificationBridge();
  return { status: startNotificationBridge() };
});

function resizeIsland(isExpanded, tuckedAway = false) {
  if (!island || island.isDestroyed()) return;
  if (resizeTimer) clearTimeout(resizeTimer);
  const current = island.getBounds();
  const display = screen.getDisplayNearestPoint({ x: current.x + current.width / 2, y: current.y });
  const size = tuckedAway ? tucked : isExpanded ? expanded : collapsed;
  const target = {
    x: Math.round(display.bounds.x + (display.bounds.width - size.width) / 2),
    y: display.bounds.y,
    width: size.width,
    height: size.height,
  };
  if (
    current.x === target.x &&
    current.y === target.y &&
    current.width === target.width &&
    current.height === target.height
  )
    return;

  const start = { x: current.x, y: current.y, width: current.width, height: current.height };
  const beganAt = Date.now();
  const duration = 280;
  const animate = () => {
    if (!island || island.isDestroyed()) return;
    const progress = Math.min(1, (Date.now() - beganAt) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    island.setBounds({
      x: Math.round(start.x + (target.x - start.x) * eased),
      y: target.y,
      width: Math.round(start.width + (target.width - start.width) * eased),
      height: Math.round(start.height + (target.height - start.height) * eased),
    });
    if (progress < 1) resizeTimer = setTimeout(animate, 16);
    else resizeTimer = null;
  };
  animate();
}

app.whenReady().then(() => {
  app.on('web-contents-created', (_event, contents) => {
    contents.session.setPermissionCheckHandler(
      (_webContents, permission) => permission === 'geolocation',
    );
    contents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
      callback(permission === 'geolocation');
    });
  });
  const display = screen.getPrimaryDisplay();
  island = new BrowserWindow({
    ...collapsed,
    x: Math.round(display.bounds.x + (display.bounds.width - collapsed.width) / 2),
    y: display.bounds.y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    maximizable: false,
    minimizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  island.setAlwaysOnTop(true, 'screen-saver');
  island.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  ipcMain.on('island:expanded', (_event, value) => resizeIsland(Boolean(value)));
  ipcMain.on('island:hide', () => resizeIsland(false, true));
  ipcMain.on('island:restore', () => resizeIsland(false));
  ipcMain.on('app:quit', () => app.quit());
  ipcMain.on('island:notify', (_event, data) => {
    if (!Notification.isSupported() || !data || typeof data !== 'object') return;
    const title = String(data.title || 'Ilha').slice(0, 100);
    const body = String(data.body || '').slice(0, 300);
    new Notification({ title, body }).show();
  });
  island.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  island.once('ready-to-show', () => island.show());
  const notificationPreferences = readNotificationPreferences();
  if (notificationPreferences.gmail || notificationPreferences.whatsapp) startNotificationBridge();
});

app.on('window-all-closed', (event) => event.preventDefault());
app.on('before-quit', () => stopNotificationBridge());
