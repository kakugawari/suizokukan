/*
 * sw.js — オフラインでも開けるようにする。
 *
 * つながっているときは、かならずネットから最新を取りにいく (取れたら控えを更新)。
 * 取れないときだけ控えを出す。キャッシュ優先にすると、直したのに古い画面が出る。
 *
 * ファイルを足したら FILES にも足す (足し忘れは npm test が見つける)。
 * VERSION は app.js の VERSION とそろえる (これも npm test が見る)。
 */
const VERSION = 3;
const CACHE = 'suizokukan-v' + VERSION;
const FILES = [
  './', 'index.html', 'styles.css', 'core.js', 'sound.js', 'app.js',
  'manifest.webmanifest', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png',
  'img/tank.webp',
  'img/d_arch.webp', 'img/d_barrel.webp', 'img/d_chest.webp', 'img/d_light.webp', 'img/d_moai.webp',
  'img/d_plane.webp', 'img/d_shell.webp', 'img/d_ship.webp', 'img/d_sign.webp',
  'img/f_ebi.webp', 'img/f_fugu.webp', 'img/f_kame.webp', 'img/f_kiirohagi.webp', 'img/f_kingyo.webp',
  'img/f_kumanomi.webp', 'img/f_kurage.webp', 'img/f_nanyouhagi.webp', 'img/f_neon.webp', 'img/f_tsunodashi.webp'
];

self.addEventListener('install', (e) => {
  // 控えを先にそろえておく (まだ見ていない絵も、オフラインで出せるように)
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('suizokukan-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' }).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true })
      .then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
