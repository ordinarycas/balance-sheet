// 引擎：ApexCharts 4.7.0（MIT，本地 UMD；5 版起改為非開源授權，故固定在 4.x）。SVG 繪圖，內建觸控 tooltip。
import { loadScript, loadCss } from './loader.js';

export async function draw(wrap, container, spec, th) {
  // ApexCharts 啟動時若找不到 id="apexcharts-css" 的元素，會自行注入 inline <style>（被 CSP 擋下）。
  // 所以直接讓外部的 apexcharts.css <link> 取這個 id，它就不會再注入。
  await Promise.all([loadScript('apexcharts.min.js'), loadCss('apexcharts.css', 'apexcharts-css')]);
  const ApexCharts = globalThis.ApexCharts;
  const { labels, series, stacked, kind, yFmt, tipFmt } = spec;
  // 引擎自己會在圖裡放可聚焦的元素，role=img 底下不能有可聚焦的子元素（axe: nested-interactive），所以用 group
  container.setAttribute('role', 'group');
  container.setAttribute('aria-roledescription', '圖表');
  container.setAttribute('aria-label', spec.title || '圖表');
  const single = series.length === 1;
  const type = kind === 'bar' ? 'bar' : single ? 'area' : 'line';

  const options = {
    chart: {
      type, height: spec.height, stacked: kind === 'bar' && stacked,
      toolbar: { show: false }, zoom: { enabled: false }, animations: { enabled: false },
      fontFamily: th.font, foreColor: th.muted, background: 'transparent', parentHeightOffset: 0,
    },
    series: series.map((s) => ({ name: s.name, data: s.values.map((v) => v ?? 0) })),
    colors: th.colors.slice(0, series.length),
    xaxis: { categories: labels, labels: { rotate: 0, hideOverlappingLabels: true, style: { fontSize: '11px' } }, axisBorder: { show: false }, tooltip: { enabled: false } },
    yaxis: { labels: { formatter: (v) => yFmt(v), style: { fontSize: '11px' } } },
    stroke: { width: kind === 'bar' ? 0 : 2, curve: 'smooth' },
    fill: { opacity: type === 'area' ? 0.25 : 1 },
    dataLabels: { enabled: false },
    legend: { show: false },
    markers: { size: 0, hover: { size: 5 } },
    grid: { borderColor: th.line, strokeDashArray: 0 },
    tooltip: { shared: true, intersect: false, theme: th.dark ? 'dark' : 'light', y: { formatter: (v) => tipFmt(v ?? 0) } },
    plotOptions: { bar: { columnWidth: '62%' } },
  };
  if (kind === 'bar' && !stacked && single) options.plotOptions.bar.colors = { ranges: [{ from: -1e15, to: -1e-9, color: th.neg }] }; // 負值（缺口）改用警示色
  const chart = new ApexCharts(container, options);
  await chart.render();
  return {
    dispose() { try { chart.destroy(); } catch { /* 已移除 */ } },
    // SVG 以 viewBox 等比縮放，避免列印時被頁寬裁切
    beforePrint() {
      const el = container.querySelector('svg.apexcharts-svg');
      if (!el) return;
      const w = el.getAttribute('width'); const hh = el.getAttribute('height');
      if (!el.getAttribute('viewBox') && w && hh) { el.setAttribute('viewBox', `0 0 ${parseFloat(w)} ${parseFloat(hh)}`); el.dataset.pfsVb = '1'; }
      el.style.width = '100%'; el.style.height = 'auto';
    },
    afterPrint() {
      const el = container.querySelector('svg.apexcharts-svg');
      if (!el) return;
      if (el.dataset.pfsVb) { el.removeAttribute('viewBox'); delete el.dataset.pfsVb; }
      el.style.width = ''; el.style.height = '';
    },
  };
}
