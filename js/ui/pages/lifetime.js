// P17 薪資收入與時間：依性別與生日，用國民生命表的平均餘命推算「人生最低收入」（預設以基本工資計算），
// 可選擇是否代入目前的資產負債。性別與生日只存在這個瀏覽器的偏好設定，不屬於匯出資料、不會傳出。
import { h } from '../dom.js';
import { twd } from '../fmt.js';
import { kpi, section } from '../components/table.js';
import { lifeTimeline, incomeCurve, waterfall } from '../components/lifechart.js';
import { choiceField, labeled } from '../components/forms.js';
import { todayTaipei } from '../../core/dates.js';
import { balanceSheet } from '../../core/scenario.js';
import { LIFE_TABLE, LATEST_ABRIDGED, WAGE, ageOn, lifetimeIncome, remainingDebtService } from '../../core/lifetime.js';

const yrs = (v) => `${v.toFixed(1)} 年`;
const ext = (href, text) => h('a', { href, target: '_blank', rel: 'noopener noreferrer', text });

export default function render(app) {
  const p = app.prefs;
  const today = todayTaipei();
  const root = h('div', null,
    h('h1', { text: '薪資收入與時間' }),
    h('p', { class: 'sub', text: '輸入性別與生日，用國民生命表的平均餘命，算出「如果一直只領基本工資，這輩子至少能賺多少」。這是用來理解時間與收入關係的參考數字，不是預測。' }));

  // ---- 輸入 ----
  const birth = h('input', { type: 'date', class: 'in', max: today, value: p.lifeBirth, 'aria-label': '生日' });
  birth.addEventListener('change', () => {
    if (birth.value && !(ageOn(birth.value, today) !== null)) { birth.value = p.lifeBirth; app.toast('生日不能晚於今天'); return; }
    app.setPref('lifeBirth', birth.value);
  });
  const retire = h('input', { type: 'number', class: 'in', min: 40, max: 80, step: 1, value: p.lifeRetire, 'aria-label': '預計退休年齡' });
  retire.addEventListener('change', () => {
    const v = Math.round(Number(retire.value));
    if (!Number.isFinite(v) || v < 40 || v > 80) { retire.value = p.lifeRetire; app.toast('退休年齡請輸入 40 到 80'); return; }
    app.setPref('lifeRetire', v);
  });
  const start = h('input', { type: 'number', class: 'in', min: 10, max: 80, step: 1, value: p.lifeStart || '', placeholder: '留空＝現在', 'aria-label': '從幾歲才開始存錢' });
  start.addEventListener('change', () => {
    if (start.value === '') { app.setPref('lifeStart', 0); return; }
    const v = Math.round(Number(start.value));
    if (!Number.isFinite(v) || v < 10 || v > 80) { start.value = p.lifeStart || ''; app.toast('請輸入 10 到 80 的整數，或留空代表從現在開始'); return; }
    app.setPref('lifeStart', v);
  });
  const kid = h('input', { type: 'checkbox', checked: p.lifeKid, 'aria-label': '有小孩' });
  kid.addEventListener('change', () => app.setPref('lifeKid', kid.checked));
  const kidAge = h('input', { type: 'number', class: 'in', min: 15, max: 60, step: 1, value: p.lifeKidAge || '', placeholder: '例如 30', 'aria-label': '幾歲生育', disabled: !p.lifeKid });
  kidAge.addEventListener('change', () => {
    if (kidAge.value === '') { app.setPref('lifeKidAge', 0); return; }
    const v = Math.round(Number(kidAge.value));
    if (!Number.isFinite(v) || v < 15 || v > 60) { kidAge.value = p.lifeKidAge || ''; app.toast('請輸入 15 到 60 的整數'); return; }
    app.setPref('lifeKidAge', v);
  });
  const custom = h('input', { type: 'number', class: 'in', min: 0, step: 1000, value: p.lifeMonthly || '', placeholder: '例如 40000', 'aria-label': '自訂月收入（NT$）', disabled: p.lifeWage !== 'custom' });
  custom.addEventListener('change', () => {
    const v = custom.value === '' ? 0 : Math.round(Number(custom.value));
    if (!Number.isFinite(v) || v < 0) { custom.value = p.lifeMonthly || ''; app.toast('請輸入 0 或以上的金額'); return; }
    app.setPref('lifeMonthly', v);
  });
  const useBs = h('input', { type: 'checkbox', checked: p.lifeUseBS, 'aria-label': '代入目前的資產負債情況' });
  useBs.addEventListener('change', () => app.setPref('lifeUseBS', useBs.checked));

  root.appendChild(h('div', { class: 'card no-print lifeform' },
    h('div', { class: 'incomebar' },
      labeled('性別（生命表依性別分開）', choiceField({ label: '性別', value: p.lifeSex, options: [['', '請選擇'], ['male', '男'], ['female', '女']], onChange: (v) => app.setPref('lifeSex', v) })),
      labeled('生日', birth),
      labeled('預計退休年齡', retire),
      labeled('從幾歲才開始存錢（留空＝現在）', start)),
    h('div', { class: 'incomebar' },
      h('label', { class: 'row clk-toggle' }, kid, h('span', { text: '有小孩（或打算生育）：在時間軸畫出育兒區間' })),
      labeled('幾歲生育（孩子出生時你幾歲）', kidAge)),
    h('div', { class: 'incomebar' },
      labeled('月收入', choiceField({
        label: '月收入來源', value: p.lifeWage,
        options: [['current', `基本工資 ${twd(WAGE.current.monthly)}（${WAGE.current.label}，預設）`], ['proposed', `基本工資 ${twd(WAGE.proposed.monthly)}（${WAGE.proposed.label}）`], ['custom', '自訂金額']],
        onChange: (v) => app.setPref('lifeWage', v),
      })),
      labeled('自訂月收入（NT$，稅前）', custom)),
    h('label', { class: 'row clk-toggle' }, useBs, h('span', { text: '代入目前的資產負債情況（股票資產、尚未償還的借款與預估利息、每月生活支出）' })),
    h('p', { class: 'note', text: '性別與生日只存在這個瀏覽器，不會匯出、不會傳到任何地方；清除瀏覽器資料就會消失。' })));

  const age = p.lifeBirth ? ageOn(p.lifeBirth, today) : null;
  if (!p.lifeSex || age === null) {
    root.appendChild(h('p', { class: 'note', text: '請先選擇性別並填入生日，就會顯示結果。' }));
  } else {
    const monthly = p.lifeWage === 'custom' ? p.lifeMonthly : (p.lifeWage === 'proposed' ? WAGE.proposed.monthly : WAGE.current.monthly);
    let bs = null;
    let living = 0;
    if (p.lifeUseBS) {
      const m = app.model;
      bs = { assets: balanceSheet(m).assets.total, debtService: remainingDebtService(m) };
      living = m.salary.budget.fixed;
    }
    const r = lifetimeIncome({ sex: p.lifeSex, age, retireAge: p.lifeRetire, monthly }, bs);
    // 從這個年紀「才」開始存錢：只算到退休前、從該年紀起的月數
    const stopAge = Math.min(p.lifeRetire, age + r.lifeLeft);
    const lateAge = p.lifeStart > age ? p.lifeStart : null;
    const lateYears = lateAge === null ? 0 : Math.max(stopAge - lateAge, 0);
    const lateIncome = lateAge === null ? null : monthly * Math.round(lateYears * 12);
    const lateStart = lateAge === null ? null : h('div', { class: 'grid' },
      kpi('從現在開始的累積收入', twd(r.income)),
      kpi(`從 ${lateAge} 歲才開始的累積收入`, twd(lateIncome), 'bad'),
      kpi('晚開始少掉的', twd(r.income - lateIncome)),
      kpi('晚了幾年', yrs(lateAge - age)));
    // 對照：從 18 歲就開始領基本工資（現行），一路做到退休
    const baseIncome = WAGE.current.monthly * Math.round(Math.max(stopAge - 18, 0) * 12);
    const baseCompare = stopAge > 18 ? h('div', { class: 'grid' },
      kpi('對照：18 歲起領基本工資，退休前累積', twd(baseIncome)),
      kpi('與上方「從現在開始」的差距', `${baseIncome - r.income >= 0 ? '＋' : '－'}${twd(Math.abs(baseIncome - r.income))}`),
      kpi('18 歲起到退休的工作年數', yrs(stopAge - 18))) : null;
    const endYear = Number(today.slice(0, 4)) + Math.round(r.lifeLeft);

    const extra = [];
    if (p.lifeSex === 'female') extra.push({ name: '35 歲以上生產風險較高', from: 35, to: 45 });
    let kidNote = null;
    if (p.lifeKid) {
      if (p.lifeKidAge) {
        const k = p.lifeKidAge;
        extra.push({ name: '育兒區間（孩子 20 歲成年）', from: k, to: k + 20 });
        const overlap = Math.max(Math.min(k + 20, p.lifeRetire) - Math.max(k, age), 0);
        kidNote = h('p', { class: 'note', text: `育兒區間：你 ${k}–${k + 20} 歲，孩子 20 歲成年時你 ${k + 20} 歲；其中約 ${overlap.toFixed(1)} 年落在「現在到退休」之間。這是把 20 年當成育兒期的簡化假設，不含大學以後的支援。` });
      } else kidNote = h('p', { class: 'note', text: '已勾選有小孩：請填「幾歲生育」，就會在時間軸畫出育兒區間。' });
    }
    if (p.lifeSex === 'female') kidNote = h('div', null, kidNote, h('p', { class: 'note', text: '「35 歲以上」是常見的高齡生產分界，只是統計上的風險提醒，不是診斷或決定；實際請與婦產科醫師討論。' }));
    root.appendChild(section('時間',
      h('div', { class: 'grid' },
        kpi('目前年齡', yrs(age)),
        kpi(`平均餘命（${p.lifeSex === 'male' ? '男' : '女'}）`, yrs(r.lifeLeft)),
        kpi('平均預期壽命到', `${(age + r.lifeLeft).toFixed(1)} 歲（約 ${endYear} 年）`),
        kpi(r.retired ? '已到退休年齡' : `距離退休（${p.lifeRetire} 歲）`, r.retired ? '—' : `${yrs(r.workYears)}（${r.workMonths} 個月）`)),
      lifeTimeline({ age, endAge: age + r.lifeLeft, retireAge: p.lifeRetire, extra }),
      kidNote,
      h('p', { class: 'note', text: `平均餘命來自「${LIFE_TABLE.source}」：同年齡、同性別全體人口的平均，不是對你個人壽命的預測；表中只有每 10 歲一個數字，其間以線性內插估計。` })));

    root.appendChild(section('人生最低收入',
      h('div', { class: 'grid' },
        kpi(`月收入（${p.lifeWage === 'custom' ? '自訂' : '基本工資'}）`, twd(monthly)),
        kpi('退休前還能賺到的總收入', twd(r.income), 'good'),
        kpi('平均分攤到餘命每個月', twd(r.perLifeMonth)),
        kpi('退休後預期還有', yrs(r.retirementYears))),
      incomeCurve({ age, endAge: age + r.lifeLeft, retireAge: p.lifeRetire, monthly, startAge: p.lifeStart, baseMonthly: WAGE.current.monthly, baseFrom: 18 }),
      baseCompare,
      lateStart,
      monthly <= 0 ? h('p', { class: 'note', text: '月收入是 0，請選擇基本工資或填入自訂金額。' }) : null,
      h('p', { class: 'note', text: `算法：月收入 × 12 × 從現在到退休的年數（${p.lifeRetire} 歲或預期壽命，取較早者）。以今天的新台幣計，稅前，不含調薪、通膨、折現、勞保年金與退休金，也不含失業或中斷工作的時間；這是「只靠基本工資」的保守下限，不是你實際會賺的金額。` })));

    if (r.bs) {
      const b = r.bs;
      const livingTotal = living * 12 * r.lifeLeft;
      const left = b.afterDebt - livingTotal;
      root.appendChild(section('代入目前的資產負債',
        h('div', { class: 'grid' },
          kpi('人生最低收入', twd(r.income)),
          kpi('＋ 股票資產（質押＋未質押現值）', twd(b.assets)),
          kpi('－ 尚未償還的借款（本金＋預估利息）', twd(b.debtService), b.debtService > 0 ? 'bad' : ''),
          kpi('＝ 還清借款後的總資源', twd(b.afterDebt), b.afterDebt < 0 ? 'bad' : 'good')),
        h('div', { class: 'grid' },
          kpi('平均每月可用（餘命分攤）', twd(b.perLifeMonthAfterDebt)),
          kpi('還清借款約等於幾個月收入', b.debtMonthsOfIncome === null ? '—' : `${b.debtMonthsOfIncome.toFixed(1)} 個月`),
          kpi('目前每月生活固定支出（P03）', twd(living)),
          kpi('若支出不變，餘命內合計', twd(livingTotal))),
        waterfall([
          { label: '人生最低收入', from: 0, to: r.income, kind: 'pos' },
          { label: '＋ 股票資產', from: r.income, to: r.income + b.assets, kind: 'pos' },
          { label: '－ 尚未償還的借款', from: r.income + b.assets, to: b.afterDebt, kind: 'neg' },
          { label: '＝ 還清借款後的總資源', from: 0, to: b.afterDebt, kind: 'sum' },
          { label: '－ 餘命內固定支出（假設不變）', from: b.afterDebt, to: left, kind: 'neg' },
          { label: '＝ 扣除支出後的餘裕', from: 0, to: left, kind: 'sum' },
        ], '資源增減圖（人生最低收入 → 餘裕）'),
        h('p', { class: left >= 0 ? 'note' : 'note', text: left >= 0
          ? `把餘命內的固定支出也扣掉後，仍有約 ${twd(left)} 的餘裕（假設支出與目前相同、不含通膨）。`
          : `把餘命內的固定支出也扣掉後，約差 ${twd(-left)}（假設支出與目前相同、不含通膨）。這代表光靠基本工資不夠，可以從「收入網站資源」找增加收入的方向，或到「還款進度」看提早還清能省多少利息。` }),
        h('p', { class: 'note', text: '資產只含本站記錄的股票；不含現金、存款、不動產與保險。借款利息依目前還款表推算（利率不變）；保單借款與股票質押以本金計。數字都來自你在本站輸入的資料。' })));
    }
  }

  root.appendChild(section('資料來源與假設',
    h('ul', { class: 'plain' },
      h('li', null, '基本工資：', ext('https://www.mol.gov.tw/1607/1632/1633/99195/post', '勞動部公告'), `。現行 2026 年月薪 ${twd(WAGE.current.monthly)}、時薪 ${twd(WAGE.current.hourly)}；勞動部 2026 年 9 月 24 日公布審議會決議，2027 年（民國 116 年）月薪調為 ${twd(WAGE.proposed.monthly)}、時薪 ${twd(WAGE.proposed.hourly)}，需經行政院核定才生效，因此預設仍用現行數字。`),
      h('li', null, '平均餘命：', ext('https://www.moi.gov.tw/cl.aspx?n=3409', '內政部國民生命表'), '第十一次（民國 108～110 年）。'),
      h('li', null, '較新的 ', ext('https://www.moi.gov.tw/News_Content.aspx?n=4&s=340439', `${LATEST_ABRIDGED.year} 年簡易生命表新聞稿`), `：平均壽命 ${LATEST_ABRIDGED.total} 歲（男 ${LATEST_ABRIDGED.male}、女 ${LATEST_ABRIDGED.female}），比第十一次高；但它沒有分年齡的餘命，所以本頁不採用，僅供對照。實際平均餘命很可能略高於本頁數字。`),
      h('li', null, '所有金額以今天的新台幣計，不考慮調薪、通膨與折現；退休年齡可自行調整，預設 65 歲。'))));
  return root;
}
