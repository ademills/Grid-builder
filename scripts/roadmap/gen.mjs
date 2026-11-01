// Builds the Pattern Studio Roadmap page (published as a claude.ai artifact)
// from roadmap-candidates.md (the original item text) + data.mjs (statuses,
// new items, releases and the proposed plan).
//
//   npm run roadmap            → builds/roadmap.html
//   node scripts/roadmap/gen.mjs [roadmap-candidates.md] [out.html]
//
// After a release: add it to SHIPPED, flip the items it covered to 'shipped'
// in REVIEW, move them out of PLAN/LATER, rebuild, and republish the page.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REVIEW, NEW_ITEMS, NEW_SECTIONS, SHIPPED, PLAN, LATER } from './data.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const mdPath = process.argv[2] ?? root + 'roadmap-candidates.md';
const outPath = process.argv[3] ?? root + 'builds/roadmap.html';
mkdirSync(dirname(outPath), { recursive: true });
const md = readFileSync(mdPath, 'utf8').replace(/\r/g, '');

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
const anchor = id => 'i' + id.replace('.', '-');

// ---- parse sections 0–11 -------------------------------------------------
const body = md.split('\n## Dependencies')[0];
const sections = [];
let sec = null, item = null, mode = null;
for (const line of body.split('\n')) {
  let m;
  if ((m = line.match(/^## (\d+)\. (.+)$/))) {
    sec = { num: +m[1], title: m[2], intro: [], items: [] }; sections.push(sec); item = null; continue;
  }
  if (!sec) continue;
  if ((m = line.match(/^### (\d+\.\d+) (.+)$/))) {
    item = { id: m[1], title: m[2], lines: [], needs: '' }; sec.items.push(item); mode = 'head'; continue;
  }
  if (line.startsWith('---')) { item = null; continue; }
  if (!item) { if (line.trim()) sec.intro.push(line); continue; }
  if ((m = line.match(/^\*\*Source:\*\* (.+?) · \*\*Cx:\*\* (\S+)(?: \((.+)\))?$/))) {
    item.src = m[1]; item.cx = m[2]; item.cxnote = m[3] || ''; mode = 'body'; continue;
  }
  if ((m = line.match(/^\*\*Needs from you:\*\* (.+)$/))) { item.needs = m[1][0].toUpperCase() + m[1].slice(1); mode = 'done'; continue; }
  if (mode === 'body') item.lines.push(line);
}

function blocks(lines) {
  let html = '', para = [], list = [];
  const flushP = () => { if (para.length) { html += `<p>${inline(para.join(' '))}</p>`; para = []; } };
  const flushL = () => { if (list.length) { html += `<ul>${list.map(l => `<li>${inline(l)}</li>`).join('')}</ul>`; list = []; } };
  for (const l of lines) {
    if (l.startsWith('- ')) { flushP(); list.push(l.slice(2)); }
    else if (!l.trim()) { flushP(); flushL(); }
    else { flushL(); para.push(l); }
  }
  flushP(); flushL();
  return html;
}

for (const s of sections) for (const it of s.items) it.desc = blocks(it.lines);
for (const [num, s] of Object.entries(NEW_SECTIONS)) sections.push({ num: +num, title: s.title, intro: [s.intro], items: [] });
for (const n of NEW_ITEMS) {
  const s = sections.find(x => x.num === n.sec);
  s.items.push({ ...n, isNew: true, cxnote: '', desc: `<p>${n.desc}</p>` });
}
sections.sort((a, b) => a.num - b.num);
for (const s of sections) s.items.sort((a, b) => +a.id.split('.')[1] - +b.id.split('.')[1]);

const all = sections.flatMap(s => s.items);
const byId = Object.fromEntries(all.map(i => [i.id, i]));
for (const it of all) {
  const r = it.isNew ? ['open', null, ''] : REVIEW[it.id];
  if (!r) throw new Error('No review for ' + it.id);
  [it.status, it.ver, it.note] = r;
}
const planOf = {};
for (const p of PLAN) for (const id of p.items) { if (!byId[id]) throw new Error('Plan id ' + id); planOf[id] = p; }
for (const id of LATER) if (!byId[id]) throw new Error('Later id ' + id);

// ---- pieces --------------------------------------------------------------
const CX_N = { S: 1, M: 2, L: 3, XL: 4 };
const DAYS = { S: 1, M: 3, L: 7, XL: 15 };
const cells = cx => `<span class="cells" aria-hidden="true">${[1, 2, 3, 4].map(n => `<i${n <= CX_N[cx] ? ' class="on"' : ''}></i>`).join('')}</span>`;
const cxTag = (cx, note = '') => `<span class="cx" title="Complexity ${cx}">${cells(cx)}<b>${cx}</b>${note ? `<span class="cxnote">${esc(note)}</span>` : ''}</span>`;
const STATUS = {
  shipped: 'Shipped', partial: 'Partly done', open: 'Open', hold: 'On hold', cut: 'Suggest cut',
};
const badge = it => `<span class="st st-${it.status}">${STATUS[it.status]}${it.ver && it.status !== 'cut' ? ` <span>v${it.ver}</span>` : ''}</span>`;

const counts = { shipped: 0, partial: 0, open: 0, hold: 0, cut: 0 };
for (const it of all) counts[it.status]++;
const total = all.length;
const origCount = all.filter(i => !i.isNew).length;
const newCount = total - origCount;

function itemHtml(it) {
  const plan = planOf[it.id];
  const later = LATER.includes(it.id);
  const planBadge = plan ? `<a class="plan-badge" href="#plan-${plan.ver.replace('.', '-')}" title="Proposed for v${plan.ver} ${esc(plan.name)}">→ v${plan.ver}</a>`
    : later ? `<a class="plan-badge later" href="#plan-later" title="In the Later lane">Later</a>` : '';
  const isShipped = it.status === 'shipped';
  const review = it.note ? `<div class="review"><span class="lbl">Review</span><p>${it.note.replace(/</g, '&lt;')}</p></div>` : '';
  const desc = isShipped
    ? `<details class="orig"><summary>Original idea</summary><div class="desc">${it.desc}</div></details>`
    : `<div class="desc">${it.desc}</div>${it.needs ? `<div class="needs"><span class="lbl">Needs from you</span><p>${inline(it.needs).replace(/&lt;code&gt;/g, '<code>')}</p></div>` : ''}`;
  return `
<article class="item st-row-${it.status}${it.isNew ? ' is-new' : ''}" id="${anchor(it.id)}" data-id="${it.id}" data-cx="${it.cx}" data-status="${it.status}" data-new="${it.isNew ? 1 : 0}" data-title="${esc(it.title)}">
  <div class="item-head">
    <span class="iid">${it.id}</span>
    <h3>${inline(it.title)}</h3>
    <div class="tags">${it.isNew ? '<span class="newtag">New</span>' : ''}${badge(it)}${planBadge}</div>
    <button type="button" class="cut" id="cut-${anchor(it.id)}" aria-pressed="false" title="Mark this item as cut">Cut</button>
  </div>
  <div class="meta">${cxTag(it.cx, it.cxnote)}<span class="src">${inline(it.src)}</span></div>
  ${review}
  ${desc}
</article>`;
}

function secHtml(s) {
  const intro = s.intro.length ? `<div class="sec-intro"><p>${s.intro.map(inline).join(' ')}</p></div>` : '';
  return `
<section class="sec" id="s${s.num}" data-sec="${s.num}">
  <header class="sec-head"><span class="sec-num">${s.num}</span><h2>${esc(s.title)}</h2><span class="sec-count" data-count-for="${s.num}">${s.items.length}</span></header>
  ${intro}
  ${s.items.map(itemHtml).join('')}
</section>`;
}

const chip = id => {
  const it = byId[id];
  return `<a class="ichip ichip-${it.status}" href="#${anchor(id)}" title="${esc(it.title)} · ${STATUS[it.status]}"><span class="iid">${id}</span><span class="ct">${inline(it.title)}</span>${cxTag(it.cx)}</a>`;
};

// Status overview bar
const order = ['shipped', 'partial', 'open', 'hold', 'cut'];
const overview = `
<div class="overview" aria-label="Status of all ${total} items">
  <div class="ov-bar">${order.map(k => `<span class="seg seg-${k}" style="flex-grow:${counts[k]}" title="${STATUS[k]}: ${counts[k]}"></span>`).join('')}</div>
  <ul class="ov-legend">${order.map(k => `<li><button type="button" class="ov-key" data-status="${k}" aria-pressed="false"><i class="sw sw-${k}"></i><b>${counts[k]}</b> ${STATUS[k].toLowerCase()}</button></li>`).join('')}</ul>
</div>`;

// Shipped track
const shippedTrack = `
<div class="track-wrap" role="region" aria-label="Releases since 21 October" tabindex="0">
  <ol class="track">
    <li class="node node-base"><span class="dot"></span><span class="ver">v1.1.0</span><span class="date">24 Sep</span><span class="nt">List written after this</span></li>
    ${SHIPPED.map(r => `
    <li class="node"><span class="dot"></span><span class="ver">v${r.ver}</span><span class="date">${r.date}</span><span class="nt">${esc(r.title)}</span>
      <span class="ticks" aria-label="${r.items.length} list items">${r.items.map(id => `<a href="#${anchor(id)}" title="${id} ${esc(byId[id].title)}"></a>`).join('')}</span>
      <span class="also">${esc(r.also)}</span></li>`).join('')}
  </ol>
</div>`;

// Proposed plan as a to-scale effort chart
let cum = 0;
const rows = PLAN.map(p => {
  const days = p.items.reduce((a, id) => a + DAYS[byId[id].cx], 0);
  const r = { ...p, days, start: cum }; cum += days; return r;
});
const totalDays = cum;
const tickStep = 10;
const maxTick = Math.ceil(totalDays / tickStep) * tickStep;
const pct = d => (d / maxTick * 100).toFixed(3) + '%';
const ticks = [];
for (let d = 0; d <= maxTick; d += tickStep) ticks.push(d);

const planHtml = `
<div class="gantt" role="img" aria-label="Proposed releases laid end to end by estimated effort, ${totalDays} working days in all">
  <div class="g-axis" aria-hidden="true"><span class="g-label"></span><div class="g-scale">${ticks.map(d => `<span style="left:${pct(d)}">${d}</span>`).join('')}</div></div>
  ${rows.map(r => `
  <div class="g-row"><span class="g-label"><b>v${r.ver}</b> ${esc(r.name)}</span>
    <div class="g-track">${ticks.map(d => `<i style="left:${pct(d)}"></i>`).join('')}
      <a class="g-bar" href="#plan-${r.ver.replace('.', '-')}" style="left:${pct(r.start)};width:${pct(r.days)}"><span>${r.days} d</span></a></div></div>`).join('')}
  <p class="g-note">Bar length = rough effort, counting S as 1 day, M as 3, L as 7. Days of work, not calendar dates.</p>
</div>
<ol class="plans">
  ${rows.map(r => `
  <li class="plan" id="plan-${r.ver.replace('.', '-')}">
    <div class="plan-head"><span class="plan-ver">v${r.ver}</span><h3>${esc(r.name)}</h3><span class="plan-days">${r.items.length} items · ~${r.days} days</span></div>
    <p class="plan-theme">${esc(r.theme)}. ${esc(r.why)}</p>
    <div class="chips-list">${r.items.map(chip).join('')}</div>
  </li>`).join('')}
  <li class="plan plan-later" id="plan-later">
    <div class="plan-head"><span class="plan-ver">Later</span><h3>Good ideas, not yet placed</h3><span class="plan-days">${LATER.length} items</span></div>
    <p class="plan-theme">Kept, but behind the releases above. Pull any of these forward.</p>
    <div class="chips-list">${LATER.map(chip).join('')}</div>
  </li>
</ol>`;

const tocHtml = `<ol>
  <li><a href="#roadmap"><span>◆</span>Roadmap<em></em></a></li>
  ${sections.map(s => `<li><a href="#s${s.num}"><span>${s.num}</span>${esc(s.title)}<em data-toc-count="${s.num}">${s.items.length}</em></a></li>`).join('')}
  <li><a href="#deps"><span>→</span>Dependencies<em></em></a></li></ol>`;

const cxCounts = { S: 0, M: 0, L: 0, XL: 0 };
for (const it of all) cxCounts[it.cx]++;

const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('./page.js', import.meta.url), 'utf8');

const html = `<title>Pattern Studio Roadmap</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>${css}</style>

<div class="wrap">
  <header class="top">
    <p class="eyebrow">Mills Pattern Studio · v1.7.2 released · reviewed 1 Nov 2026</p>
    <h1>Pattern Studio Roadmap</h1>
    <p class="lede">The original ${origCount} ideas, checked against the code as it stands after ten releases in eleven days, plus ${newCount} new items from this review. Each card says what shipped, what's left, and whether it's still worth doing. The proposed releases below are a suggestion. Mark items as cut as you go, then copy what's left.</p>
    ${overview}
  </header>

  <section class="roadmap" id="roadmap" aria-labelledby="rm-h">
    <div class="rm-head"><h2 id="rm-h">Roadmap</h2></div>
    <h3 class="rm-sub">Shipped since the list was written</h3>
    ${shippedTrack}
    <h3 class="rm-sub">Proposed next</h3>
    ${planHtml}
  </section>

  <div class="bar" role="search">
    <div class="bar-row">
      <label class="search" for="q"><span class="sr">Search items</span>
        <input id="q" type="search" placeholder="Search ${total} items" autocomplete="off">
      </label>
      <div class="status"><span id="shown">${total}</span> shown · <span id="cutn">0</span> cut</div>
      <div class="actions">
        <label class="toggle" for="hidecut"><input id="hidecut" type="checkbox"> Hide cut</label>
        <label class="toggle" for="hideship"><input id="hideship" type="checkbox"> Hide shipped</label>
        <button type="button" class="btn ghost" id="accept">Cut all suggested (${counts.cut})</button>
        <button type="button" class="btn" id="copy">Copy kept list</button>
        <button type="button" class="btn ghost" id="reset">Clear cuts</button>
      </div>
    </div>
    <div class="bar-row chips">
      ${order.map(k => `<button type="button" class="chip chip-st" id="stf-${k}" data-status="${k}" aria-pressed="false"><i class="sw sw-${k}"></i>${STATUS[k]}<span class="n">${counts[k]}</span></button>`).join('')}
      <button type="button" class="chip" id="newf" aria-pressed="false"><span class="newtag">New</span><span class="n">${newCount}</span></button>
      <span class="sep" aria-hidden="true"></span>
      ${['S', 'M', 'L', 'XL'].map(c => `<button type="button" class="chip chip-cx" id="cxf-${c}" data-cx="${c}" aria-pressed="false">${cells(c)}${c}<span class="n">${cxCounts[c]}</span></button>`).join('')}
    </div>
  </div>

  <div class="layout">
    <nav class="toc" aria-label="Sections">${tocHtml}</nav>
    <main>
      ${sections.map(secHtml).join('')}
      <p class="empty" id="empty" hidden>No items match these filters.</p>
      <section class="sec deps" id="deps">
        <header class="sec-head"><span class="sec-num">→</span><h2>Dependencies, updated</h2></header>
        <div class="sec-intro"><ul>
          <li><strong>Unblocked since the list was written.</strong> 0.10 (registry) shipped, so 1.8, 1.14, 10.1 and 10.3 are now cheap. 0.8 (workers) shipped, so 4.13 is feasible. 7.5 (strand layers) shipped, so the 3.12 seed brush can start.</li>
          <li><strong>4.21 Grid Pattern schemas</strong> come before 10.6 and before any decision on 7.7. Schemas are what make settings describable to Claude and to Surprise Me.</li>
          <li><strong>0.11 and 0.12</strong> (native smoke test, generator snapshots) should land before more generator work, so that changes to output are caught.</li>
          <li><strong>0.6 + 9.3</strong> still come before 8.1 and 8.2. Video export needs deterministic, loopable frames.</li>
          <li><strong>5.1 custom shapes</strong> comes before 5.3, 4.15 and the .svg drop in 1.4.</li>
          <li><strong>5.7 path merge</strong> makes 8.8 and 8.9 much better. The Linework backing code already merges solids and can be reused.</li>
          <li><strong>7.1 multi-layer</strong> and <strong>4.18 Grid Pattern hex cells</strong> are still the two most invasive changes. Linework's plates and cell shapes show both ideas working inside one mode, which may be enough.</li>
        </ul></div>
      </section>
      <footer class="foot">Built from <code>roadmap-candidates.md</code> in the Grid-builder-workspace worktree, reviewed against <code>main</code> at v1.7.2 (78c4ae8). Original research: VectorCraft and EffectCraft READMEs (github.com/storytold), getartcraft.com.</footer>
    </main>
  </div>
</div>
<script>${js}</script>
`;
writeFileSync(outPath, html);
console.log(`items ${total} (orig ${origCount}, new ${newCount})`, counts, 'plan days', totalDays);
