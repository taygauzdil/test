// Preparation screen: backpack grid around the gladiator, bench, shop, drag & drop,
// rotation, merging, selling, body-connection visualisation.
import { CELLS, GRID_COLS, GRID_ROWS, REGION_ANCHOR, regionsTouched } from '../grid.js';
import { ITEMS, REGION_LABEL, footprint, stats, sellPrice, MAX_LEVEL } from '../items.js';
import { resolveLoadout, statSummary } from '../loadout.js';
import { iconUrl } from '../render/icons.js';
import { CONFIG } from '../config.js';
import { REGION_SHORT, isArm } from '../body.js';
import { SFX } from '../audio.js';

const $ = s => document.querySelector(s);
const STAT_LABEL = {
  dmg: ['Damage', v => v], cooldown: ['Attack', v => `every ${v}s`], reach: ['Reach', v => v.toFixed(1) + 'm'], kb: ['Knockback', v => v.toFixed(1)],
  armor: ['Armor', v => '+' + v], hp: ['Max HP', v => '+' + v], stability: ['Stability', v => '+' + v], block: ['Block', v => Math.round(v * 100) + '%'],
  steal: ['Steals', v => v + ' coin' + (v > 1 ? 's' : '')], move: ['Move', v => Math.round(v * 100) + '%'],
};
const STAT_ORDER = ['dmg', 'block', 'armor', 'hp', 'stability', 'steal', 'cooldown', 'reach', 'kb', 'move'];

export class PrepUI {
  constructor({ match, onChange, onHover, onFight, toast, flyCoins }) {
    this.m = match;
    this.onChange = onChange; this.onHover = onHover; this.onFight = onFight;
    this.toast = toast; this.flyCoins = flyCoins;
    this.cell = 56;
    this.selected = null;
    this.drag = null;
    this.lo = resolveLoadout(match.inv);
    this.prevStats = null;
    this._buildGrid();
    this._bind();
  }

  // ---------- layout ----------
  layout() {
    const app = $('#app');
    const W = app.clientWidth, H = app.clientHeight;
    const wrap = $('#gridWrap');
    // measure everything except the grid
    const used = ['.topbar', '#stats', '#benchRow', '#shop', '.bottom'].reduce((s, q) => {
      const el = $('#prep ' + q) || $(q); const cs = getComputedStyle(el);
      return s + el.offsetHeight + (q === '.bottom' ? 0 : parseFloat(cs.marginTop) + parseFloat(cs.marginBottom));
    }, 0);
    const avail = H - used - 8;
    const cell = Math.floor(Math.min((W - 16) / GRID_COLS, avail / GRID_ROWS));
    this.cell = Number.isFinite(cell) ? Math.max(36, cell) : 56;
    document.documentElement.style.setProperty('--cell', this.cell + 'px');
    this._placeCells();
    this.render();
  }

  gridRect() {
    const a = $('#app').getBoundingClientRect(), g = $('#gridWrap').getBoundingClientRect();
    return { x: g.left - a.left, y: g.top - a.top, w: g.width, h: g.height, cell: this.cell };
  }

  _buildGrid() {
    const grid = $('#grid');
    grid.innerHTML = '';
    this.cellEls = [];
    for (let y = 0; y < GRID_ROWS; y++) for (let x = 0; x < GRID_COLS; x++) {
      const c = CELLS[y][x]; if (!c) continue;
      const el = document.createElement('div');
      el.className = 'cell'; el.dataset.x = x; el.dataset.y = y;
      el.innerHTML = `<div class="rg">${c.regions.map(r => `<i class="r-${r}"></i>`).join('')}</div>`;
      grid.appendChild(el);
      this.cellEls.push({ el, x, y, c });
    }
    const tags = $('#regionTags');
    tags.innerHTML = Object.keys(REGION_ANCHOR).map(r => `<div class="rtag" data-r="${r}">${REGION_SHORT[r]}</div>`).join('');
  }

  _placeCells() {
    const c = this.cell;
    if (!c) return;
    for (const { el, x, y } of this.cellEls) { el.style.left = x * c + 'px'; el.style.top = y * c + 'px'; }
    for (const t of document.querySelectorAll('.rtag')) {
      const [ax, ay] = REGION_ANCHOR[t.dataset.r];
      t.style.left = ax * c + 'px'; t.style.top = ay * c + 'px';
    }
    $('#links').setAttribute('viewBox', `0 0 ${GRID_COLS * c} ${GRID_ROWS * c}`);
  }

  // ---------- rendering ----------
  itemEl(item, unit, { shop = false } = {}) {
    const def = ITEMS[item.id];
    const f = footprint(item);
    const el = document.createElement('div');
    el.className = `item k-${def.kind} lv${item.level}`;
    el.style.width = f.w * unit + 'px'; el.style.height = f.h * unit + 'px';
    const pad = Math.max(4, unit * 0.12);
    const iw = def.w * unit - pad * 2, ih = def.h * unit - pad * 2;
    const rot = item.rot % 2 ? 'rotate(90deg)' : '';
    el.innerHTML = `<div class="card"><img src="${iconUrl(item.id, item.level)}" style="width:${iw}px;height:${ih}px;transform:translate(-50%,-50%) ${rot}">
      <div class="lvl l${item.level}">${'★'.repeat(item.level)}</div><div class="off">INACTIVE</div></div>`;
    if (item.uid) el.dataset.uid = item.uid;
    return el;
  }

  render() {
    const m = this.m;
    this.lo = resolveLoadout(m.inv);
    const c = this.cell;
    // grid items
    const grid = $('#grid');
    grid.querySelectorAll('.item').forEach(e => e.remove());
    for (const it of m.inv.items) {
      const el = this.itemEl(it, c);
      el.style.left = it.x * c + 'px'; el.style.top = it.y * c + 'px';
      const s = this.lo.status[it.uid];
      if (!s.active) el.classList.add('inactive');
      if (this.selected === it.uid) el.classList.add('selected');
      el.addEventListener('pointerdown', e => this._down(e, { type: 'grid', uid: it.uid }));
      grid.appendChild(el);
    }
    // bench
    const bench = $('#bench');
    bench.innerHTML = '';
    const bu = Math.min(24, c * 0.45);
    for (const it of m.inv.bench) {
      const el = this.itemEl(it, bu);
      if (this.selected === it.uid) el.classList.add('selected');
      el.addEventListener('pointerdown', e => this._down(e, { type: 'bench', uid: it.uid }));
      bench.appendChild(el);
    }
    $('#hint').textContent = m.inv.bench.length ? 'Place bench items in the backpack (or sell them) before fighting.' : 'Drag items onto the grid. Cells touching a body part power it.';
    // shop
    const cards = $('#shopCards');
    cards.innerHTML = '';
    const owned = new Set([...m.inv.items, ...m.inv.bench].filter(i => i.level === 1).map(i => i.id));
    m.shop.forEach((o, i) => {
      const def = ITEMS[o.id];
      const card = document.createElement('div');
      card.className = 'offer' + (o.sold ? ' sold' : '') + (m.coins < def.price ? ' poor' : '');
      const u = Math.min(32, 60 / def.h, 84 / def.w);
      card.innerHTML = `<div class="pic"></div><div class="nm">${def.name}</div><div class="pr"><span class="coin-ico"></span>${def.price}</div>${owned.has(o.id) ? '<div class="own">MERGE</div>' : ''}`;
      card.querySelector('.pic').appendChild(this.itemEl({ id: o.id, level: 1, rot: 0 }, u));
      card.addEventListener('pointerdown', e => this._down(e, { type: 'shop', index: i }));
      cards.appendChild(card);
    });
    // header
    $('#coins').textContent = m.coins;
    $('#roundNo').textContent = m.round;
    $('#scoreboard').innerHTML = scoreboardHTML(m);
    // stats
    const ss = statSummary(this.lo);
    $('#stats').innerHTML = ss.map(([ic, k, v], i) => `<span class="stat${this.prevStats && this.prevStats[i] < v ? ' up' : ''}">${ic} ${k} <b>${v}</b></span>`).join('');
    this.prevStats = ss.map(s => +s[2]);
    $('#fightBtn').classList.toggle('warn', !m.canFight);
    this._links();
    this.onChange && this.onChange(this.lo);
  }

  _links() {
    const c = this.cell, svg = $('#links');
    let out = '';
    const activeRegions = new Set();
    for (const it of this.m.inv.items) {
      const s = this.lo.status[it.uid]; const f = footprint(it);
      const cx = (it.x + f.w / 2) * c, cy = (it.y + f.h / 2) * c;
      if (s.active) {
        for (const r of s.regions) {
          const [ax, ay] = REGION_ANCHOR[r]; activeRegions.add(r);
          out += `<line x1="${cx}" y1="${cy}" x2="${ax * c}" y2="${ay * c}" stroke="#5dffa6" stroke-width="2.5" stroke-opacity=".55" stroke-dasharray="5 5" stroke-linecap="round"><animate attributeName="stroke-dashoffset" from="20" to="0" dur="1s" repeatCount="indefinite"/></line>`;
        }
      } else {
        const def = ITEMS[it.id];
        for (const r of s.touched.filter(r => def.regions.includes(r))) {
          const [ax, ay] = REGION_ANCHOR[r];
          out += `<line x1="${cx}" y1="${cy}" x2="${ax * c}" y2="${ay * c}" stroke="#ff5a5f" stroke-width="2" stroke-opacity=".5" stroke-dasharray="3 6"/>`;
        }
      }
    }
    for (const r of activeRegions) {
      const [ax, ay] = REGION_ANCHOR[r];
      out += `<circle cx="${ax * c}" cy="${ay * c}" r="${c * 0.12}" fill="#5dffa6" fill-opacity=".7"><animate attributeName="r" values="${c * 0.09};${c * 0.15};${c * 0.09}" dur="1.6s" repeatCount="indefinite"/></circle>`;
    }
    svg.innerHTML = out;
  }

  // ---------- input ----------
  _bind() {
    $('#fightBtn').addEventListener('click', () => {
      SFX.click();
      if (!this.m.canFight) { this.toast('Place or sell your bench items first!'); this._flashBench(); return; }
      this.closeInfo();
      this.onFight();
    });
    window.addEventListener('keydown', e => { if ((e.key === 'r' || e.key === 'R') && this.drag?.started) this._rotateDrag(); });
    document.addEventListener('pointerdown', e => {
      if (this.drag?.started && e.pointerId !== this.drag.pointerId) this._rotateDrag();   // second finger rotates
      else if (!e.target.closest('#info') && !e.target.closest('.item') && !e.target.closest('.offer')) this.closeInfo();
    });
    document.addEventListener('contextmenu', e => { if (this.drag?.started) { e.preventDefault(); this._rotateDrag(); } });
  }

  _flashBench() { const b = $('#benchRow'); b.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }], { duration: 300 }); }

  _srcItem(src) {
    if (src.type === 'shop') { const o = this.m.shop[src.index]; return o && !o.sold ? { uid: null, id: o.id, level: 1, rot: 0 } : null; }
    return this.m.inv.get(src.uid);
  }

  _down(e, src) {
    if (this.drag) return;
    e.preventDefault(); e.stopPropagation();
    const it = this._srcItem(src); if (!it) return;
    SFX.unlock();
    const r = e.currentTarget.getBoundingClientRect();
    this.drag = { src, pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, started: false, item: { ...it }, el: e.currentTarget, rect: r };
    const move = ev => { if (ev.pointerId === this.drag?.pointerId) this._move(ev); };
    const up = ev => {
      if (ev.pointerId !== this.drag?.pointerId) return;
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      this._up(ev);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }

  _move(e) {
    const d = this.drag;
    if (!d.started) {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 7) return;
      this._startDrag(e);
    }
    d.x = e.clientX; d.y = e.clientY;
    this._updateGhost();
    this._hover();
  }

  _startDrag(e) {
    const d = this.drag;
    d.started = true;
    this.closeInfo();
    const c = this.cell, f = footprint(d.item);
    if (d.src.type === 'grid') {
      // keep grab point relative to the item, in cell units
      const gx = (d.sx - d.rect.left) / d.rect.width * f.w, gy = (d.sy - d.rect.top) / d.rect.height * f.h;
      d.grab = [Math.min(f.w - 0.01, gx), Math.min(f.h - 0.01, gy)];
    } else d.grab = [f.w / 2, f.h / 2];
    d.lift = d.src.type === 'grid' ? 0 : c * 0.3;   // lift small items above the finger
    d.ghost = this.itemEl(d.item, c);
    $('#drag-layer').appendChild(d.ghost);
    if (d.src.type !== 'shop') d.el.classList.add('dragging-src');
    const owned = d.src.type !== 'shop';
    $('#sellZone').classList.toggle('on', owned);
    if (owned) $('#sellAmt').innerHTML = `+${sellPrice(d.item, CONFIG.sellRatio)} <span class="coin-ico" style="width:14px;height:14px;vertical-align:-2px"></span>`;
    SFX.pick();
  }

  _rotateDrag() {
    const d = this.drag; if (!d) return;
    d.item.rot = (d.item.rot + 1) % 2;
    const f = footprint(d.item); d.grab = [f.w / 2, f.h / 2];
    d.ghost.remove(); d.ghost = this.itemEl(d.item, this.cell); $('#drag-layer').appendChild(d.ghost);
    this._updateGhost(); this._hover(); SFX.click();
  }

  _updateGhost() {
    const d = this.drag, a = $('#app').getBoundingClientRect(), c = this.cell;
    d.gl = d.x - a.left - d.grab[0] * c; d.gt = d.y - a.top - d.grab[1] * c - d.lift;
    d.ghost.style.left = d.gl + 'px'; d.ghost.style.top = d.gt + 'px';
  }

  _hover() {
    const d = this.drag, c = this.cell;
    this._clearHover();
    const g = $('#gridWrap').getBoundingClientRect(), a = $('#app').getBoundingClientRect();
    const px = d.x - g.left, py = d.y - g.top - d.lift;
    const f = footprint(d.item);
    d.target = null;
    const inShop = pointIn($('#shop'), d.x, d.y), inBench = pointIn($('#benchRow'), d.x, d.y);
    if (d.src.type !== 'shop' && inShop) { $('#sellZone').classList.add('hot'); d.target = { kind: 'sell' }; this.onHover && this.onHover([], null); return; }
    if (inBench && d.src.type !== 'bench') {
      const ok = this.m.inv.bench.length < CONFIG.benchSize;
      $('#benchRow').classList.toggle('drop-ok', ok);
      d.target = ok ? { kind: 'bench' } : null; this.onHover && this.onHover([], null); return;
    }
    const cx = Math.floor(px / c), cy = Math.floor(py / c);
    const inside = px >= -c * 0.5 && py >= -c * 0.5 && px < (GRID_COLS + 0.5) * c && py < (GRID_ROWS + 0.5) * c;
    if (!inside) { this.onHover && this.onHover([], null); return; }
    // merge?
    const occ = this.m.inv.occupant(cx, cy, d.item.uid);
    if (occ && this.m.inv.canMerge({ ...d.item, uid: d.item.uid || '_new' }, occ)) {
      const el = $(`#grid .item[data-uid="${occ.uid}"]`);
      if (el) { el.classList.add('merge-target'); const tag = document.createElement('div'); tag.className = 'merge-tag'; tag.innerHTML = `MERGE<br>→ Lv.${occ.level + 1}`; el.appendChild(tag); }
      d.target = { kind: 'merge', uid: occ.uid };
      const s = this.lo.status[occ.uid];
      this.onHover && this.onHover(s ? s.touched : [], 'merge');
      return;
    }
    const tlx = Math.round((d.gl - (g.left - a.left)) / c), tly = Math.round((d.gt - (g.top - a.top)) / c);
    const ok = this.m.inv.canPlace({ ...d.item }, tlx, tly, d.item.uid);
    for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) {
      const ce = this.cellEls.find(e => e.x === tlx + i && e.y === tly + j);
      if (ce) ce.el.classList.add(ok ? 'ok' : 'no');
    }
    const regs = regionsTouched(tlx, tly, f.w, f.h);
    const def = ITEMS[d.item.id];
    for (const r of regs) {
      const t = document.querySelector(`.rtag[data-r="${r}"]`);
      if (t) t.classList.add(def.regions.includes(r) && ok ? 'on' : 'bad');
      this.cellEls.forEach(ce => { if (!ce.el.classList.contains('ok') && !ce.el.classList.contains('no') && ce.c.regions.includes(r) && ok) ce.el.classList.add('reg'); });
    }
    d.target = ok ? { kind: 'place', x: tlx, y: tly } : { kind: 'invalid' };
    d.ghost.classList.add(ok ? 'ghost-ok' : 'ghost-bad');
    this.onHover && this.onHover(regs.filter(r => def.regions.includes(r)), ok ? 'ok' : 'bad');
  }

  _clearHover() {
    this.drag?.ghost?.classList.remove('ghost-ok', 'ghost-bad');
    document.querySelectorAll('.cell.ok, .cell.no, .cell.reg').forEach(e => e.classList.remove('ok', 'no', 'reg'));
    document.querySelectorAll('.merge-target').forEach(e => e.classList.remove('merge-target'));
    document.querySelectorAll('.merge-tag').forEach(e => e.remove());
    document.querySelectorAll('.rtag').forEach(e => e.classList.remove('on', 'bad'));
    $('#sellZone').classList.remove('hot');
    $('#benchRow').classList.remove('drop-ok');
  }

  _up(e) {
    const d = this.drag;
    this.drag = null;
    if (!d.started) { this._tap(d.src); return; }
    this._clearHover();
    d.ghost.remove();
    d.el.classList.remove('dragging-src');
    $('#sellZone').classList.remove('on');
    this.onHover && this.onHover([], null);
    const t = d.target, m = this.m, src = d.src;
    let res = null;
    if (!t) { this.render(); return; }
    if (t.kind === 'invalid') { SFX.bad(); this.toast(src.type === 'shop' ? 'No room there - items cannot overlap' : 'Does not fit there'); this.render(); return; }
    if (t.kind === 'sell') {
      const v = m.sell(src.uid); SFX.sell(); this.toast(`Sold for ${v} coins`); this.flyCoins && this.flyCoins(d.x, d.y, v);
      this.selected = null; this.render(); return;
    }
    if (t.kind === 'bench') {
      if (src.type === 'shop') { res = m.buyToBench(src.index); if (res.ok) SFX.buy(); }
      else { const it = m.inv.get(src.uid); m.inv.remove(src.uid); m.inv.bench.push({ uid: it.uid, id: it.id, level: it.level, rot: it.rot }); SFX.drop(); res = { ok: true }; }
    } else if (t.kind === 'merge') {
      if (src.type === 'shop') res = m.buyAndMerge(src.index, t.uid);
      else { const out = m.inv.merge(src.uid, t.uid); res = out ? { ok: true, item: out } : { ok: false, why: 'Cannot merge' }; }
      if (res.ok) { SFX.merge(); this._mergeFx(t.uid); }
    } else if (t.kind === 'place') {
      if (src.type === 'shop') { res = m.buyAndPlace(src.index, t.x, t.y, d.item.rot); if (res.ok) SFX.buy(); }
      else { const ok = m.inv.place({ ...m.inv.get(src.uid), rot: d.item.rot }, t.x, t.y, d.item.rot); res = { ok }; if (ok) SFX.drop(); }
    }
    if (res && !res.ok) { SFX.bad(); this.toast(res.why || 'Cannot do that'); }
    this.render();
    if (res && res.ok && t.kind === 'merge') this._mergeFx(t.uid, true);
  }

  _mergeFx(uid, after) {
    if (!after) return;
    const el = $(`#grid .item[data-uid="${uid}"]`) || $(`#bench .item[data-uid="${uid}"]`);
    if (!el) return;
    el.classList.add('merged');
    const r = el.getBoundingClientRect(), a = $('#app').getBoundingClientRect();
    const cx = r.left - a.left + r.width / 2, cy = r.top - a.top + r.height / 2;
    const it = this.m.inv.get(uid);
    for (let i = 0; i < 22; i++) {
      const p = document.createElement('div'); p.className = 'burst';
      p.style.left = cx + 'px'; p.style.top = cy + 'px';
      p.style.background = i % 3 ? '#ffd34d' : '#fff';
      $('#app').appendChild(p);
      const ang = i / 22 * Math.PI * 2, dist = 40 + Math.random() * 50;
      p.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(ang) * dist - 5}px, ${Math.sin(ang) * dist - 5}px) scale(.2)`, opacity: 0 }], { duration: 650, easing: 'cubic-bezier(.2,.8,.4,1)' }).onfinish = () => p.remove();
    }
    this.toast(`${ITEMS[it.id].name} upgraded to Lv.${it.level}!`);
  }

  _tap(src) {
    SFX.click();
    if (src.type === 'shop') { this.selected = null; this.render(); this.showOffer(src.index); return; }
    this.selected = src.uid; this.render(); this.showItem(src.uid);
  }

  closeInfo() { $('#info').classList.add('hidden'); if (this.selected) { this.selected = null; this.render(); } }

  _statsHTML(id, level) {
    const st = ITEMS[id].levels[level - 1];
    const nx = level < MAX_LEVEL ? ITEMS[id].levels[level] : null;
    return STAT_ORDER.filter(k => st[k] !== undefined && STAT_LABEL[k]).map(k => {
      const [lab, fmt] = STAT_LABEL[k];
      const up = nx && nx[k] !== st[k] ? ` → ${fmt(nx[k])}` : '';
      return `<span class="${up ? 'nx' : ''}">${lab} <b>${fmt(st[k])}</b>${up}</span>`;
    }).join('');
  }

  _regionsLine(id) {
    const def = ITEMS[id];
    let s = 'Activates via: ' + regionList(def.regions);
    if (def.hands === 2) s += ' · Two-handed (its arm + the opposite arm at the same height)';
    else if (def.kind === 'weapon' || def.kind === 'shield') s += ' · One per arm';
    return s;
  }

  showItem(uid) {
    const it = this.m.inv.get(uid); if (!it) return;
    const def = ITEMS[it.id];
    const placed = this.m.inv.isPlaced(uid);
    const s = placed ? this.lo.status[uid] : null;
    const act = !placed ? '<div class="act no">On bench - drag it into the backpack</div>'
      : s.active ? `<div class="act ok">✔ Active: ${s.regions.map(r => REGION_LABEL[r]).join(', ')}</div>`
        : `<div class="act no">✖ Inactive: ${s.reason}</div>`;
    const info = $('#info');
    info.innerHTML = `<button class="x">×</button><h3>${def.name} <span class="lv">Lv.${it.level}</span></h3><div class="desc">${def.desc}<br><small>${this._regionsLine(it.id)}</small></div>
      <div class="st">${this._statsHTML(it.id, it.level)}</div>${act}
      <div class="btns"><button class="rot">⟳ Rotate</button><button class="sell">Sell +${sellPrice(it, CONFIG.sellRatio)}</button></div>`;
    info.classList.remove('hidden');
    info.querySelector('.x').onclick = () => this.closeInfo();
    info.querySelector('.rot').onclick = () => {
      if (this.m.inv.rotate(uid)) { SFX.click(); this.render(); this.showItem(uid); } else { SFX.bad(); this.toast('No room to rotate here'); }
    };
    info.querySelector('.sell').onclick = () => {
      const r = $(`.item[data-uid="${uid}"]`)?.getBoundingClientRect();
      const v = this.m.sell(uid); SFX.sell(); this.toast(`Sold for ${v} coins`);
      if (r) this.flyCoins && this.flyCoins(r.left + r.width / 2, r.top + r.height / 2, v);
      this.selected = null; info.classList.add('hidden'); this.render();
    };
  }

  showOffer(i) {
    const o = this.m.shop[i]; if (!o || o.sold) return;
    const def = ITEMS[o.id];
    const can = this.m.coins >= def.price, room = this.m.inv.bench.length < CONFIG.benchSize;
    const info = $('#info');
    info.innerHTML = `<button class="x">×</button><h3>${def.name} <span class="lv">Lv.1</span></h3><div class="desc">${def.desc}<br><small>${this._regionsLine(o.id)}</small></div>
      <div class="st">${this._statsHTML(o.id, 1)}</div>
      <div class="act ${can ? 'ok' : 'no'}">${can ? 'Drag it straight into the backpack, or buy to bench.' : `Not enough coins (need ${def.price})`}</div>
      <div class="btns"><button class="buy" ${can && room ? '' : 'disabled'}>Buy for ${def.price} 🪙</button></div>`;
    info.classList.remove('hidden');
    info.querySelector('.x').onclick = () => this.closeInfo();
    info.querySelector('.buy').onclick = () => {
      const r = this.m.buyToBench(i);
      if (r.ok) { SFX.buy(); this.toast(`Bought ${def.name} - now place it!`); info.classList.add('hidden'); this.render(); }
      else { SFX.bad(); this.toast(r.why); }
    };
  }
}

// "Body / any arm" instead of listing all six arms
export function regionList(regs) {
  const arms = regs.filter(isArm), rest = regs.filter(r => !isArm(r)).map(r => REGION_LABEL[r]);
  if (arms.length === 6) rest.push('any arm'); else rest.push(...arms.map(r => REGION_LABEL[r]));
  return rest.join(' / ');
}

function pointIn(el, x, y) { const r = el.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }

export function scoreboardHTML(m) {
  const dots = n => Array.from({ length: CONFIG.maxRounds }, (_, i) => `<i class="dot${i < n ? ' on' : ''}"></i>`).join('');
  return `<div class="sb-row p"><span>PLAYER</span><span class="dots">${dots(m.wins.p)}</span></div><div class="sb-row e"><span>ENEMY</span><span class="dots">${dots(m.wins.e)}</span></div>`;
}
