const api = window.lofi;
const $ = (id) => document.getElementById(id);

const state = {
  lives: [],
  current: null, // { id, title }
  playing: false,
  buffering: false,
  volume: 60,
  muted: false,
  query: '',
  settings: {},
};

let player = null;
let ytReady = false;
let ytLoading = false;
let queued = null;
let lastRetryId = null;

init();

async function init() {
  state.settings = await api.getSettings();
  state.volume = state.settings.volume;
  state.muted = state.settings.muted;
  if (state.settings.lastId) {
    state.current = { id: state.settings.lastId, title: state.settings.lastTitle };
  }

  bindUi();
  renderSettings();
  renderVolume();
  renderNow();
  renderSkeleton();

  await loadLives(false);
  loadYouTubeApi();
}

// ---------------------------------------------------------------------------
// Liste des lives
// ---------------------------------------------------------------------------

async function loadLives(force) {
  $('refresh').classList.add('spinning');
  try {
    applyLives(await api.getLives(force));
  } finally {
    $('refresh').classList.remove('spinning');
  }
}

// Appelé aussi par l'app toutes les 5 minutes : les lives terminés disparaissent, les nouveaux arrivent.
function applyLives(res) {
  state.lives = res.lives || [];
  showBanner(res.error && (state.lives.length ? `${res.error} — liste enregistrée affichée.` : res.error));
  // Le titre affiché suit la liste (titres traduits en français par YouTube).
  const match = state.current && state.lives.find((l) => l.id === state.current.id);
  if (match) state.current.title = match.title;
  $('count').textContent = state.lives.length
    ? `${state.lives.length} lives en direct`
    : 'Aucun live disponible';
  renderList();
  renderNow();
}

function renderList() {
  const q = normalize(state.query);
  const items = state.lives.filter((l) => !q || normalize(l.title).includes(q));
  const list = $('list');

  if (!items.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = state.lives.length ? 'Aucun live ne correspond à ta recherche.' : 'Pas de live pour le moment.';
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(...items.map(liveItem));
  updateActive();
}

function liveItem(live) {
  const { name, desc } = splitTitle(live.title);

  const li = document.createElement('li');
  li.className = 'live';
  li.dataset.id = live.id;
  li.tabIndex = 0;
  li.title = live.title;

  const thumb = document.createElement('div');
  thumb.className = 'thumb';
  const img = document.createElement('img');
  img.src = live.thumbnail;
  img.alt = '';
  img.loading = 'lazy';
  const eq = document.createElement('div');
  eq.className = 'eq';
  eq.append(document.createElement('span'), document.createElement('span'), document.createElement('span'));
  thumb.append(img, eq);

  const text = document.createElement('div');
  text.className = 'live-text';
  const title = document.createElement('div');
  title.className = 'live-title';
  title.textContent = name;
  text.append(title);
  if (desc) {
    const sub = document.createElement('div');
    sub.className = 'live-sub';
    sub.textContent = desc;
    text.append(sub);
  }
  if (live.viewers) {
    const viewers = document.createElement('div');
    viewers.className = 'live-viewers';
    viewers.textContent = live.viewers;
    text.append(viewers);
  }

  li.append(thumb, text);
  li.addEventListener('click', () => choose(live.id));
  li.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      choose(live.id);
    }
  });
  return li;
}

function renderSkeleton() {
  const items = Array.from({ length: 5 }, () => {
    const li = document.createElement('li');
    li.className = 'live skeleton';
    li.innerHTML = '<div class="thumb"></div><div class="live-text"><div class="bar"></div><div class="bar"></div></div>';
    return li;
  });
  $('list').replaceChildren(...items);
}

function updateActive() {
  for (const li of $('list').querySelectorAll('.live[data-id]')) {
    const active = li.dataset.id === state.current?.id;
    li.classList.toggle('active', active);
    li.classList.toggle('playing', active && state.playing);
  }
}

// ---------------------------------------------------------------------------
// Lecteur YouTube (iframe API)
// ---------------------------------------------------------------------------

function loadYouTubeApi() {
  if (ytReady || ytLoading) return;
  ytLoading = true;
  window.onYouTubeIframeAPIReady = () => {
    ytReady = true;
    ytLoading = false;
    if (queued) {
      const { id, autoplay } = queued;
      queued = null;
      play(id, autoplay);
    } else if (state.current) {
      play(state.current.id, !!state.settings.autoplay);
    }
  };
  const script = document.createElement('script');
  script.src = 'https://www.youtube.com/iframe_api';
  script.onerror = () => {
    ytLoading = false;
    script.remove();
    showScreenMsg('Impossible de charger le lecteur YouTube. Vérifie ta connexion.', false);
  };
  document.head.append(script);
}

function choose(id) {
  if (state.current?.id === id && player) togglePlay();
  else play(id, true);
}

function play(id, autoplay = true) {
  const live = state.lives.find((l) => l.id === id);
  if (state.current?.id !== id) state.current = { id, title: live?.title ?? null };
  else if (live) state.current.title = live.title;
  api.setSettings({ lastId: id, lastTitle: state.current.title });
  hideScreenMsg();

  if (!ytReady) {
    queued = { id, autoplay };
    loadYouTubeApi();
  } else if (!player) {
    createPlayer(id, autoplay);
  } else if (autoplay) {
    player.loadVideoById(id);
  } else {
    player.cueVideoById(id);
  }

  state.buffering = autoplay;
  state.playing = false;
  render();
}

function createPlayer(id, autoplay) {
  $('screen').classList.add('has-player');
  player = new YT.Player('player', {
    host: 'https://www.youtube-nocookie.com',
    videoId: id,
    width: '100%',
    height: '100%',
    playerVars: {
      autoplay: autoplay ? 1 : 0,
      controls: 0,
      disablekb: 1,
      fs: 0,
      iv_load_policy: 3,
      rel: 0,
      playsinline: 1,
      origin: location.origin,
    },
    events: {
      onReady: () => {
        applyVolume();
        if (autoplay) player.playVideo();
      },
      onStateChange,
      onError,
    },
  });
}

function onStateChange(e) {
  const S = YT.PlayerState;
  switch (e.data) {
    case S.PLAYING:
      state.playing = true;
      state.buffering = false;
      lastRetryId = null;
      if (!state.current.title) state.current.title = player.getVideoData?.().title || null;
      break;
    case S.BUFFERING:
      state.buffering = true;
      break;
    case S.ENDED:
      state.playing = state.buffering = false;
      recoverStream();
      break;
    case S.PAUSED:
    case S.CUED:
      state.playing = state.buffering = false;
      break;
  }
  render();
}

function onError(e) {
  state.playing = state.buffering = false;
  render();
  if (e.data === 100) {
    recoverStream();
    return;
  }
  const messages = {
    2: 'Ce lien de live est invalide.',
    5: 'Le lecteur a rencontré une erreur. Réessaie dans un instant.',
    101: "Ce live ne peut pas être lu en dehors de YouTube.",
    150: "Ce live ne peut pas être lu en dehors de YouTube.",
    153: 'YouTube a refusé de lancer le lecteur.',
  };
  showScreenMsg(messages[e.data] || `Erreur de lecture (code ${e.data}).`, true);
}

// Lofi Girl redémarre parfois un live avec un nouvel identifiant :
// on recharge la liste et on relance le live qui porte le même nom.
async function recoverStream() {
  const old = state.current;
  if (!old) return;
  await loadLives(true);
  if (state.lives.some((l) => l.id === old.id)) {
    if (lastRetryId !== old.id) {
      lastRetryId = old.id;
      setTimeout(() => play(old.id, true), 3000);
    } else {
      showScreenMsg('Le live a été interrompu. Réessaie dans un instant.', true);
    }
    return;
  }
  const same = old.title && state.lives.find((l) => normalize(l.title) === normalize(old.title));
  if (same) play(same.id, true);
  else showScreenMsg('Ce live est terminé. Choisis-en un autre dans la liste !', false);
}

function togglePlay() {
  if (!state.current) {
    if (state.lives[0]) play(state.lives[0].id, true);
    return;
  }
  if (!player?.getPlayerState) {
    play(state.current.id, true);
    return;
  }
  if (state.playing || state.buffering) {
    player.pauseVideo();
  } else {
    hideScreenMsg();
    state.buffering = true;
    player.playVideo();
  }
  render();
}

// ---------------------------------------------------------------------------
// Volume
// ---------------------------------------------------------------------------

function applyVolume() {
  if (!player?.setVolume) return;
  player.setVolume(state.volume);
  if (state.muted || state.volume === 0) player.mute();
  else player.unMute();
}

function setVolume(v, save) {
  state.volume = Math.max(0, Math.min(100, Math.round(v)));
  if (state.volume > 0) state.muted = false;
  applyVolume();
  renderVolume();
  if (save) api.setSettings({ volume: state.volume, muted: state.muted });
}

function renderVolume() {
  const slider = $('volume');
  const shown = state.muted ? 0 : state.volume;
  slider.value = shown;
  slider.style.setProperty('--pct', `${shown}%`);
  $('volValue').textContent = shown;
  const box = slider.closest('.volume');
  box.classList.toggle('muted', state.muted || state.volume === 0);
  box.classList.toggle('low', shown < 50);
  $('mute').title = state.muted ? 'Remettre le son' : 'Couper le son';
}

// ---------------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------------

function render() {
  renderNow();
  updateActive();
  api.reportState({
    id: state.current?.id ?? null,
    title: state.current?.title ?? null,
    playing: state.playing || state.buffering,
  });
}

function renderNow() {
  const status = $('nowStatus');
  const play = $('play');
  const { name, desc } = splitTitle(state.current?.title || '');

  status.classList.toggle('live', state.playing);
  status.lastElementChild.textContent = !state.current
    ? 'Prêt'
    : state.buffering
      ? 'Chargement…'
      : state.playing
        ? 'En direct'
        : 'En pause';

  $('nowTitle').textContent = state.current ? name || 'Live Lofi Girl' : 'Aucun live sélectionné';
  const live = state.current && state.lives.find((l) => l.id === state.current.id);
  $('nowSub').textContent = state.current
    ? [desc, live?.viewers].filter(Boolean).join(' · ') || 'Lofi Girl'
    : 'La musique continue même fenêtre fermée';

  play.classList.toggle('playing', state.playing);
  play.classList.toggle('buffering', state.buffering);
  play.title = state.playing ? 'Pause (Espace)' : 'Lecture (Espace)';
  $('openYt').disabled = !state.current;
}

function renderSettings() {
  $('optLogin').checked = !!state.settings.openAtLogin;
  $('optAutoplay').checked = !!state.settings.autoplay;
  const moved = !!state.settings.position;
  $('positionInfo').textContent = moved
    ? "Position enregistrée. « Replacer » la remet près de l'icône"
    : 'Glisse la barre du haut pour la déplacer';
  $('resetPosition').disabled = !moved;
  $('version').textContent = `Version ${state.settings.version}`;
}

function showBanner(text) {
  const banner = $('banner');
  banner.hidden = !text;
  banner.textContent = text || '';
}

function showScreenMsg(text, withYoutube) {
  $('screenMsgText').textContent = text;
  $('screenMsgYt').hidden = !withYoutube || !state.current;
  $('screenMsg').hidden = false;
}

function hideScreenMsg() {
  $('screenMsg').hidden = true;
}

function openSettings(open) {
  $('settings').classList.toggle('open', open);
  $('settings').setAttribute('aria-hidden', String(!open));
  $('sheetBackdrop').hidden = !open;
}

// ---------------------------------------------------------------------------
// Événements
// ---------------------------------------------------------------------------

function bindUi() {
  $('play').addEventListener('click', togglePlay);
  $('refresh').addEventListener('click', () => loadLives(true));
  $('hide').addEventListener('click', () => api.hide());
  $('settingsBtn').addEventListener('click', () => openSettings(true));
  $('settingsClose').addEventListener('click', () => openSettings(false));
  $('sheetBackdrop').addEventListener('click', () => openSettings(false));
  $('quit').addEventListener('click', () => api.quit());
  $('openChannel').addEventListener('click', () => api.openExternal('https://www.youtube.com/@LofiGirl/streams'));

  const openOnYoutube = () => {
    if (state.current) api.openExternal(`https://www.youtube.com/watch?v=${state.current.id}`);
  };
  $('openYt').addEventListener('click', openOnYoutube);
  $('screenMsgYt').addEventListener('click', openOnYoutube);

  $('volume').addEventListener('input', (e) => setVolume(+e.target.value, false));
  $('volume').addEventListener('change', (e) => setVolume(+e.target.value, true));
  $('mute').addEventListener('click', () => {
    if (state.volume === 0) state.volume = 40;
    else state.muted = !state.muted;
    applyVolume();
    renderVolume();
    api.setSettings({ volume: state.volume, muted: state.muted });
  });
  // Molette sur la zone de lecture = volume
  let wheelSave;
  document.querySelector('.now').addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      setVolume((state.muted ? 0 : state.volume) + (e.deltaY < 0 ? 5 : -5), false);
      clearTimeout(wheelSave);
      wheelSave = setTimeout(() => api.setSettings({ volume: state.volume, muted: state.muted }), 400);
    },
    { passive: false },
  );

  $('search').addEventListener('input', (e) => {
    state.query = e.target.value;
    renderList();
  });

  $('optLogin').addEventListener('change', async (e) => {
    state.settings = await api.setSettings({ openAtLogin: e.target.checked });
    renderSettings();
  });
  $('resetPosition').addEventListener('click', async () => {
    state.settings = await api.resetPosition();
    renderSettings();
  });
  $('optAutoplay').addEventListener('change', async (e) => {
    state.settings = await api.setSettings({ autoplay: e.target.checked });
    renderSettings();
  });

  document.addEventListener('keydown', (e) => {
    const typing = e.target.matches('input[type="search"]');
    if (e.key === 'Escape') {
      if ($('settings').classList.contains('open')) openSettings(false);
      else if (typing && e.target.value) {
        e.target.value = '';
        state.query = '';
        renderList();
      } else api.hide();
    } else if (e.key === ' ' && !typing && !e.target.matches('button, input')) {
      e.preventDefault();
      togglePlay();
    } else if (e.key === '/' && !typing) {
      e.preventDefault();
      $('search').focus();
    }
  });

  api.onCommand((name, arg) => {
    if (name === 'toggle') togglePlay();
    else if (name === 'play' && arg) play(arg, true);
  });
  api.onLivesUpdated(applyLives);
  api.onShown(() => {
    loadLives(false);
    if (!ytReady) loadYouTubeApi();
  });
  api.onSettingsChanged((s) => {
    state.settings = s;
    renderSettings();
  });
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

// "lofi hip hop radio 📚 beats to relax/study to" -> nom + description
function splitTitle(title) {
  const m = /^(.*?\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}]*)\s*[-–—|:]?\s*(.*)$/u.exec(title);
  if (!m || !m[2]) return { name: title, desc: '' };
  return { name: m[1].trim(), desc: m[2].trim() };
}

function normalize(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}
