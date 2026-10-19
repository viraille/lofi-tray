// Version Android : fournit window.lofi (ce que fait src/preload.js sur PC) avec
// localStorage pour les réglages et l'objet Java "LofiAndroid" pour le reste.
(() => {
  const bridge = window.LofiAndroid;
  const LIVES_MAX_AGE = 5 * 60 * 1000;
  const DEFAULTS = { volume: 60, muted: false, lastId: null, lastTitle: null, autoplay: false };
  const SAVED_KEYS = Object.keys(DEFAULTS);

  document.documentElement.classList.add('android');

  const youtubeLoaded = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'youtube.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('youtube.js introuvable'));
    document.head.append(script);
  });

  const read = (key, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  };
  const write = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // stockage plein ou indisponible : tant pis pour la sauvegarde
    }
  };

  // Les requêtes vers YouTube passent par le Java (voir YouTubeProxy.java).
  const proxy = async (params) => {
    const res = await fetch(`/yt?${new URLSearchParams(params)}`);
    if (!res.ok) throw new Error(`YouTube a répondu ${res.status}`);
    return res;
  };
  const http = {
    get: async (url) => (await proxy({ url })).text(),
    post: async (url, payload, clientVersion) =>
      (await proxy({ url, cv: clientVersion, body: JSON.stringify(payload) })).json(),
  };

  const listeners = { command: [], shown: [], lives: [], settings: [] };
  const emit = (type, ...args) => listeners[type].forEach((cb) => cb(...args));

  let livesRequest = null;
  function getLives(force) {
    const cached = read('lives', { lives: [], fetchedAt: 0 });
    if (!force && cached.lives.length && Date.now() - cached.fetchedAt < LIVES_MAX_AGE) {
      return Promise.resolve({ ...cached, error: null });
    }
    livesRequest ??= youtubeLoaded
      .then(() => window.LofiYouTube.fetchLives(http))
      .then((lives) => {
        if (!lives.length) return { ...cached, error: 'Aucun live trouvé pour le moment' };
        const fresh = { lives, fetchedAt: Date.now() };
        write('lives', fresh);
        return { ...fresh, error: null };
      })
      .catch((err) => ({ ...cached, error: `Impossible de joindre YouTube (${err.message})` }))
      .then((result) => {
        emit('lives', result);
        return result;
      })
      .finally(() => {
        livesRequest = null;
      });
    return livesRequest;
  }
  // La liste reste à jour même app en arrière-plan (lives terminés / nouveaux lives).
  setInterval(() => getLives(true), LIVES_MAX_AGE);

  function getSettings() {
    return {
      ...DEFAULTS,
      ...read('settings', {}),
      dataSaver: bridge ? bridge.dataSaver() : false,
      openAtLogin: false,
      position: null,
      version: bridge ? bridge.versionName() : 'dev',
    };
  }

  window.lofi = {
    getLives,
    getSettings: async () => getSettings(),
    setSettings: async (patch) => {
      const saved = read('settings', {});
      for (const key of SAVED_KEYS) if (patch && key in patch) saved[key] = patch[key];
      write('settings', saved);
      // Réglage gardé côté Java : il s'applique au lecteur YouTube dès sa création.
      if (bridge && typeof patch?.dataSaver === 'boolean') bridge.setDataSaver(patch.dataSaver);
      return getSettings();
    },
    resetPosition: async () => getSettings(),
    reportState: (state) => bridge?.reportState(JSON.stringify(state)),
    hide: () => bridge?.moveToBack(),
    quit: () => bridge?.quit(),
    openExternal: (url) => bridge?.openExternal(url),
    onCommand: (cb) => listeners.command.push(cb),
    onShown: (cb) => listeners.shown.push(cb),
    onLivesUpdated: (cb) => listeners.lives.push(cb),
    onSettingsChanged: (cb) => listeners.settings.push(cb),
  };

  // Appelés par le Java (WebHolder).
  window.__lofiCommand = (name, arg) => emit('command', name, arg);
  window.__lofiShown = () => emit('shown');
  // Bouton retour : ferme d'abord les réglages, puis vide la recherche. Renvoie true si c'est fait.
  window.__lofiBack = () => {
    if (document.getElementById('settings')?.classList.contains('open')) {
      openSettings(false);
      return true;
    }
    const search = document.getElementById('search');
    if (search?.value) {
      search.value = '';
      search.dispatchEvent(new Event('input'));
      search.blur();
      return true;
    }
    return false;
  };
})();
