// Récupère les lives en cours de la chaîne Lofi Girl en lisant la page
// "En direct" de YouTube (pas besoin de clé d'API).

const STREAMS_URL = 'https://www.youtube.com/@LofiGirl/streams?hl=fr&gl=FR';
const BROWSE_URL = 'https://www.youtube.com/youtubei/v1/browse?prettyPrint=false';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const HEADERS = {
  'User-Agent': USER_AGENT,
  'Accept-Language': 'fr-FR,fr;q=0.9',
  // Évite la page de consentement des cookies (cookies non essentiels refusés).
  Cookie: 'SOCS=CAI',
};
const MAX_PAGES = 6;

// YouTube affiche les lives en cours en premier, puis les anciens directs :
// on charge les pages suivantes tant qu'on ne voit que des lives.
async function fetchLives() {
  const res = await fetch(STREAMS_URL, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`YouTube a répondu ${res.status}`);
  const html = await res.text();
  const clientVersion = /"INNERTUBE_CLIENT_VERSION":"([^"]+)"/.exec(html)?.[1];

  const lives = new Map();
  let page = collect(extractInitialData(html), lives);
  for (let i = 1; i < MAX_PAGES && page.continuation && !page.sawEnded && clientVersion; i++) {
    try {
      page = collect(await fetchContinuation(page.continuation, clientVersion), lives);
    } catch {
      break; // on garde ce qu'on a déjà
    }
  }
  return sortLives([...lives.values()]);
}

async function fetchContinuation(token, clientVersion) {
  const res = await fetch(BROWSE_URL, {
    method: 'POST',
    headers: {
      ...HEADERS,
      'Content-Type': 'application/json',
      Origin: 'https://www.youtube.com',
      'X-YouTube-Client-Name': '1',
      'X-YouTube-Client-Version': clientVersion,
    },
    body: JSON.stringify({
      context: { client: { clientName: 'WEB', clientVersion, hl: 'fr', gl: 'FR' } },
      continuation: token,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`YouTube a répondu ${res.status}`);
  return res.json();
}

function extractInitialData(html) {
  const match = /(?:var ytInitialData|window\["ytInitialData"\])\s*=\s*/.exec(html);
  if (!match) throw new Error('Données YouTube introuvables');
  const start = match.index + match[0].length;
  const end = html.indexOf(';</script>', start);
  return JSON.parse(html.slice(start, end));
}

function parseLives(html) {
  const lives = new Map();
  collect(extractInitialData(html), lives);
  return sortLives([...lives.values()]);
}

// Parcourt une réponse YouTube : ajoute les lives trouvés, repère la page suivante
// et indique si des vidéos qui ne sont plus en direct apparaissent (fin des lives).
function collect(data, lives) {
  const page = { continuation: null, sawEnded: false };

  // Seule la grille des vidéos compte (l'en-tête de la chaîne a ses propres "pages suivantes").
  const grids = [];
  (function find(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node.richGridRenderer?.contents)) grids.push(node.richGridRenderer.contents);
    if (Array.isArray(node.appendContinuationItemsAction?.continuationItems)) {
      grids.push(node.appendContinuationItemsAction.continuationItems);
    }
    for (const key in node) find(node[key]);
  })(data);

  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    const video = node.lockupViewModel
      ? fromLockup(node.lockupViewModel)
      : node.videoRenderer
        ? fromVideoRenderer(node.videoRenderer)
        : undefined;
    if (video === null) page.sawEnded = true;
    if (video && !lives.has(video.id)) lives.set(video.id, video);
    for (const key in node) walk(node[key]);
  };

  if (!grids.length) {
    walk(data); // format inconnu : on cherche partout, sans pagination
    return page;
  }
  for (const item of grids.flat()) {
    const token = item?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
    if (token) page.continuation = token;
    else walk(item);
  }
  return page;
}

function sortLives(lives) {
  return lives.sort((a, b) => b.viewersCount - a.viewersCount);
}

// Format actuel de YouTube.
function fromLockup(v) {
  const isLive = JSON.stringify(v.contentImage || {}).includes('THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE');
  const meta = v.metadata?.lockupMetadataViewModel;
  if (!isLive || !v.contentId || !meta) return null;
  const rows = meta.metadata?.contentMetadataViewModel?.metadataRows || [];
  const viewers = rows
    .flatMap((r) => r.metadataParts || [])
    .map((p) => p.text?.content)
    .filter(Boolean)
    .join(' • ');
  return makeLive(v.contentId, meta.title?.content, viewers);
}

// Ancien format, gardé au cas où YouTube revient en arrière.
function fromVideoRenderer(v) {
  const flags = JSON.stringify([v.badges, v.thumbnailOverlays]);
  if (!v.videoId || !(flags.includes('"LIVE"') || flags.includes('LIVE_NOW'))) return null;
  const text = (t) => t?.simpleText ?? (t?.runs || []).map((r) => r.text).join('');
  return makeLive(v.videoId, text(v.title), text(v.viewCountText));
}

function makeLive(id, title, viewers) {
  return {
    id,
    title: (title || 'Live Lofi Girl').trim(),
    viewers: viewers || '',
    viewersCount: parseCount(viewers),
    thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
  };
}

// "5,4 k spectateurs" -> 5400, "1,2 M" -> 1200000, "565 spectateurs" -> 565
function parseCount(text) {
  if (!text) return 0;
  const m = /(\d[\d\s  .,]*)\s*(k|md|m|b)?\b/i.exec(text);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(/[\s  ]/g, '').replace(',', '.'));
  const mult = { k: 1e3, m: 1e6, md: 1e9, b: 1e9 }[(m[2] || '').toLowerCase()] || 1;
  return Math.round((n || 0) * mult);
}

module.exports = { fetchLives, parseLives };
