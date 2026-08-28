const CACHE_NAME = 'eakar-hang-v1';
const STATIC_ASSETS = [
    './login-sdt.html',
    './hang.html',
    './manifest-hang.html',
    './style.css',
    './manifest.json',
    './idb-queue.js',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('push', e => {
    const data = e.data?.json() || {}
    const title = data.title || 'EaKar Hàng'
    const options = {
        body: data.body || '',
        icon: data.icon || '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url: data.url || '/manifest-hang.html' }
    }
    e.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', e => {
    e.notification.close()
    const url = e.notification.data?.url || '/manifest-hang.html'
    e.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
            const match = list.find(c => c.url === url)
            if (match) return match.focus()
            return clients.openWindow(url)
        })
    )
})

self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;

    const url = new URL(e.request.url);
    if (url.origin !== self.location.origin) return;

    e.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);

        if (e.request.mode === 'navigate') {
            try {
                const response = await fetch(e.request);
                if (response.ok) await cache.put(e.request, response.clone());
                return response;
            } catch {
                return (await cache.match(e.request)) || cache.match('./login-sdt.html');
            }
        }

        const cached = await cache.match(e.request);
        if (cached) return cached;

        const response = await fetch(e.request);
        if (response.ok) await cache.put(e.request, response.clone());
        return response;
    })());
});
