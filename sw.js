// Service Worker：讓網站安裝後可離線使用。只處理「同源 GET」；行情／匯率等跨網域請求完全不經過這裡。
// 下方 PRECACHE 區塊由 `npm run gen:sw` 產生（含內容雜湊的版本號）；tests/pwa.test.js 會檢查它是否過期。
// === PRECACHE:BEGIN ===
const VERSION = 'pfs-95362d101f';
const PRECACHE = [
  "./",
  "./css/style.css",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./index.html",
  "./js/app.js",
  "./js/core/aggregate.js",
  "./js/core/calendar.js",
  "./js/core/constants.js",
  "./js/core/daily.js",
  "./js/core/dates.js",
  "./js/core/decimal.js",
  "./js/core/expenses.js",
  "./js/core/loan.js",
  "./js/core/model.js",
  "./js/core/pledge.js",
  "./js/core/salary.js",
  "./js/data/backup.js",
  "./js/data/crypto.js",
  "./js/data/demo.js",
  "./js/data/io-json.js",
  "./js/data/merge.js",
  "./js/data/migrate.js",
  "./js/data/prefs.js",
  "./js/data/quotes.js",
  "./js/data/schema.js",
  "./js/data/storage.js",
  "./js/data/store.js",
  "./js/data/validate.js",
  "./js/export/excel-build.js",
  "./js/export/excel-export.js",
  "./js/export/excel-layout.js",
  "./js/export/excel-worker.js",
  "./js/ui/actions.js",
  "./js/ui/bottomnav.js",
  "./js/ui/components/chart.js",
  "./js/ui/components/charts/apex.js",
  "./js/ui/components/charts/chartjs.js",
  "./js/ui/components/charts/d3.js",
  "./js/ui/components/charts/loader.js",
  "./js/ui/components/charts/lw.js",
  "./js/ui/components/forms.js",
  "./js/ui/components/table.js",
  "./js/ui/components/vtable.js",
  "./js/ui/csv.js",
  "./js/ui/dom.js",
  "./js/ui/fmt.js",
  "./js/ui/pages/calendar.js",
  "./js/ui/pages/data.js",
  "./js/ui/pages/expenses.js",
  "./js/ui/pages/help.js",
  "./js/ui/pages/holdings.js",
  "./js/ui/pages/loans.js",
  "./js/ui/pages/monthly.js",
  "./js/ui/pages/overview.js",
  "./js/ui/pages/pledge.js",
  "./js/ui/pages/salary.js",
  "./js/ui/pages/schedule.js",
  "./js/ui/pages/settings.js",
  "./manifest.webmanifest",
  "./schema/finance-v1.schema.json",
  "./vendor/decimal.mjs",
  "./vendor/lightweight-charts.mjs"
];
// === PRECACHE:END ===

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('pfs-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 頁面導覽：優先走網路（拿到最新版），離線時退回快取的外殼
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))));
    return;
  }
  // 其他資源：先用快取（快、可離線），同時在背景更新；沒快取的（如選用的圖表引擎、Excel 函式庫）首次使用後也會被存起來
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const hit = await cache.match(req);
      const refresh = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; });
      if (hit) { refresh.catch(() => {}); return hit; }
      return refresh;
    }),
  );
});
