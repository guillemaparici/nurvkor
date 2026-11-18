// NurvKor service worker — puja VERSION a cada publicació de sw.js (l'avís de "versió nova" de l'app no en depèn)
const VERSION = 'nurvkor-v12';
const CORE = ['./', './index.html'];   // imprescindibles per obrir sense connexió
const EXTRA = ['./manifest.webmanifest', './icon-192.png', './icon-512.png', './favicon-32.png', './favicon-64.png', './icon-maskable-512.png', './icon-monochrome-512.png', './apple-touch-icon.png'];
// Icones i fotos dels jugadors: es desen per poder obrir l'app sense connexió. Si en falta algun fitxer, no passa res (no trenca la instal·lació).
const PHOTOS = ['silueta', 'adam-el-bassiri', 'aleix-estanyol', 'arnau-lalmolda', 'derek-buro', 'enrique-lobato', 'gerard-santalices', 'hugo-mila', 'jan-planas', 'mario-chamorro', 'marti-ortega', 'oriol-domenech', 'xavi-moya', 'xavi-roca'].map(n => './jugadors/' + n + '.webp?v=1');
const CDN_HOSTS = ['cdn.tailwindcss.com', 'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(CORE).then(() => Promise.allSettled(EXTRA.concat(PHOTOS).map(u => c.add(u)))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function notifyUpdate() {
  self.clients.matchAll({ type: 'window' }).then(cs => cs.forEach(c => c.postMessage({ type: 'UPDATE_READY' })));
}

self.addEventListener('message', e => {
  if (e.data === 'GET_VERSION' && e.source) e.source.postMessage({ type: 'VERSION', version: VERSION });
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Mai cachejar Supabase ni l'API d'Anthropic
  if (url.hostname.endsWith('.supabase.co') || url.hostname === 'api.anthropic.com') return;

  // Manifest: sempre xarxa primer perquè les icones noves arribin a l'instal·lació
  if (url.origin === location.origin && url.pathname.endsWith('manifest.webmanifest')) {
    e.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // Pàgina: s'obre a l'instant amb la còpia guardada i, en paral·lel, es revalida amb GitHub.
  // Si hi ha una versió nova, es desa i s'avisa l'app ("Hi ha una versió nova · Actualitza").
  if (req.mode === 'navigate' || (url.origin === location.origin && (url.pathname.endsWith('/') || url.pathname.endsWith('index.html')))) {
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const cached = await cache.match('./index.html');
      const sig = x => x && (x.headers.get('etag') || x.headers.get('last-modified') || x.headers.get('content-length'));
      const net = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(async r => {
        if (r && r.ok) {
          const changed = cached && sig(cached) && sig(r) && sig(cached) !== sig(r);
          await cache.put('./index.html', r.clone());
          if (changed) notifyUpdate();
        }
        return r;
      });
      e.waitUntil(net.catch(() => {}));
      return cached || net.catch(() => caches.match('./'));
    })());
    return;
  }

  // Llibreries CDN, fonts, icones i fotos: stale-while-revalidate
  if (CDN_HOSTS.includes(url.hostname) || url.origin === location.origin) {
    e.respondWith(
      caches.open(VERSION).then(c => c.match(req).then(hit => {
        const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => hit);
        return hit || net;
      }))
    );
  }
});
