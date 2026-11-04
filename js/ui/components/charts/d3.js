// 引擎：D3.js 7（ISC，本地 UMD）。純 SVG：以 viewBox 等比縮放，列印時天然向量輸出；
// 指標事件（pointer）同時支援滑鼠與觸控，容器以 touch-action: pan-y 保留頁面垂直捲動。
import { loadScript } from './loader.js';
import { h } from '../../dom.js';

export async function draw(wrap, container, spec, th) {
  await loadScript('d3.min.js');
  const d3 = globalThis.d3;
  const { labels, series, stacked, kind, yFmt, tipFmt } = spec;
  const height = spec.height;
  const M = { top: 10, right: 10, bottom: 26, left: 52 };

  const svg = d3.select(container).append('svg').attr('class', 'd3chart').attr('role', 'img').attr('aria-label', spec.title || '圖表');
  const tip = h('div', { class: 'tvtip' });
  tip.style.display = 'none';
  wrap.appendChild(tip);

  let width = 0;
  function render() {
    const w = container.clientWidth;
    if (!w) return;
    width = w;
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${w} ${height}`).attr('width', '100%').attr('height', height);
    const iw = w - M.left - M.right;
    const ih = height - M.top - M.bottom;

    const x = d3.scaleBand().domain(labels.map((_, i) => i)).range([0, iw]).paddingInner(kind === 'bar' ? 0.25 : 0).paddingOuter(kind === 'bar' ? 0.1 : 0);
    const sums = labels.map((_, i) => series.reduce((a, s) => a + Math.max(s.values[i] ?? 0, 0), 0));
    const all = series.flatMap((s) => s.values.map((v) => v ?? 0));
    const hi = kind === 'bar' && stacked ? d3.max(sums) : d3.max(all);
    const lo = kind === 'bar' && stacked ? 0 : d3.min(all);
    const y = d3.scaleLinear().domain([Math.min(0, lo ?? 0), Math.max(0, hi ?? 0) || 1]).nice().range([ih, 0]);

    const g = svg.append('g').attr('transform', `translate(${M.left},${M.top})`);
    // 格線與 Y 軸
    const ticks = y.ticks(5);
    g.selectAll('line.grid').data(ticks).join('line').attr('class', 'grid').attr('x1', 0).attr('x2', iw).attr('y1', (d) => y(d)).attr('y2', (d) => y(d)).attr('stroke', th.line);
    g.selectAll('text.ytick').data(ticks).join('text').attr('class', 'ytick').attr('x', -6).attr('y', (d) => y(d)).attr('dy', '0.32em').attr('text-anchor', 'end')
      .attr('fill', th.muted).attr('font-size', 11).attr('font-family', th.font).text((d) => yFmt(d));
    // X 軸：標籤過密時間隔顯示
    const every = Math.max(1, Math.ceil(labels.length / Math.max(1, Math.floor(iw / 56))));
    g.selectAll('text.xtick').data(labels.map((l, i) => [l, i]).filter(([, i]) => i % every === 0)).join('text').attr('class', 'xtick')
      .attr('x', ([, i]) => x(i) + x.bandwidth() / 2).attr('y', ih + 17).attr('text-anchor', 'middle')
      .attr('fill', th.muted).attr('font-size', 11).attr('font-family', th.font).text(([l]) => l);

    if (kind === 'bar' && stacked) {
      const acc = labels.map(() => 0);
      series.forEach((s, k) => {
        g.selectAll(`rect.s${k}`).data(labels.map((_, i) => i)).join('rect').attr('class', `s${k}`)
          .attr('x', (i) => x(i)).attr('width', x.bandwidth()).attr('fill', th.colors[k])
          .attr('y', (i) => { const v = s.values[i] ?? 0; const top = acc[i] + v; return y(Math.max(top, acc[i])); })
          .attr('height', (i) => Math.abs(y(acc[i]) - y(acc[i] + (s.values[i] ?? 0))))
          .each((i) => { acc[i] += s.values[i] ?? 0; });
      });
    } else if (kind === 'bar') {
      const inner = d3.scaleBand().domain(series.map((_, k) => k)).range([0, x.bandwidth()]).padding(0.08);
      series.forEach((s, k) => {
        g.selectAll(`rect.s${k}`).data(labels.map((_, i) => i)).join('rect').attr('class', `s${k}`)
          .attr('x', (i) => x(i) + inner(k)).attr('width', inner.bandwidth())
          .attr('y', (i) => y(Math.max(s.values[i] ?? 0, 0))).attr('height', (i) => Math.abs(y(s.values[i] ?? 0) - y(0)))
          .attr('fill', (i) => ((s.values[i] ?? 0) < 0 ? th.neg : th.colors[k]));
      });
    } else {
      const cx = (i) => x(i) + x.bandwidth() / 2;
      series.forEach((s, k) => {
        const pts = s.values.map((v, i) => [cx(i), y(v ?? 0)]);
        if (series.length === 1) {
          g.append('path').attr('d', d3.area().x((d) => d[0]).y0(y(0)).y1((d) => d[1])(pts)).attr('fill', th.colors[k]).attr('fill-opacity', 0.2);
        }
        g.append('path').attr('d', d3.line()(pts)).attr('fill', 'none').attr('stroke', th.colors[k]).attr('stroke-width', 2);
      });
    }
    g.append('line').attr('x1', 0).attr('x2', iw).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', th.line);

    // 互動：十字線 + tooltip（滑鼠與觸控共用）
    const guide = g.append('line').attr('y1', 0).attr('y2', ih).attr('stroke', th.muted).attr('stroke-dasharray', '3 3').attr('visibility', 'hidden');
    const step = iw / labels.length;
    const show = (ev) => {
      const [px] = d3.pointer(ev, g.node());
      const i = Math.max(0, Math.min(labels.length - 1, Math.floor(px / step)));
      const cxv = x(i) + x.bandwidth() / 2;
      guide.attr('x1', cxv).attr('x2', cxv).attr('visibility', 'visible');
      tip.replaceChildren(h('strong', { text: labels[i] }), ...series.map((s) => h('div', { text: `${s.name}：${tipFmt(s.values[i] ?? 0)}` })));
      tip.style.display = 'block';
      tip.style.left = `${Math.min(Math.max(M.left + cxv + 12, 4), Math.max(wrap.clientWidth - tip.offsetWidth - 4, 4))}px`;
      tip.style.top = '8px';
    };
    const hide = () => { guide.attr('visibility', 'hidden'); tip.style.display = 'none'; };
    g.append('rect').attr('width', iw).attr('height', ih).attr('fill', 'transparent')
      .on('pointermove', show).on('pointerdown', show)
      .on('pointerleave', (ev) => { if (ev.pointerType !== 'touch') hide(); });
  }

  render();
  const ro = new ResizeObserver(() => { if (container.clientWidth !== width) render(); });
  ro.observe(container);
  const outside = (ev) => { if (!wrap.contains(ev.target)) { svg.selectAll('line[stroke-dasharray]').attr('visibility', 'hidden'); tip.style.display = 'none'; } };
  document.addEventListener('pointerdown', outside);

  return {
    dispose() { ro.disconnect(); document.removeEventListener('pointerdown', outside); svg.remove(); },
  };
}
