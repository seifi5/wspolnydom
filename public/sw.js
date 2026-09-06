self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('fetch', (e) => {});

self.addEventListener('push', function (event) {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: '/logo192.png', // Użyje Twojej nowej ikony!
      badge: '/logo192.png',
      vibrate: [100, 50, 100],
      data: {
        dateOfArrival: Date.now(),
        primaryKey: '1'
      }
    };
    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  // Po kliknięciu w powiadomienie, otwiera aplikację
  event.waitUntil(
    clients.openWindow('/')
  );
});
