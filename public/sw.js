self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', () => {});

self.addEventListener('push', (event) => {
    let data = { title: 'P³ 🤍', body: 'New update from your partner!' };
    try {
        if (event.data) data = event.data.json();
    } catch (e) {}
    event.waitUntil(
        self.registration.showNotification(data.title || 'P³ 🤍', {
            body: data.body || 'Tap to open P³',
            icon: '/icon.png',
            badge: '/icon.png',
            vibrate: [100, 50, 100]
        })
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
        const { title, body } = event.data;
        self.registration.showNotification(title || 'P³ 🤍', {
            body: body || 'New update from your partner!',
            icon: '/icon.png',
            badge: '/icon.png',
            vibrate: [100, 50, 100]
        });
    }
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            if (clientList.length > 0) return clientList[0].focus();
            return clients.openWindow('/');
        })
    );
});