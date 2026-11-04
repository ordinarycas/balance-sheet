// 「薪資收入與時間」的純函式（無 DOM）。
// 平均餘命資料：內政部第十一次國民生命表（民國 108～110 年），取自「第十一次國民生命表提要分析」表 3、表 4 的 10 歲間隔數字；
// 單一歲數以相鄰兩個十歲點線性內插（近似值）。100 歲以上依該表假設為 0.5 歲。
// 平均餘命是「同年齡、同性別人口的平均」，不是對個人壽命的預測。
export const LIFE_TABLE = {
  source: '內政部 第十一次國民生命表（民國 108～110 年）',
  male: [[0, 77.41], [10, 67.96], [20, 58.17], [30, 48.52], [40, 39.08], [50, 30.32], [60, 22.33], [70, 15.03], [80, 9.11], [90, 4.87], [100, 0.5]],
  female: [[0, 83.83], [10, 74.34], [20, 64.46], [30, 54.66], [40, 44.96], [50, 35.51], [60, 26.42], [70, 17.86], [80, 10.62], [90, 5.28], [100, 0.5]],
};

/** 較新的「114 年簡易生命表」平均壽命（歲），僅供參考對照；它沒有分年齡的餘命資料。 */
export const LATEST_ABRIDGED = { year: 114, male: 77.93, female: 84.75, total: 81.27 };

/** 基本工資（勞動部）。2027（民國 116 年）數字為審議會決議，尚待行政院核定。 */
export const WAGE = {
  current: { label: '2026 年（現行）', monthly: 29500, hourly: 196 },
  proposed: { label: '2027 年（審議會決議，尚待行政院核定）', monthly: 30900, hourly: 205 },
};

/** 某性別、某年齡（可為小數）的平均餘命（年）。 */
export function remainingLife(sex, age) {
  const t = sex === 'female' ? LIFE_TABLE.female : LIFE_TABLE.male;
  const a = Math.max(Number(age) || 0, 0);
  if (a >= 100) return 0.5;
  const i = Math.min(Math.floor(a / 10), t.length - 2);
  const [a0, e0] = t[i];
  const [a1, e1] = t[i + 1];
  return e0 + ((e1 - e0) * (a - a0)) / (a1 - a0);
}

/** 以出生日（YYYY-MM-DD）與今天算年齡（含小數，1 年 ＝ 365.2425 天）。無效日期回傳 null。 */
export function ageOn(birthIso, todayIso) {
  const ok = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
  if (!ok(birthIso) || !ok(todayIso)) return null;
  const days = (Date.parse(`${todayIso}T00:00:00Z`) - Date.parse(`${birthIso}T00:00:00Z`)) / 86400000;
  return days < 0 ? null : days / 365.2425;
}

/**
 * 人生最低收入試算（以今天的新台幣計，不含調薪、通膨與折現）。
 * @param {{sex:'male'|'female', age:number, retireAge:number, monthly:number}} p
 * @param {{assets:number, debtService:number}|null} bs 代入資產負債時才給：assets＝股票現值；debtService＝尚未償還的本金加預估利息
 */
export function lifetimeIncome({ sex, age, retireAge, monthly }, bs = null) {
  const lifeLeft = remainingLife(sex, age);
  const endAge = age + lifeLeft;
  const workYears = Math.max(Math.min(retireAge, endAge) - age, 0);
  const workMonths = Math.round(workYears * 12);
  const income = monthly * workMonths;
  const lifeMonths = Math.max(Math.round(lifeLeft * 12), 1);
  const out = {
    lifeLeft, endAge, workYears, workMonths, income, lifeMonths,
    perLifeMonth: income / lifeMonths, // 把這輩子賺的錢平均分到每個月能用多少
    retired: age >= retireAge,
    retirementYears: Math.max(endAge - Math.max(retireAge, age), 0),
  };
  if (bs) {
    const resources = income + bs.assets;
    out.bs = {
      assets: bs.assets, debtService: bs.debtService, resources,
      afterDebt: resources - bs.debtService,
      perLifeMonthAfterDebt: (resources - bs.debtService) / lifeMonths,
      debtMonthsOfIncome: monthly > 0 ? bs.debtService / monthly : null,
    };
  }
  return out;
}

/** 尚未償還的借款本金與預估利息（還款表中基準日之後的繳款）＋質押已借本金。純資料，不含股票資產。 */
export function remainingDebtService(model) {
  let sum = 0;
  model.schedules.forEach((s) => {
    if (s.error) return;
    for (const r of s.rows) if (r.dueDn > model.asOfDn) sum += r.payment * s.fx;
    if (s.kind !== 'amortizing') {
      // 不攤還本金的借款（保單借款等）：本金仍要償還；還款表中只含利息，另外加上目前餘額
      const st = model.statuses[model.schedules.indexOf(s)];
      sum += st?.balanceTWD ?? 0;
    }
  });
  return sum + model.pledge.borrowed;
}
