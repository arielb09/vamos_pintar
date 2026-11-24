'use strict';

// Incrementar VERSION cuando cambien archivos de la app.
const VERSION = 'v13';
const ROOT = new URL('./', self.location.href);
const PREFIX = 'vamos-pintar:' + ROOT.pathname + ':';
const CACHE = PREFIX + VERSION;

const ASSETS = [
  'index.html',
  'styles.css',
  'v3-camera-gallery-patch.js',
  'v5-drawing-progress-patch.js',
  'manifest.webmanifest',
  'icon.svg',
  'icon-192.png',
  'icon-512.png'
].map(path => new URL(path, ROOT).href);

const INDEX = new URL('index.html', ROOT).href;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();

    await Promise.all(
      names
        .filter(name => name.startsWith(PREFIX) && name !== CACHE)
        .map(name => caches.delete(name))
    );

    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url =
