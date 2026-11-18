const island = document.querySelector('#island');
const shapeNames = [
  'flat',
  'pill',
  'low',
  'full',
  'shift',
  'soft',
  'ellipse',
  'deep',
  'asym',
  'wave',
];
const shapeLabels = {
  flat: 'Reto',
  pill: 'Cápsula',
  low: 'Baixo',
  full: 'Cheio',
  shift: 'Deslocado',
  soft: 'Suave',
  ellipse: 'Oval',
  deep: 'Profundo',
  asym: 'Assimétrico',
  wave: 'Ondulado',
};
const shapePicker = document.querySelector('#shape-picker'),
  shapeTrigger = document.querySelector('#shape-trigger'),
  shapeOptions = document.querySelector('#shape-options'),
  shapePreview = document.querySelector('#shape-preview-shell'),
  shapePreviewName = document.querySelector('#shape-preview-name'),
  shapeCurrentLabel = document.querySelector('#shape-current-label');
let selectedShape = 'flat';
function previewIslandShape(shape) {
  if (!shapeNames.includes(shape)) return;
  shapePreview.className = `shape-preview-shell shape-${shape}`;
  shapePreviewName.textContent = shapeLabels[shape];
}
function closeShapeMenu({ restorePreview = true, returnFocus = false } = {}) {
  shapeOptions.hidden = true;
  shapeTrigger.setAttribute('aria-expanded', 'false');
  if (restorePreview) previewIslandShape(selectedShape);
  if (returnFocus) shapeTrigger.focus();
}
function setIslandShape(shape) {
  if (!shapeNames.includes(shape)) shape = 'flat';
  selectedShape = shape;
  island.classList.remove(
    ...[
      'flat',
      'pill',
      'low',
      'full',
      'shift',
      'soft',
      'ellipse',
      'deep',
      'asym',
      'wave',
      'arch',
      'point',
    ].map((name) => `shape-${name}`),
  );
  island.classList.add(`shape-${shape}`);
  shapeCurrentLabel.textContent = shapeLabels[shape];
  shapeOptions
    .querySelectorAll('.shape-option')
    .forEach((option) =>
      option.setAttribute('aria-selected', String(option.dataset.shape === shape)),
    );
  previewIslandShape(shape);
  try {
    localStorage.setItem('ilha-shape', shape);
  } catch {}
}
shapeTrigger.addEventListener('click', () => {
  const opening = shapeOptions.hidden;
  if (!opening) {
    closeShapeMenu();
    return;
  }
  shapeOptions.hidden = false;
  shapeTrigger.setAttribute('aria-expanded', 'true');
  previewIslandShape(selectedShape);
  shapeOptions.querySelector(`[data-shape="${selectedShape}"]`)?.focus();
});
shapeOptions.querySelectorAll('.shape-option').forEach((option, index, options) => {
  option.addEventListener('mouseenter', () => previewIslandShape(option.dataset.shape));
  option.addEventListener('focus', () => previewIslandShape(option.dataset.shape));
  option.addEventListener('click', () => {
    setIslandShape(option.dataset.shape);
    closeShapeMenu({ restorePreview: false, returnFocus: true });
  });
  option.addEventListener('keydown', (event) => {
    const offset = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (offset) {
      event.preventDefault();
      options[(index + offset + options.length) % options.length].focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      options[0].focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      options[options.length - 1].focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeShapeMenu({ returnFocus: true });
    }
  });
});
document.addEventListener('pointerdown', (event) => {
  if (!shapePicker.contains(event.target) && !shapeOptions.hidden) closeShapeMenu();
});
let savedShape = 'flat';
try {
  savedShape = localStorage.getItem('ilha-shape') || 'flat';
} catch {}
setIslandShape(savedShape);
function updateLocalClock() {
  const now = new Date();
  document.querySelector('#local-clock').textContent = now.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  document.querySelector('#local-date').textContent = now.toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}
updateLocalClock();
setInterval(updateLocalClock, 1000);
let expanded = false,
  islandHidden = false,
  spotifyConnected = false,
  polling = null,
  leaveTimer = null,
  autoCollapseTimer = null,
  autoExpandUntil = 0;
const playback = { position: 0, duration: 0, playing: false, syncedAt: 0 };
const progressFill = document.querySelector('#progress');
const elapsedLabel = document.querySelector('#elapsed'),
  durationLabel = document.querySelector('#duration');
let displayedElapsed = -1,
  displayedDuration = -1;
function formatTime(milliseconds) {
  const total = Math.floor(Math.max(0, milliseconds) / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
function animateProgress() {
  const elapsed = playback.playing ? performance.now() - playback.syncedAt : 0;
  const position = Math.min(playback.duration, playback.position + elapsed);
  const ratio = playback.duration ? position / playback.duration : 0;
  progressFill.style.transform = `scaleX(${ratio})`;
  const elapsedSecond = Math.floor(position / 1000),
    remainingSecond = Math.floor(Math.max(0, playback.duration - position) / 1000);
  if (elapsedSecond !== displayedElapsed) {
    elapsedLabel.textContent = formatTime(position);
    displayedElapsed = elapsedSecond;
  }
  if (remainingSecond !== displayedDuration) {
    durationLabel.textContent = playback.duration
      ? `-${formatTime(Math.max(0, playback.duration - position))}`
      : '0:00';
    displayedDuration = remainingSecond;
  }
  requestAnimationFrame(animateProgress);
}
requestAnimationFrame(animateProgress);
function setExpanded(value) {
  if (islandHidden) return;
  const next = Boolean(value);
  if (next === expanded) return;
  expanded = next;
  island.classList.toggle('expanded', expanded);
  window.ilha?.setExpanded(expanded);
}
function hideIsland() {
  islandHidden = true;
  expanded = false;
  clearTimeout(leaveTimer);
  clearTimeout(autoCollapseTimer);
  autoExpandUntil = 0;
  document.querySelector('#timer-message').hidden = true;
  island.classList.remove('expanded');
  island.classList.add('hidden-handle');
  window.ilha?.hideIsland();
}
function restoreIsland() {
  islandHidden = false;
  island.classList.remove('hidden-handle');
  window.ilha?.restoreIsland();
  setExpanded(true);
}
document.querySelector('#hide-island').addEventListener('click', (event) => {
  event.stopPropagation();
  hideIsland();
});
document.querySelector('#quit-app').addEventListener('click', (event) => {
  event.stopPropagation();
  window.ilha?.quitApp();
});
document.querySelector('#restore-island').addEventListener('click', (event) => {
  event.stopPropagation();
  restoreIsland();
});
function showTimedAlert(title, body, source = 'Temporizador', showSystemNotification = true) {
  const returnToHiddenState = islandHidden;
  const banner = document.querySelector('#attention-banner');
  document.querySelector('#attention-source').textContent = source;
  document.querySelector('#attention-title').textContent = title;
  document.querySelector('#attention-body').textContent = body;
  banner.hidden = false;
  const message = document.querySelector('#timer-message');
  message.hidden = true;
  if (islandHidden) restoreIsland();
  setExpanded(true);
  autoExpandUntil = Date.now() + 7000;
  if (showSystemNotification) window.ilha?.notify(title, body);
  clearTimeout(autoCollapseTimer);
  autoCollapseTimer = setTimeout(() => {
    autoExpandUntil = 0;
    banner.hidden = true;
    message.hidden = true;
    if (returnToHiddenState) hideIsland();
    else setExpanded(false);
  }, 7000);
}
const gmailNotificationToggle = document.querySelector('#notify-gmail'),
  whatsappNotificationToggle = document.querySelector('#notify-whatsapp'),
  messageStatus = document.querySelector('#messages-status');
function renderNotificationStatus(status, detail = '') {
  const messages = {
    disabled: 'Alertas desativados.',
    starting: 'Iniciando a leitura de notificações…',
    allowed: 'Permissão ativa. Aguardando novos avisos.',
    'permission-required': 'Autorize o acesso na janela do Windows.',
    'permission-denied': 'A permissão foi negada. Tente autorizar novamente.',
    'package-required': 'Instale a versão MSIX da Ilha para ativar esse recurso.',
    'bridge-missing': 'A ponte nativa ainda não foi compilada.',
    stopped: 'Leitura de notificações encerrada.',
    'select-source': 'Marque Gmail ou WhatsApp primeiro.',
    error: 'Falha ao iniciar as notificações.',
  };
  const label = messages[status] || detail || 'Não foi possível acessar as notificações.';
  messageStatus.textContent = detail && status === 'error' ? `${label} ${detail}` : label;
  messageStatus.title = detail || label;
  messageStatus.classList.toggle(
    'error',
    ['error', 'permission-denied', 'package-required', 'bridge-missing'].includes(status),
  );
  document.querySelector('#messages-preview-state').textContent =
    status === 'allowed' ? 'Ativas' : status === 'disabled' ? 'Desativadas' : 'Configurar';
}
async function saveNotificationChoices() {
  const preferences = await window.ilha.configureNotifications({
    gmail: gmailNotificationToggle.checked,
    whatsapp: whatsappNotificationToggle.checked,
  });
  document.querySelector('#messages-preview-state').textContent =
    preferences.gmail || preferences.whatsapp ? 'Selecionadas' : 'Desativadas';
  if (!preferences.gmail && !preferences.whatsapp) renderNotificationStatus('disabled');
}
gmailNotificationToggle.addEventListener('change', () =>
  saveNotificationChoices().catch((error) => renderNotificationStatus('error', error.message)),
);
whatsappNotificationToggle.addEventListener('change', () =>
  saveNotificationChoices().catch((error) => renderNotificationStatus('error', error.message)),
);
document.querySelector('#activate-notifications').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await saveNotificationChoices();
    const result = await window.ilha.activateNotifications();
    renderNotificationStatus(result.status);
  } catch (error) {
    renderNotificationStatus('error', error.message);
  } finally {
    button.disabled = false;
  }
});
window.ilha.onNotificationStatus(({ status, detail }) => renderNotificationStatus(status, detail));
window.ilha.onNotification(({ source, title, body }) =>
  showTimedAlert(title || 'Nova mensagem', body || '', source || 'Notificação', false),
);
window.ilha
  .notificationSettings()
  .then((settings) => {
    gmailNotificationToggle.checked = settings.gmail;
    whatsappNotificationToggle.checked = settings.whatsapp;
    renderNotificationStatus(settings.status);
  })
  .catch((error) => renderNotificationStatus('error', error.message));
island.addEventListener('mouseenter', () => {
  if (islandHidden) return;
  clearTimeout(leaveTimer);
  setExpanded(true);
});
island.addEventListener('mouseleave', () => {
  if (islandHidden) return;
  clearTimeout(leaveTimer);
  if (Date.now() >= autoExpandUntil) leaveTimer = setTimeout(() => setExpanded(false), 180);
});

const timerReadout = document.querySelector('#timer-readout'),
  timerMinutes = document.querySelector('#timer-minutes'),
  timerSeconds = document.querySelector('#timer-seconds'),
  timerStart = document.querySelector('#timer-start');
let timerRemaining = 0,
  timerDeadline = 0,
  timerInterval = null,
  timerActive = false,
  timerPaused = false;
function selectedTimerDuration() {
  const minutes = Math.min(1440, Math.max(0, Math.floor(Number(timerMinutes.value) || 0)));
  const seconds = Math.min(59, Math.max(0, Math.floor(Number(timerSeconds.value) || 0)));
  timerMinutes.value = minutes;
  timerSeconds.value = seconds;
  return (minutes * 60 + seconds) * 1000;
}
function renderTimer() {
  const seconds = Math.ceil(Math.max(0, timerRemaining) / 1000),
    minutes = Math.floor(seconds / 60),
    remainder = String(seconds % 60).padStart(2, '0');
  timerReadout.textContent =
    minutes >= 60
      ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${remainder}`
      : `${minutes}:${remainder}`;
}
function finishTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  timerRemaining = 0;
  timerActive = false;
  timerPaused = false;
  renderTimer();
  timerStart.textContent = 'Iniciar';
  timerMinutes.disabled = false;
  timerSeconds.disabled = false;
  document.querySelector('#timer-state').textContent = 'Finalizado';
  showTimedAlert('Temporizador concluído', 'Seu tempo terminou. Faça uma pausa.');
}
function updateTimer() {
  timerRemaining = Math.max(0, timerDeadline - Date.now());
  renderTimer();
  if (timerRemaining <= 0) finishTimer();
}
function updateSelectedDuration() {
  if (timerInterval) return;
  timerActive = false;
  timerPaused = false;
  timerRemaining = selectedTimerDuration();
  timerStart.textContent = 'Iniciar';
  document.querySelector('#timer-state').textContent = 'Pronto';
  document.querySelector('#timer-message').hidden = true;
  renderTimer();
}
timerMinutes.addEventListener('change', updateSelectedDuration);
timerSeconds.addEventListener('change', updateSelectedDuration);
timerStart.addEventListener('click', () => {
  if (timerInterval) {
    timerRemaining = Math.max(0, timerDeadline - Date.now());
    clearInterval(timerInterval);
    timerInterval = null;
    timerPaused = true;
    timerStart.textContent = 'Continuar';
    timerMinutes.disabled = false;
    timerSeconds.disabled = false;
    document.querySelector('#timer-state').textContent = 'Pausado';
    renderTimer();
    return;
  }
  if (!timerActive || timerRemaining <= 0) timerRemaining = selectedTimerDuration();
  if (timerRemaining <= 0) {
    document.querySelector('#timer-state').textContent = 'Defina o tempo';
    const message = document.querySelector('#timer-message');
    message.textContent = 'Escolha os minutos e/ou segundos antes de iniciar.';
    message.hidden = false;
    return;
  }
  timerPaused = false;
  timerActive = true;
  timerDeadline = Date.now() + timerRemaining;
  timerInterval = setInterval(updateTimer, 250);
  timerStart.textContent = 'Pausar';
  timerMinutes.disabled = true;
  timerSeconds.disabled = true;
  document.querySelector('#timer-state').textContent = 'Em andamento';
  document.querySelector('#timer-message').hidden = true;
  updateTimer();
});
document.querySelector('#timer-reset').addEventListener('click', () => {
  clearInterval(timerInterval);
  timerInterval = null;
  timerActive = false;
  timerPaused = false;
  timerMinutes.value = 0;
  timerSeconds.value = 0;
  timerRemaining = 0;
  timerStart.textContent = 'Iniciar';
  timerMinutes.disabled = false;
  timerSeconds.disabled = false;
  document.querySelector('#timer-state').textContent = 'Pronto';
  document.querySelector('#timer-message').hidden = true;
  clearTimeout(autoCollapseTimer);
  autoExpandUntil = 0;
  renderTimer();
});
renderTimer();

const status = document.querySelector('#spotify-status');
function showStatus(message, error = false) {
  status.textContent = message;
  status.classList.toggle('error', error);
}
function setSpotifyConnected(value) {
  spotifyConnected = value;
  const preview = document.querySelector('#spotify-preview');
  preview.style.display = value ? 'block' : 'none';
  document.querySelector('#connect-form').style.display = value ? 'none' : 'flex';
  document.querySelector('#setup-help').style.display = value ? 'none' : 'block';
  document.querySelector('#connected-badge').style.display = value ? 'inline' : 'none';
  document.querySelector('#disconnect').style.display = value ? 'block' : 'none';
  document.querySelector('#spotify-details').hidden = value;
  if (value) {
    if (!polling) {
      refreshTrack();
      polling = setInterval(refreshTrack, 5000);
    }
  } else {
    clearInterval(polling);
    polling = null;
    playback.position = 0;
    playback.duration = 0;
    playback.playing = false;
    progressFill.style.transform = 'scaleX(0)';
    document.querySelector('#title').textContent = 'Spotify';
    document.querySelector('#artist').textContent = 'Conecte sua conta para começar';
    document.querySelector('#cover').style.backgroundImage = '';
    document.querySelector('#cover').textContent = '♫';
    const toggle = document.querySelector('#play-toggle');
    toggle.textContent = '▶';
    toggle.setAttribute('aria-label', 'Reproduzir');
    toggle.title = 'Reproduzir';
  }
}
async function refreshTrack() {
  if (!spotifyConnected) return;
  try {
    const track = await window.ilha.spotifyCurrent();
    if (!track) return;
    document.querySelector('#title').textContent = track.title;
    document.querySelector('#artist').textContent = track.artist;
    document.querySelector('#cover').textContent = track.image ? '' : '♫';
    document.querySelector('#cover').style.backgroundImage = track.image
      ? `url("${track.image}")`
      : '';
    playback.position = track.progressMs;
    playback.duration = track.durationMs;
    playback.playing = track.isPlaying;
    playback.syncedAt = performance.now();
    const toggle = document.querySelector('#play-toggle');
    toggle.textContent = track.isPlaying ? 'Ⅱ' : '▶';
    toggle.setAttribute('aria-label', track.isPlaying ? 'Pausar' : 'Reproduzir');
    toggle.title = track.isPlaying ? 'Pausar' : 'Reproduzir';
    showStatus('');
  } catch (error) {
    showStatus(error.message, true);
  }
}
async function spotifyCommand(action, buttonId = action) {
  if (!spotifyConnected) {
    setExpanded(true);
    showStatus('Conecte sua conta Spotify para usar os controles.');
    return;
  }
  const button = document.querySelector('#' + buttonId);
  if (button) button.disabled = true;
  try {
    await window.ilha.spotifyControl(action);
    await new Promise((resolve) => setTimeout(resolve, 600));
    await refreshTrack();
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    if (button) button.disabled = false;
  }
}
document
  .querySelector('#play-toggle')
  .addEventListener('click', () =>
    spotifyCommand(playback.playing ? 'pause' : 'play', 'play-toggle'),
  );
document.querySelector('#previous').addEventListener('click', () => spotifyCommand('previous'));
document.querySelector('#next').addEventListener('click', () => spotifyCommand('next'));
document.querySelector('#connect-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = document.querySelector('#connect');
  button.disabled = true;
  button.textContent = 'Aguardando…';
  showStatus('Aprove a conexão do Spotify no navegador.');
  try {
    await window.ilha.spotifyConnect(document.querySelector('#client-id').value);
    setSpotifyConnected(true);
    showStatus('');
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = 'Conectar';
  }
});
document.querySelector('#disconnect').addEventListener('click', async () => {
  await window.ilha.spotifyDisconnect();
  setSpotifyConnected(false);
  showStatus('Conta desconectada.');
});
window.ilha
  .spotifySettings()
  .then((settings) => {
    document.querySelector('#client-id').value = settings.clientId || '';
    setSpotifyConnected(settings.connected);
  })
  .catch((error) => showStatus(error.message, true));

const weatherCodes = {
  0: 'Céu limpo',
  1: 'Predominantemente limpo',
  2: 'Parcialmente nublado',
  3: 'Nublado',
  45: 'Neblina',
  48: 'Neblina com geada',
  51: 'Garoa fraca',
  53: 'Garoa moderada',
  55: 'Garoa intensa',
  61: 'Chuva fraca',
  63: 'Chuva moderada',
  65: 'Chuva forte',
  71: 'Neve fraca',
  73: 'Neve moderada',
  75: 'Neve forte',
  80: 'Pancadas fracas',
  81: 'Pancadas moderadas',
  82: 'Pancadas fortes',
  95: 'Trovoada',
};
const weatherCacheKey = 'ilha-weather-cache';
let locating = false;
function showWeather(data, fromCache = false) {
  document.querySelector('#temperature').textContent = `${Math.round(data.temperature)}°`;
  document.querySelector('#weather-desc').textContent = `${data.description} · Open-Meteo`;
  const when = new Date(data.updatedAt).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const area = data.city || 'localização do dispositivo';
  document.querySelector('#weather-preview-state').textContent =
    data.city || 'Localização do dispositivo';
  document.querySelector('#weather-city').textContent =
    `${fromCache ? 'Última atualização' : 'Atualizado'} às ${when} · ${area}${data.manual ? ' · cidade escolhida' : ''}`;
}
try {
  const cached = JSON.parse(localStorage.getItem(weatherCacheKey) || 'null');
  if (cached && !cached.approximate) showWeather(cached, true);
} catch {}
async function weatherAt(latitude, longitude, location = {}) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude,
    longitude,
    current: 'temperature_2m,weather_code',
    timezone: 'auto',
  });
  const response = await fetch(url);
  if (!response.ok) throw new Error('weather');
  const result = await response.json();
  let city = location.city || '';
  if (!city) {
    try {
      const reverse = new URL('https://geocoding-api.open-meteo.com/v1/reverse');
      reverse.search = new URLSearchParams({
        latitude,
        longitude,
        count: '1',
        language: 'pt',
        format: 'json',
      });
      const geo = await fetch(reverse);
      if (geo.ok) {
        const found = (await geo.json()).results?.[0];
        city = [found?.name, found?.admin1].filter(Boolean).join(', ');
      }
    } catch {}
  }
  const saved = {
    temperature: result.current.temperature_2m,
    description: weatherCodes[result.current.weather_code] || 'Condição atual',
    city,
    manual: Boolean(location.manual),
    latitude,
    longitude,
    updatedAt: Date.now(),
  };
  localStorage.setItem(weatherCacheKey, JSON.stringify(saved));
  showWeather(saved);
}
function updateWeather() {
  if (locating) return;
  const city = document.querySelector('#weather-city');
  locating = true;
  if (document.querySelector('#temperature').textContent === '--°')
    city.textContent = 'Obtendo a localização e o clima…';
  const fail = () => {
    let cachedCity = null;
    try {
      cachedCity = JSON.parse(localStorage.getItem('ilha-manual-city') || 'null');
    } catch {}
    if (cachedCity) {
      weatherAt(cachedCity.latitude, cachedCity.longitude, {
        city: cachedCity.city,
        manual: true,
      }).catch(() => {
        city.textContent = 'Não consegui atualizar o clima. Verifique sua conexão.';
      });
    } else {
      city.textContent =
        'Localização precisa indisponível. Ative a localização do Windows ou escolha sua cidade abaixo.';
      document.querySelector('#weather-preview-state').textContent = 'Defina sua cidade';
    }
    document.querySelector('#city-form').classList.toggle('visible', !cachedCity);
    locating = false;
  };
  if (!navigator.geolocation) {
    fail();
    return;
  }
  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      try {
        if (coords.accuracy > 10000) throw new Error('low-accuracy');
        await weatherAt(coords.latitude, coords.longitude);
        document.querySelector('#city-form').classList.remove('visible');
      } catch {
        fail();
        return;
      }
      locating = false;
    },
    fail,
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 },
  );
}
document.querySelector('#city-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.querySelector('#city-input'),
    button = event.currentTarget.querySelector('button'),
    query = input.value.trim();
  if (!query) return;
  button.disabled = true;
  button.textContent = 'Buscando…';
  document.querySelector('#weather-city').textContent = 'Procurando essa cidade…';
  try {
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.search = new URLSearchParams({ name: query, count: '1', language: 'pt', format: 'json' });
    const response = await fetch(url);
    if (!response.ok) throw new Error();
    const result = await response.json(),
      place = result.results?.[0];
    if (!place) throw new Error();
    const selected = {
      latitude: place.latitude,
      longitude: place.longitude,
      city: [place.name, place.admin1].filter(Boolean).join(', '),
    };
    localStorage.setItem('ilha-manual-city', JSON.stringify(selected));
    await weatherAt(selected.latitude, selected.longitude, { city: selected.city, manual: true });
    document.querySelector('#city-form').classList.remove('visible');
  } catch {
    document.querySelector('#weather-city').textContent =
      'Não encontrei essa cidade. Tente incluir o estado.';
  } finally {
    button.disabled = false;
    button.textContent = 'Buscar cidade';
  }
});
updateWeather();
setInterval(updateWeather, 30 * 60 * 1000);
