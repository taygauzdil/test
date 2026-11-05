// Grid inventory state + deterministic placement, rotation, merge and sell rules.
// Pure logic, no DOM. Shared by the player and AI opponents.
import { cellAt, cellsOf, GRID_COLS, GRID_ROWS } from './grid.js';
import { footprint, MAX_LEVEL, sellPrice } from './items.js';

let uidCounter = 1;
export const newUid = () => 'i' + (uidCounter++);

export class Inventory {
  constructor() {
    this.items = [];   // placed: { uid, id, level, x, y, rot, seq }
    this.bench = [];   // purchased but not placed: { uid, id, level, rot }
    this.seq = 1;      // equip order counter: earlier equipped weapons win an arm
  }

  occupant(x, y, ignoreUid) {
    for (const it of this.items) {
      if (it.uid === ignoreUid) continue;
      const f = footprint(it);
      if (x >= it.x && x < it.x + f.w && y >= it.y && y < it.y + f.h) return it;
    }
    return null;
  }

  // Can an item with this id/rot sit at x,y? Every covered cell must exist and be free.
  canPlace(item, x, y, ignoreUid = item.uid) {
    const f = footprint(item);
    if (x < 0 || y < 0 || x + f.w > GRID_COLS || y + f.h > GRID_ROWS) return false;
    for (const [cx, cy] of cellsOf(x, y, f.w, f.h)) {
      if (!cellAt(cx, cy)) return false;
      if (this.occupant(cx, cy, ignoreUid)) return false;
    }
    return true;
  }

  get(uid) { return this.items.find(i => i.uid === uid) || this.bench.find(i => i.uid === uid); }
  isPlaced(uid) { return this.items.some(i => i.uid === uid); }

  // Place (from bench / new) or move (within grid). Moving re-equips -> new seq.
  place(item, x, y, rot = item.rot || 0) {
    const probe = { ...item, rot };
    if (!this.canPlace(probe, x, y, item.uid)) return false;
    this.bench = this.bench.filter(b => b.uid !== item.uid);
    const existing = this.items.find(i => i.uid === item.uid);
    const seq = (existing && existing.x === x && existing.y === y && existing.rot === rot) ? existing.seq : this.seq++;
    const placed = { uid: item.uid, id: item.id, level: item.level, x, y, rot, seq };
    if (existing) Object.assign(existing, placed); else this.items.push(placed);
    return true;
  }

  rotate(uid) {
    const it = this.items.find(i => i.uid === uid);
    if (it) {
      const rot = (it.rot + 1) % 2;
      if (footprint({ ...it, rot }).w === footprint(it).w) { it.rot = rot; return true; }   // square: trivial
      // try in place, then nudge so the rotated item still fits next to where it was
      for (const [dx, dy] of [[0, 0], [-1, 0], [0, -1], [-1, -1], [1, 0], [0, 1]]) {
        if (this.canPlace({ ...it, rot }, it.x + dx, it.y + dy)) {
          it.rot = rot; it.x += dx; it.y += dy; it.seq = this.seq++; return true;
        }
      }
      return false;
    }
    const b = this.bench.find(i => i.uid === uid);
    if (b) { b.rot = ((b.rot || 0) + 1) % 2; return true; }
    return false;
  }

  addToBench(id, level = 1) {
    const it = { uid: newUid(), id, level, rot: 0 };
    this.bench.push(it);
    return it;
  }

  remove(uid) {
    this.items = this.items.filter(i => i.uid !== uid);
    this.bench = this.bench.filter(i => i.uid !== uid);
  }

  // Merge check: identical id + same level + below max.
  canMerge(src, dest) {
    return dest && src.uid !== dest.uid && src.id === dest.id && src.level === dest.level && dest.level < MAX_LEVEL;
  }

  // Destination keeps its position, orientation and equip order. Source is consumed.
  merge(srcUid, destUid) {
    const dest = this.get(destUid), src = this.get(srcUid);
    if (!src || !this.canMerge(src, dest)) return null;
    this.remove(srcUid);
    dest.level += 1;
    return dest;
  }

  sell(uid, ratio) {
    const it = this.get(uid);
    if (!it) return 0;
    this.remove(uid);
    return sellPrice(it, ratio);
  }

  // Find a free spot (prefers cells touching the given regions). Used by the AI builder.
  findSpot(item, preferRegions, regionsTouchedFn) {
    let best = null, bestScore = -1;
    for (const rot of [item.rot || 0, ((item.rot || 0) + 1) % 2]) {
      const probe = { ...item, rot };
      for (let y = 0; y < GRID_ROWS; y++) for (let x = 0; x < GRID_COLS; x++) {
        if (!this.canPlace(probe, x, y)) continue;
        const f = footprint(probe);
        const reg = regionsTouchedFn(x, y, f.w, f.h);
        const score = reg.filter(r => preferRegions.includes(r)).length * 10 - reg.length;
        if (score > bestScore) { bestScore = score; best = { x, y, rot }; }
      }
    }
    return best;
  }

  clone() {
    const c = new Inventory();
    c.items = this.items.map(i => ({ ...i }));
    c.bench = this.bench.map(i => ({ ...i }));
    c.seq = this.seq;
    return c;
  }
}
