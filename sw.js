// Service Worker：讓網站安裝後可離線使用。只處理「同源 GET」；行情／匯率等跨網域請求完全不經過這裡。
// 下方 PRECACHE 區塊由 `npm run gen:sw` 產生（含內容雜湊的版本號）；tests/pwa.test.js 會檢查它是否過期。
// === PRECACHE:BEGIN ===
const VERSION = 'pfs-6e1b4f1d0e';
const PRECACHE = [
  "./",
  "./css/style.css",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./income-resources.html",
  "./index.html",
  "./js/app.js",
  "./js/core/aggregate.js",
  "./js/core/build.js",
  "./js/core/calendar.js",
  "./js/core/chartdata.js",
  "./js/core/clock.js",
  "./js/core/constants.js",
  "./js/core/countdown.js",
  "./js/core/daily.js",
  "./js/core/dates.js",
  "./js/core/decimal.js",
  "./js/core/expenses.js",
  "./js/core/lifetime.js",
  "./js/core/loan.js",
  "./js/core/model.js",
  "./js/core/payoff.js",
  "./js/core/pile.js",
  "./js/core/pledge.js",
  "./js/core/salary.js",
  "./js/core/scenario.js",
  "./js/data/backup.js",
  "./js/data/crypto.js",
  "./js/data/demo.js",
  "./js/data/income-resources.js",
  "./js/data/io-json.js",
  "./js/data/merge.js",
  "./js/data/migrate.js",
  "./js/data/prefs.js",
  "./js/data/quotes.js",
  "./js/data/reminders.js",
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
  "./js/ui/components/areachart.js",
  "./js/ui/components/chart.js",
  "./js/ui/components/charts/apex.js",
  "./js/ui/components/charts/chartjs.js",
  "./js/ui/components/charts/d3.js",
  "./js/ui/components/charts/loader.js",
  "./js/ui/components/charts/lw.js",
  "./js/ui/components/clock-page.js",
  "./js/ui/components/countdown.js",
  "./js/ui/components/donut.js",
  "./js/ui/components/forms.js",
  "./js/ui/components/heatmap.js",
  "./js/ui/components/interest-pile.js",
  "./js/ui/components/lifechart.js",
  "./js/ui/components/rolling.js",
  "./js/ui/components/table.js",
  "./js/ui/components/tick-sound.js",
  "./js/ui/components/vtable.js",
  "./js/ui/csv.js",
  "./js/ui/dom.js",
  "./js/ui/fmt.js",
  "./js/ui/install.js",
  "./js/ui/pages/calendar.js",
  "./js/ui/pages/charts.js",
  "./js/ui/pages/clock.js",
  "./js/ui/pages/data.js",
  "./js/ui/pages/expenses.js",
  "./js/ui/pages/help.js",
  "./js/ui/pages/holdings.js",
  "./js/ui/pages/income.js",
  "./js/ui/pages/lifetime.js",
  "./js/ui/pages/loans.js",
  "./js/ui/pages/monthly.js",
  "./js/ui/pages/overview.js",
  "./js/ui/pages/payclock.js",
  "./js/ui/pages/pledge.js",
  "./js/ui/pages/progress.js",
  "./js/ui/pages/salary.js",
  "./js/ui/pages/schedule.js",
  "./js/ui/pages/settings.js",
  "./js/ui/reminder.js",
  "./js/ui/update.js",
  "./manifest.webmanifest",
  "./schema/finance-v1.schema.json",
  "./sitemap.xml",
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

// ---- 繳費提醒 ----
// 頁面會把接下來 14 天的應繳快照存進 'reminders-data' 快取（只在本機）。Periodic Background Sync 觸發時（僅部分 Android 瀏覽器），
// 檢查「明天」是否有項目並顯示通知；tag 與頁面端相同，所以同一天不會重複出現。
const REMIND_CACHE = 'reminders-data';
async function remindIfDue() {
  const c = await caches.open(REMIND_CACHE);
  const res = await c.match('./__reminders.json');
  if (!res) return;
  const { items, tone } = await res.json();
  const tomorrow = new Date(Date.now() + 8 * 3600e3 + 24 * 3600e3).toISOString().slice(0, 10);
  const due = (items || []).filter((x) => x.date === tomorrow);
  if (!due.length) return;
  const tag = 'pfs-due-' + tomorrow;
  if ((await self.registration.getNotifications({ tag })).length) return;
  const total = due.reduce((a, x) => a + Math.abs(x.amount), 0);
  const money = (n) => Math.abs(Math.round(n)).toLocaleString('en-US');
  const lines = due.slice(0, 5).map((x) => x.item + '　NT$' + money(x.amount));
  if (due.length > 5) lines.push('…另有 ' + (due.length - 5) + ' 筆');
  await self.registration.showNotification('明天要繳 ' + due.length + ' 筆，合計 NT$' + money(total) + (tone === 'encourage' ? '——提前知道，就能從容安排' : ''), { body: lines.join('\n'), tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', lang: 'zh-Hant' });
}
self.addEventListener('periodicsync', (e) => { if (e.tag === 'pfs-remind') e.waitUntil(remindIfDue().catch(() => {})); });
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((all) => {
    for (const c of all) if ('focus' in c) { c.navigate?.('./#/calendar').catch(() => {}); return c.focus(); }
    return self.clients.openWindow('./#/calendar');
  }));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.searchParams.has('check')) return; // 「檢查更新」直接走網路，不讀也不寫快取

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
