// Fixed backpack grid surrounding the gladiator. Each cell lists the body regions it touches.
// Columns 0..5 (screen left -> right), rows 0..7 (top -> bottom). The 2x5 hole in the middle
// (cols 2-3, rows 1-5) is where the gladiator's head and torso stand.
//
// Legend: H head, B body, L/R arm, l/r leg, '.' no cell. Multiple letters = multiple regions.

const LAYOUT = [
  ['.',  'H',  'H',  'H',  'H',  '.'],
  ['L',  'H',  '#',  '#',  'H',  'R'],
  ['L',  'BL', '#',  '#',  'BR', 'R'],
  ['L',  'BL', '#',  '#',  'BR', 'R'],
  ['L',  'B',  '#',  '#',  'B',  'R'],
  ['l',  'l',  '#',  '#',  'r',  'r'],
  ['l',  'l',  'l',  'r',  'r',  'r'],
  ['.',  'l',  'l',  'r',  'r',  '.'],
];
const CODE = { H: 'head', B: 'body', L: 'armL', R: 'armR', l: 'legL', r: 'legR' };

export const GRID_COLS = 6;
export const GRID_ROWS = 8;

// cells[y][x] = null (no cell) or { x, y, regions: [...] }
export const CELLS = LAYOUT.map((row, y) => row.map((code, x) => {
  if (code === '.' || code === '#') return null;
  return { x, y, regions: [...code].map(c => CODE[c]) };
}));

export const cellAt = (x, y) => (y >= 0 && y < GRID_ROWS && x >= 0 && x < GRID_COLS) ? CELLS[y][x] : null;

export function cellsOf(x, y, w, h) {
  const out = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out.push([x + i, y + j]);
  return out;
}

// Regions touched by a rectangle on the grid (union of its cells' regions).
export function regionsTouched(x, y, w, h) {
  const s = new Set();
  for (const [cx, cy] of cellsOf(x, y, w, h)) {
    const c = cellAt(cx, cy);
    if (c) c.regions.forEach(r => s.add(r));
  }
  return [...s];
}

// Count of cells touching each region (used to break ties: which arm holds a weapon).
export function regionWeights(x, y, w, h) {
  const m = {};
  for (const [cx, cy] of cellsOf(x, y, w, h)) {
    const c = cellAt(cx, cy);
    if (c) c.regions.forEach(r => (m[r] = (m[r] || 0) + 1));
  }
  return m;
}

// Visual anchor for each body region in grid-cell coordinates (used for connection lines).
export const REGION_ANCHOR = {
  head: [3, 1.45], body: [3, 3.1], armL: [1.25, 3.4], armR: [4.75, 3.4], legL: [2.45, 6.3], legR: [3.55, 6.3],
};
