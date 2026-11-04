// 逐筆合併匯入：把「匯入的資料」與「目前資料」依各區塊的自然鍵逐筆比對，而不是整塊取代。
// 純函式（不碰 DOM／儲存）；回傳合併後的完整狀態與每個區塊的報告。結果仍須通過 validateObject 才會寫入。
//
// 各區塊的比對鍵：
//   loans        id                   holdings / pledge.stocks   股票代號
//   realizedPnl  月份                  cards.entries              月份｜卡別｜細項（相同者依出現順序配對）
//   cards.fixedFees  細項｜卡別｜起算月  卡別設定（payDay／statementDay／names）  卡別代號
//   rent.electricity / home.water / home.electricity   月份
//   salary.scenarios  月薪數字（聯集）
//
// 策略（每個區塊各自選）：
//   skip    完全不動這個區塊
//   add     只新增「目前沒有」的筆；兩邊都有但內容不同的，保留目前的
//   update  新增，且兩邊都有但內容不同的以匯入的為準
//   純量欄位（如質押已借金額、房租金額）只有 update 才會被匯入的值覆蓋。

export const POLICIES = [['skip', '略過'], ['add', '只新增（保留現有）'], ['update', '新增並以匯入覆蓋差異']];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** 比對兩個「鍵→值」集合，回傳合併結果與計數。 */
function mergeKeyed(curItems, inItems, keyOf, policy) {
  const rep = { added: [], updated: [], unchanged: 0, kept: [] };
  const occ = (items) => {
    const seen = new Map();
    return items.map((x) => { const k = keyOf(x); const n = seen.get(k) ?? 0; seen.set(k, n + 1); return `${k}#${n}`; });
  };
  const curKeys = occ(curItems);
  const inKeys = occ(inItems);
  const curIdx = new Map(curKeys.map((k, i) => [k, i]));
  const out = curItems.map((x) => structuredClone(x));
  inItems.forEach((x, j) => {
    const k = inKeys[j];
    const label = k.replace(/#\d+$/, '');
    if (!curIdx.has(k)) { out.push(structuredClone(x)); rep.added.push(label); return; }
    const i = curIdx.get(k);
    if (same(curItems[i], x)) { rep.unchanged++; return; }
    if (policy === 'update') { out[i] = structuredClone(x); rep.updated.push(label); } else rep.kept.push(label);
  });
  return { items: out, rep };
}

function mergeMap(cur, inc, policy) {
  const out = { ...cur };
  const rep = { added: [], updated: [], unchanged: 0, kept: [] };
  for (const [k, v] of Object.entries(inc ?? {})) {
    if (!(k in cur)) { out[k] = structuredClone(v); rep.added.push(k); } else if (same(cur[k], v)) rep.unchanged++;
    else if (policy === 'update') { out[k] = structuredClone(v); rep.updated.push(k); } else rep.kept.push(k);
  }
  return { map: out, rep };
}

const emptyRep = () => ({ added: [], updated: [], unchanged: 0, kept: [] });
function addRep(a, b) {
  a.added.push(...b.added); a.updated.push(...b.updated); a.kept.push(...b.kept); a.unchanged += b.unchanged;
}

/** 純量欄位：只有 update 才會覆蓋；回報有幾個欄位不同。 */
function mergeScalars(target, current, incoming, keys, policy, rep) {
  for (const k of keys) {
    if (same(current[k], incoming[k])) { rep.unchanged++; continue; }
    if (policy === 'update') { target[k] = structuredClone(incoming[k]); rep.updated.push(k); } else rep.kept.push(k);
  }
}

const SECTION_MERGERS = {
  settings(cur, inc, policy) {
    const next = structuredClone(cur); const rep = emptyRep();
    mergeScalars(next, cur, inc, ['asOfDate', 'dayCountLoan', 'dayCountPledge', 'usdTwdManual', 'monthStart'], policy, rep);
    return { next, rep };
  },
  loans(cur, inc, policy) {
    const { items, rep } = mergeKeyed(cur, inc, (l) => l.id, policy);
    return { next: items, rep };
  },
  pledge(cur, inc, policy) {
    const next = structuredClone(cur); const rep = emptyRep();
    const s = mergeKeyed(cur.stocks, inc.stocks, (x) => x.code, policy);
    next.stocks = s.items; addRep(rep, s.rep);
    mergeScalars(next, cur, inc, ['borrowed', 'interestDay'], policy, rep);
    return { next, rep };
  },
  holdings(cur, inc, policy) {
    const { items, rep } = mergeKeyed(cur, inc, (x) => x.code, policy);
    return { next: items, rep };
  },
  realizedPnl(cur, inc, policy) {
    const { items, rep } = mergeKeyed(cur, inc, (x) => x.month, policy);
    return { next: items, rep };
  },
  cards(cur, inc, policy) {
    const next = structuredClone(cur); const rep = emptyRep();
    for (const f of ['payDay', 'statementDay', 'names']) { const m = mergeMap(cur[f], inc[f], policy); next[f] = m.map; addRep(rep, m.rep); }
    const e = mergeKeyed(cur.entries, inc.entries, (x) => `${x.month}｜${x.card}｜${x.item}`, policy);
    next.entries = e.items; addRep(rep, e.rep);
    const f = mergeKeyed(cur.fixedFees, inc.fixedFees, (x) => `${x.item}｜${x.card}｜${x.start}`, policy);
    next.fixedFees = f.items; addRep(rep, f.rep);
    return { next, rep };
  },
  rent(cur, inc, policy) {
    const next = structuredClone(cur); const rep = emptyRep();
    mergeScalars(next, cur, inc, ['monthlyRent', 'dueDay'], policy, rep);
    const m = mergeMap(cur.electricity, inc.electricity, policy); next.electricity = m.map; addRep(rep, m.rep);
    return { next, rep };
  },
  home(cur, inc, policy) {
    const next = structuredClone(cur); const rep = emptyRep();
    mergeScalars(next, cur, inc, ['internetFee', 'internetDay'], policy, rep);
    for (const f of ['water', 'electricity']) { const m = mergeMap(cur[f], inc[f], policy); next[f] = m.map; addRep(rep, m.rep); }
    return { next, rep };
  },
  salary(cur, inc, policy) {
    const next = structuredClone(cur); const rep = emptyRep();
    const have = new Set(cur.scenarios);
    for (const v of inc.scenarios) { if (have.has(v)) rep.unchanged++; else { next.scenarios.push(v); rep.added.push(String(v)); } }
    next.scenarios.sort((a, b) => a - b);
    mergeScalars(next, cur, inc, ['otherLiving'], policy, rep);
    return { next, rep };
  },
};

/**
 * @param {object} current 目前狀態
 * @param {object} incoming 已通過驗證的匯入資料
 * @param {Record<string,'skip'|'add'|'update'>} policies 各區塊策略（未列者視為 skip）
 * @returns {{state:object, report:Record<string,{added:string[],updated:string[],unchanged:number,kept:string[]}>}}
 */
export function mergeStates(current, incoming, policies) {
  const state = structuredClone(current);
  const report = {};
  for (const [name, fn] of Object.entries(SECTION_MERGERS)) {
    const policy = policies[name] ?? 'skip';
    if (policy === 'skip') { report[name] = null; continue; }
    const { next, rep } = fn(current[name], incoming[name], policy);
    state[name] = next;
    report[name] = rep;
  }
  return { state, report };
}

/** 預覽用：對每個區塊以兩種策略各算一次，回傳「若選 add／update 會發生什麼」。 */
export function previewMerge(current, incoming) {
  const out = {};
  for (const name of Object.keys(SECTION_MERGERS)) {
    out[name] = {
      add: mergeStates(current, incoming, { [name]: 'add' }).report[name],
      update: mergeStates(current, incoming, { [name]: 'update' }).report[name],
    };
  }
  return out;
}
