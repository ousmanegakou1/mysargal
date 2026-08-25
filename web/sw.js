// MySargal Service Worker v2.0
// Pages toujours fraîches (réseau d'abord), assets en cache.
// Notifications push : méthode « tickle » — le contenu est récupéré à la
// réception, aucun payload chiffré à transporter.

const CACHE_NAME = 'mysargal-v2';
const OFFLINE_URLS = [
  '/',
  '/manifest.json',
];
const SB_URL = 'https://iiocxlvcuoqafzlisqwd.supabase.co';

// ── Installation ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(OFFLINE_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

// ── Activation : purge des anciens caches ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ──
// Pages (navigation) : réseau d'abord, cache en secours hors ligne.
// Assets : cache d'abord, mais rafraîchi en arrière-plan.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.url.includes('supabase.co')) return; // jamais de cache sur les API

  const isPage = req.mode === 'navigate'
    || (req.headers.get('accept') || '').includes('text/html');

  if (isPage) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then(c => c || caches.match('/')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});

// ── Récupère le message en attente pour cet abonnement ──
async function pendingMessage() {
  try {
    const sub = await self.registration.pushManager.getSubscription();
    if (!sub) return null;
    const r = await fetch(SB_URL + '/functions/v1/push-subscribe?pending=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d && d.message ? d.message : null;
  } catch (e) {
    return null;
  }
}

// ── Push ──
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let data = null;
    if (e.data) { try { data = e.data.json(); } catch (_) { data = null; } }
    if (!data) data = await pendingMessage();
    // Repli quand rien n'arrive : dans la langue du téléphone, pas en
    // français d'office. Un service worker n'a pas accès au stockage local,
    // mais il connaît la langue du navigateur.
    if (!data) {
      var lg = (self.navigator && self.navigator.language || 'fr').slice(0, 2).toLowerCase();
      var REPLI = {
        fr: 'Vous avez une nouveauté.',
        en: 'You have something new.',
        es: 'Tienes una novedad.'
      };
      data = { title: 'MySargal', body: REPLI[lg] || REPLI.fr };
    }

    var options = {
      body: data.body || '',
      // Le logo de la boutique s'il est fourni, celui de MySargal sinon.
      icon: data.icon || '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [200, 100, 200],
      data: { url: data.url || '/client-app/' },
      tag: data.tag || 'mysargal-notif',
      renotify: true,
    };
    // Grande image de promotion, facultative. Ignorée par les navigateurs qui
    // ne la gèrent pas, donc sans risque.
    if (data.image) options.image = data.image;

    await self.registration.showNotification(data.title || 'MySargal', options);
  })());
});

// ── Clic sur notification ──
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/client-app/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cls => {
      const existing = cls.find(c => c.url.includes(url));
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});
