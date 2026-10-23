const CACHE_NAME = 'velotrainer-d100-v3';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './three.min.js',
  './world3d.js',
  './audio.js',
  './virtual_gears.js',
  './workouts.js',
  './gpx_parser.js',
  './gamepad.js',
  './ftms.js',
  './export.js',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('velotrainer-d100-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME)
      .then((cache) => cache.match(event.request))
      .then((response) => response || fetch(event.request))
  );
});
