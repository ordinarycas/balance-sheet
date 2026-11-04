// P16 收入網站資源：求職網站連結與低門檻工作的條件與概略薪資（資料在 data/income-resources.js）。
// 連結只是一般超連結（新分頁開啟、不帶來源），本站不會把你的任何資料傳給這些網站。
import { h } from '../dom.js';
import { twd } from '../fmt.js';
import { dataTable, kpi, section } from '../components/table.js';
import { LINKS, MIN_WAGE, MIN_WAGE_NEXT, MIN_WAGE_SOURCE, DISCLAIMER, JOB_GROUPS } from '../../data/income-resources.js';

export default function render() {
  const root = h('div', null,
    h('h1', { text: '收入網站資源' }),
    h('p', { class: 'sub', text: '想增加收入時，可以先從這些網站找職缺，再參考下方各類低門檻工作的條件與概略薪資。' }));

  root.appendChild(section('求職網站',
    h('ul', { class: 'plain linklist' }, LINKS.map((l) => h('li', null,
      h('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer', text: l.name }),
      h('span', { class: 'note', text: `　${l.desc}` })))),
    h('p', { class: 'note', text: '連結會在新分頁開啟；本站不會把你的資料傳給這些網站。' })));

  root.appendChild(section('先看基本工資',
    h('div', { class: 'grid' },
      kpi(`${MIN_WAGE.year} 年基本工資（月薪）`, twd(MIN_WAGE.monthly)),
      kpi(`${MIN_WAGE.year} 年基本工資（時薪）`, twd(MIN_WAGE.hourly)),
      kpi(`${MIN_WAGE_NEXT.year} 年基本工資（月薪，待核定）`, twd(MIN_WAGE_NEXT.monthly)),
      kpi(`${MIN_WAGE_NEXT.year} 年基本工資（時薪，待核定）`, twd(MIN_WAGE_NEXT.hourly))),
    h('p', { class: 'note', text: `勞動部公告，自 ${MIN_WAGE.year} 年 1 月 1 日起實施。正式員工底薪不得低於月薪基本工資；計時工作不得低於時薪基本工資。${MIN_WAGE_NEXT.year} 年（民國 116 年）的月薪 ${twd(MIN_WAGE_NEXT.monthly)}、時薪 ${twd(MIN_WAGE_NEXT.hourly)} 是基本工資審議會的決議，需經行政院核定才生效，核定前仍以 ${MIN_WAGE.year} 年為準。` }),
    h('p', { class: 'note' }, '資料來源：', h('a', { href: MIN_WAGE_SOURCE.url, target: '_blank', rel: 'noopener noreferrer', text: MIN_WAGE_SOURCE.name }), '（新分頁開啟）')));

  root.appendChild(h('p', { class: 'note', role: 'note', text: DISCLAIMER }));

  for (const g of JOB_GROUPS) {
    root.appendChild(section(g.title,
      h('p', { text: g.intro }),
      dataTable({
        label: `${g.title}的條件與預估薪資`,
        cols: [
          { label: '職缺', get: (r) => r.name, wrap: true },
          { label: '條件', get: (r) => r.requirement, wrap: true },
          { label: '預估薪資（新台幣、稅前）', get: (r) => r.pay, wrap: true },
          { label: '備註', get: (r) => r.note, wrap: true },
        ],
        rows: g.jobs,
      })));
  }

  root.appendChild(h('p', { class: 'note' }, '想知道多賺一點能提早多久還清？到 ', h('a', { href: '#/progress', text: 'P14 還款進度' }), ' 的「收入目標」輸入想增加的月收入。'));
  return root;
}
