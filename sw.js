// NurvKor service worker — puja VERSION a cada publicació de sw.js (l'avís de "versió nova" de l'app no en depèn)
const VERSION = 'nurvkor-v7';
const CORE = ['./', './index.html'];   // imprescindibles per obrir sense connexió
const EXTRA = ['./manifest.webmanifest', './icon-192.png', './icon-512.png', './favicon-32.png', './favicon-64.png', './icon-maskable-512.png', './icon-monochrome-512.png', './apple-touch-icon.png'];
// Icones i fotos dels jugadors: es desen per poder obrir l'app sense connexió. Si en falta algun fitxer, no passa res (no trenca la instal·lació).
const PHOTOS = ['silueta', 'adam-el-bassiri', 'aleix-estanyol', 'arnau-lalmolda', 'derek-buro', 'enrique-lobato', 'gerard-santalices', 'hugo-mila', 'jan-planas', 'mario-chamorro', 'marti-ortega', 'oriol-domenech', 'xavi-moya', 'xavi-roca'].map(n => './jugadors/' + n + '.webp?v=1');
const CDN_HOSTS = ['cdn.tailwindcss.com', 'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const PAGE_TIMEOUT = 3500;   // si la xarxa triga més, s'obre la còpia guardada (i s'actualitza en segon pla)

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

  // Pàgina: xarxa primer (revalidant sempre amb GitHub, sense fiar-se de la memòria cau HTTP),
  // però sense fer esperar més de PAGE_TIMEOUT si ja hi ha còpia guardada.
  if (req.mode === 'navigate' || (url.origin === location.origin && (url.pathname.endsWith('/') || url.pathname.endsWith('index.html')))) {
    const net = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(r => {
      if (r && r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put('./index.html', copy)); }
      return r;
    });
    e.waitUntil(net.catch(() => {}));
    e.respondWith(
      caches.match('./index.html').then(cached => {
        if (!cached) return net.catch(() => caches.match('./'));
        const slow = new Promise(res => setTimeout(() => res(cached), PAGE_TIMEOUT));
        return Promise.race([net.catch(() => cached), slow]);
      })
    );
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
