// P09 支出：信用卡／房租／家裡支出
import { h } from '../dom.js';
import { twd } from '../fmt.js';
import { gridTable, section, tabs } from '../components/table.js';
import { numField, textField, dateField, monthField, selectField, labeled, button, deleteButton, pasteBox } from '../components/forms.js';
import { dayInMonthOf, iso, monthKeyToDn } from '../../core/dates.js';
import { cardLabel, cardMonthAmount, cardIds, feeActive } from '../../core/expenses.js';

let tab = 'cards';

function cardsTab(app) {
  const st = app.state;
  const m = app.model;
  const ids = cardIds(st.cards);
  const cur = m.asOfMonth;
  const prev = m.overview.flow[0].month;
  const cardOptions = ids.map((id) => [id, cardLabel(st.cards, id)]);
  const out = [];

  // 彙總
  out.push(section('卡別彙總', gridTable({
    headers: ['卡別代號', '顯示名稱', `${prev} 帳期`, `${cur} 帳期`, '結帳日', '繳費日', ''],
    numCols: [2, 3, 4, 5],
    rows: ids.map((id) => [
      id,
      textField({ value: st.cards.names[id] ?? '', max: 40, placeholder: cardLabel({ names: {} }, id), mutate: (d, v) => { if (v) d.cards.names[id] = v; else delete d.cards.names[id]; } }),
      twd(cardMonthAmount(st.cards, id, prev)), twd(cardMonthAmount(st.cards, id, cur)),
      numField({ value: st.cards.statementDay[id] ?? '', int: true, min: 1, max: 31, nullable: true, mutate: (d, v) => { if (v === null) delete d.cards.statementDay[id]; else d.cards.statementDay[id] = v; } }),
      numField({ value: st.cards.payDay[id] ?? '', int: true, min: 1, max: 31, nullable: true, mutate: (d, v) => { if (v === null) delete d.cards.payDay[id]; else d.cards.payDay[id] = v; } }),
      deleteButton(() => { if (confirm(`刪除卡別「${cardLabel(st.cards, id)}」及其所有明細與固定費用？`)) app.commit((d) => {
        delete d.cards.payDay[id]; delete d.cards.statementDay[id]; delete d.cards.names[id];
        d.cards.entries = d.cards.entries.filter((e) => e.card !== id); d.cards.fixedFees = d.cards.fixedFees.filter((e) => e.card !== id);
      }); }),
    ]),
    empty: '尚未新增信用卡',
  }), h('div', { class: 'row' }, button('＋ 新增信用卡', () => app.commit((d) => {
    let n = 1; while (d.cards.payDay[`card${n}`] !== undefined || d.cards.statementDay[`card${n}`] !== undefined) n++;
    d.cards.payDay[`card${n}`] = 15; d.cards.statementDay[`card${n}`] = 1;
  }), 'primary')), h('p', { class: 'note', text: '繳費日會用在繳費日曆；有填繳費日的卡才會列入日曆。' })));

  // 固定費用
  out.push(section('固定費用', gridTable({
    headers: ['項目', '卡別', '金額（負數）', '起算月份', '結束月份', '週期', '本月入帳', ''],
    numCols: [2],
    rows: st.cards.fixedFees.map((f, i) => {
      const mk = (fn) => (d, v) => fn(d.cards.fixedFees[i], v);
      return [
        textField({ value: f.item, mutate: mk((x, v) => { x.item = v; }) }),
        selectField({ value: f.card, options: cardOptions, mutate: mk((x, v) => { x.card = v; }) }),
        numField({ value: f.amount, max: 0, mutate: mk((x, v) => { x.amount = v; }) }),
        monthField({ value: f.start, mutate: mk((x, v) => { x.start = v; }) }),
        monthField({ value: f.end ?? '', nullable: true, mutate: mk((x, v) => { x.end = v; }) }),
        selectField({ value: f.cycle, options: [['monthly', '每月'], ['yearly', '每年']], mutate: mk((x, v) => { x.cycle = v; }) }),
        feeActive(f, cur) ? '是' : '否',
        deleteButton(() => app.commit((d) => { d.cards.fixedFees.splice(i, 1); })),
      ];
    }),
    empty: '沒有固定費用',
  }), h('div', { class: 'row' }, ids.length ? button('＋ 新增固定費用', () => app.commit((d) => {
    d.cards.fixedFees.push({ item: '新項目', card: ids[0], amount: 0, start: cur, end: null, cycle: 'monthly' });
  })) : h('span', { class: 'muted', text: '請先新增信用卡' })),
  h('p', { class: 'note', text: '每年週期只在起算月份的同月份入帳；結束月份空白代表無限期。' })));

  // 逐筆明細
  const order = st.cards.entries.map((e, i) => i).sort((a, b) => (st.cards.entries[a].month < st.cards.entries[b].month ? 1 : st.cards.entries[a].month > st.cards.entries[b].month ? -1 : 0));
  out.push(section('逐筆明細', gridTable({
    headers: ['帳期月份', '卡別', '費用細項', '金額（負數）', ''],
    numCols: [3],
    rows: order.map((i) => {
      const e = st.cards.entries[i];
      const mk = (fn) => (d, v) => fn(d.cards.entries[i], v);
      return [
        monthField({ value: e.month, mutate: mk((x, v) => { x.month = v; }) }),
        selectField({ value: e.card, options: cardOptions, mutate: mk((x, v) => { x.card = v; }) }),
        textField({ value: e.item, mutate: mk((x, v) => { x.item = v; }) }),
        numField({ value: e.amount, max: 0, mutate: mk((x, v) => { x.amount = v; }) }),
        deleteButton(() => app.commit((d) => { d.cards.entries.splice(i, 1); })),
      ];
    }),
    empty: '尚無明細',
  }), h('div', { class: 'row' }, ids.length ? button('＋ 新增明細', () => app.commit((d) => { d.cards.entries.push({ month: cur, card: ids[0], item: '', amount: 0 }); }), 'primary') : null,
    button(`複製 ${prev} 明細到 ${cur}`, () => {
      const src = st.cards.entries.filter((e) => e.month === prev);
      if (!src.length) { app.toast(`${prev} 沒有明細可複製`); return; }
      if (st.cards.entries.some((e) => e.month === cur) && !confirm(`${cur} 已有明細，仍要再加入 ${src.length} 筆（可能重複）？`)) return;
      app.commit((d) => { for (const e of src) d.cards.entries.push({ ...e, month: cur }); });
      app.toast(`已複製 ${src.length} 筆到 ${cur}`);
    }, '', '把上個帳期的每一筆明細複製成本月，再逐筆修改金額'))));

  // 每月卡費合計
  out.push(section('每月卡費合計', gridTable({
    headers: ['月份', ...ids.map((id) => cardLabel(st.cards, id)), '合計'],
    numCols: ids.map((_, i) => i + 1).concat(ids.length + 1),
    rows: m.monthly.rows.map((r) => [r.month, ...ids.map((id) => twd(r.cards[id])), twd(r.cardTotal)]),
    rowClass: (i) => (m.monthly.rows[i].month === cur ? 'cur' : ''),
  })));
  return out;
}

function rentTab(app) {
  const st = app.state;
  const m = app.model;
  return [
    section('固定項目', h('div', { class: 'row' },
      labeled('每月房租（負數）', numField({ value: st.rent.monthlyRent, max: 0, mutate: (d, v) => { d.rent.monthlyRent = v; } })),
      labeled('每月匯款日（1–31）', numField({ value: st.rent.dueDay ?? '', int: true, min: 1, max: 31, nullable: true, mutate: (d, v) => { d.rent.dueDay = v; } }), '未填則不列入繳費日曆'))),
    section('逐月電費與匯款合計', gridTable({
      headers: ['月份', '房租', '電費（變動）', '匯款合計'],
      numCols: [1, 2, 3],
      rows: m.months.map((mo) => {
        const e = st.rent.electricity[mo] ?? 0;
        return [mo, twd(st.rent.monthlyRent), numField({ value: e, max: 0, mutate: (d, v) => { if (v === 0) delete d.rent.electricity[mo]; else d.rent.electricity[mo] = v; } }), twd(st.rent.monthlyRent + e)];
      }),
      rowClass: (i) => (m.months[i] === m.asOfMonth ? 'cur' : ''),
      foot: ['合計', twd(st.rent.monthlyRent * m.months.length), twd(m.months.reduce((a, mo) => a + (st.rent.electricity[mo] ?? 0), 0)), twd(m.monthly.totals.rent)],
    }), h('div', { class: 'row no-print' },
      button('空白月份沿用上月金額', () => app.commit((d) => {
        let last = 0;
        for (const mo of m.months) { const v = d.rent.electricity[mo] ?? 0; if (v === 0 && last !== 0) d.rent.electricity[mo] = last; else if (v !== 0) last = v; }
      }), '', '只填目前是 0 的月份，使用前一個有金額的月份'),
      pasteBox({ summary: '批次貼上電費（由第一個月起，每行一個月）', count: m.months.length, hint: `依序對應 ${m.months[0]} 起的各月；正數視為費用，自動轉為負數。`,
        apply: (vals) => app.commit((d) => { vals.forEach((v, i) => { if (v === 0) delete d.rent.electricity[m.months[i]]; else d.rent.electricity[m.months[i]] = v; }); }) })),
    h('p', { class: 'note', text: '電費與房租同日匯款，依實際帳單填入。' })),
  ];
}

function homeTab(app) {
  const st = app.state;
  const m = app.model;
  const bill = (key, mo) => {
    const b = st.home[key][mo];
    return [
      numField({ value: b?.amount ?? 0, max: 0, mutate: (d, v) => { if (v === 0 && !d.home[key][mo]?.date) delete d.home[key][mo]; else d.home[key][mo] = { amount: v, date: d.home[key][mo]?.date ?? null }; } }),
      dateField({ value: b?.date ?? '', nullable: true, mutate: (d, v) => { d.home[key][mo] = { amount: d.home[key][mo]?.amount ?? 0, date: v }; } }),
    ];
  };
  return [
    section('固定項目', h('div', { class: 'row' },
      labeled('每月網路費（負數）', numField({ value: st.home.internetFee, max: 0, mutate: (d, v) => { d.home.internetFee = v; } })),
      labeled('網路費扣款日（選填）', numField({ value: st.home.internetDay ?? '', int: true, min: 1, max: 31, nullable: true, mutate: (d, v) => { d.home.internetDay = v; } }), '未填＝每月底'))),
    section('逐月水電費', gridTable({
      headers: ['月份', '網路費', '水費', '水費扣款日', '電費', '電費扣款日', '合計'],
      numCols: [1, 2, 4, 6],
      rows: m.months.map((mo) => [mo, twd(st.home.internetFee), ...bill('water', mo), ...bill('electricity', mo),
        twd(st.home.internetFee + (st.home.water[mo]?.amount ?? 0) + (st.home.electricity[mo]?.amount ?? 0))]),
      rowClass: (i) => (m.months[i] === m.asOfMonth ? 'cur' : ''),
      foot: ['合計', twd(st.home.internetFee * m.months.length), '', '', '', '', twd(m.monthly.totals.home)],
    }), h('div', { class: 'row no-print' },
      ...['water', 'electricity'].flatMap((key) => {
        const name = key === 'water' ? '水費' : '電費';
        return [
          button(`${name}：空白月份沿用上月`, () => app.commit((d) => {
            let last = null;
            for (const mo of m.months) {
              const cur = d.home[key][mo];
              if (cur && cur.amount !== 0) { last = { mo, ...cur }; continue; }
              if (!last) continue;
              const day = last.date ? Number(last.date.slice(8, 10)) : null;
              d.home[key][mo] = { amount: last.amount, date: day ? iso(dayInMonthOf(monthKeyToDn(mo), 0, day)) : (cur?.date ?? null) };
            }
          }), '', '金額與扣款日（同一天）沿用前一個有金額的月份'),
          pasteBox({ summary: `批次貼上${name}（由第一個月起）`, count: m.months.length, hint: `依序對應 ${m.months[0]} 起的各月；只改金額，扣款日保留。`,
            apply: (vals) => app.commit((d) => { vals.forEach((v, i) => { const mo = m.months[i]; const old = d.home[key][mo]; if (v === 0 && !old?.date) delete d.home[key][mo]; else d.home[key][mo] = { amount: v, date: old?.date ?? null }; }); }) }),
        ];
      })),
    h('p', { class: 'note', text: '水費、電費填入扣款日與金額後才會列入繳費日曆；網路費未填扣款日時預設每月底。金額為 0 的項目不列入。' })),
  ];
}

export default function render(app) {
  const body = tab === 'cards' ? cardsTab(app) : tab === 'rent' ? rentTab(app) : homeTab(app);
  return h('div', null, h('h1', { text: '支出' }),
    h('p', { class: 'sub', text: '信用卡、房租、家裡支出的輸入。支出一律為負數。' }),
    tabs([['cards', '信用卡'], ['rent', '房租'], ['home', '家裡支出']], tab, (k) => { tab = k; app.rerender(); }), body);
}
