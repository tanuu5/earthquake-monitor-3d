// 地震3Dモニター サービスワーカー
// - アプリ本体：ネット優先（更新をすぐ届ける）。つながらないときだけ保存した版を使う
// - three.js（版番号つきURL）・地形タイル：一度取ったら保存した版を使う
// - 県境・プレート境界：保存した版をすぐ返し、裏で新しい版に入れ替える
// - 地震の情報（気象庁・P2P地震情報・USGS）：常にネットから取り、保存しない
const APP = 'quake3d-app-v1';
const LIBS = 'quake3d-libs-v1';
const TILES = 'quake3d-tiles-v1';
const REF = 'quake3d-ref-v1';
const APP_FILES = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
const MAX_TILES = 900;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP).then((c) => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  const keep = [APP, LIBS, TILES, REF];
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) { e.respondWith(networkFirst(req, APP)); return; }
  if (url.hostname === 'cdn.jsdelivr.net') { e.respondWith(cacheFirst(req, LIBS)); return; }
  if (url.hostname === 's3.amazonaws.com' && url.pathname.startsWith('/elevation-tiles-prod/')) { e.respondWith(cacheFirst(req, TILES, MAX_TILES)); return; }
  if (url.hostname === 'raw.githubusercontent.com') { e.respondWith(staleWhileRevalidate(req, REF)); return; }
  // それ以外（地震の情報など）はブラウザにまかせる
});

async function networkFirst(req, name) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(name)).put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req, name, limit) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    await cache.put(req, res.clone());
    if (limit) trim(cache, limit);
  }
  return res;
}

async function staleWhileRevalidate(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  const update = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || update;
}

// 古いタイルから消して、保存する数を抑える
async function trim(cache, limit) {
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  for (const k of keys.slice(0, keys.length - limit + 100)) await cache.delete(k);
}
