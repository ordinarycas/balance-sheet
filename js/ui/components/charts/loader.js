// 延遲載入本地 vendor 的傳統 UMD 腳本／樣式（不使用 CDN；CSP 只允許同源）。
const cache = new Map();
const url = (p) => new URL(`../../../../vendor/${p}`, import.meta.url).href;

export function loadScript(file) {
  if (!cache.has(file)) {
    cache.set(file, new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url(file);
      s.onload = () => resolve();
      s.onerror = () => { cache.delete(file); reject(new Error(`無法載入 ${file}`)); };
      document.head.appendChild(s);
    }));
  }
  return cache.get(file);
}

export function loadCss(file, id) {
  const key = `css:${file}`;
  if (!cache.has(key)) {
    cache.set(key, new Promise((resolve, reject) => {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      if (id) l.id = id;
      l.href = url(file);
      l.onload = () => resolve();
      l.onerror = () => { cache.delete(key); reject(new Error(`無法載入 ${file}`)); };
      document.head.appendChild(l);
    }));
  }
  return cache.get(key);
}
