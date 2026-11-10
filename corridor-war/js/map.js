// Corridor War — battlefield geometry, collision grid and flow-field navigation.
// The map is built from convex polygons (corridor quads, bevel wedges, octagon rooms).
// The same polygons are used to draw the map and to rasterise the collision grid,
// so what you see is exactly what units collide with.
(function (CC) {
  'use strict';

  const W = 60, H = 96;      // world size in "cells" (world units)
  const RES = 2;             // nav-grid sub-cells per world unit
  const HW = 5;            // corridor half width
  const SQ2 = Math.SQRT2;

  // ---- Layout (point-symmetric around the centre so both sides are fair) ----
  const CENTER = { x: 30, y: 48 };
  const reflect = p => [W - p[0], H - p[1]];

  const topPaths = [
    [[33, 10], [33, 17]],
    [[33, 17], [15, 26], [15, 36], [30, 48]],
    [[33, 17], [49, 28], [49, 37], [30, 48]],
  ];
  const topRooms = [
    { c: [33, 10], r: 8.6, base: 'red' },
    { c: [33, 17], r: HW / Math.cos(Math.PI / 8) },
  ];

  function buildLayout() {
    const paths = topPaths.concat(topPaths.map(p => p.map(reflect)));
    const rooms = topRooms.map(r => Object.assign({}, r))
      .concat(topRooms.map(r => ({ c: reflect(r.c), r: r.r, base: r.base ? 'blue' : undefined })));
    rooms.push({ c: [CENTER.x, CENTER.y], r: 7.2 });
    return { paths, rooms };
  }

  function octagon(cx, cy, r) {
    const pts = [];
    for (let k = 0; k < 8; k++) {
      const a = Math.PI / 8 + k * Math.PI / 4;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return pts;
  }

  function buildPolys(layout) {
    const polys = [];
    for (const path of layout.paths) {
      const normals = [];
      for (let i = 0; i < path.length - 1; i++) {
        const [ax, ay] = path[i], [bx, by] = path[i + 1];
        const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
        const nx = -dy / L * HW, ny = dx / L * HW;
        normals.push([nx, ny]);
        polys.push([[ax + nx, ay + ny], [bx + nx, by + ny], [bx - nx, by - ny], [ax - nx, ay - ny]]);
      }
      for (let i = 1; i < path.length - 1; i++) {
        const [px, py] = path[i], n1 = normals[i - 1], n2 = normals[i];
        polys.push([[px, py], [px + n1[0], py + n1[1]], [px + n2[0], py + n2[1]]]);
        polys.push([[px, py], [px - n1[0], py - n1[1]], [px - n2[0], py - n2[1]]]);
      }
    }
    for (const r of layout.rooms) polys.push(octagon(r.c[0], r.c[1], r.r));
    // same winding for every polygon, so overlapping fills/clips never cancel out
    for (const p of polys) {
      let a = 0; for (let i = 0; i < p.length; i++) { const q = p[i], w = p[(i + 1) % p.length]; a += q[0] * w[1] - w[0] * q[1]; }
      if (a < 0) p.reverse();
    }
    return polys;
  }

  function inConvex(poly, x, y) {
    let sign = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
      if (Math.abs(c) < 1e-9) continue;
      const s = c > 0 ? 1 : -1;
      if (sign === 0) sign = s; else if (s !== sign) return false;
    }
    return true;
  }

  // ---- tiny binary heap for Dijkstra ----
  function Heap(n) { this.k = new Float64Array(n + 16); this.v = new Int32Array(n + 16); this.n = 0; }
  Heap.prototype.push = function (key, val) {
    if (this.n >= this.k.length) {
      const k2 = new Float64Array(this.k.length * 2); k2.set(this.k); this.k = k2;
      const v2 = new Int32Array(this.v.length * 2); v2.set(this.v); this.v = v2;
    }
    let i = this.n++; const k = this.k, v = this.v;
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  };
  Heap.prototype.pop = function () {
    const k = this.k, v = this.v, top = v[0], topK = k[0]; this.lastKey = topK;
    const n = --this.n; const key = k[n], val = v[n]; let i = 0;
    while (true) {
      let c = 2 * i + 1; if (c >= n) break;
      if (c + 1 < n && k[c + 1] < k[c]) c++;
      if (k[c] >= key) break;
      k[i] = k[c]; v[i] = v[c]; i = c;
    }
    k[i] = key; v[i] = val; return top;
  };

  const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];

  function create() {
    const layout = buildLayout();
    const polys = buildPolys(layout);
    const gw = W * RES, gh = H * RES, N = gw * gh;
    const solid = new Uint8Array(N);
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
      const x = (gx + 0.5) / RES, y = (gy + 0.5) / RES;
      let floor = false;
      for (let p = 0; p < polys.length && !floor; p++) floor = inConvex(polys[p], x, y);
      solid[gy * gw + gx] = floor ? 0 : 1;
    }

    // distance to nearest wall (world units) — used to keep paths off the walls
    const wallDist = new Float32Array(N);
    for (let i = 0; i < N; i++) wallDist[i] = solid[i] ? 0 : 1e9;
    const cO = 1 / RES, cD = SQ2 / RES; // two-pass chamfer distance transform
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const i = y * gw + x; let d = wallDist[i];
      if (x > 0) d = Math.min(d, wallDist[i - 1] + cO);
      if (y > 0) { d = Math.min(d, wallDist[i - gw] + cO); if (x > 0) d = Math.min(d, wallDist[i - gw - 1] + cD); if (x < gw - 1) d = Math.min(d, wallDist[i - gw + 1] + cD); }
      wallDist[i] = d;
    }
    for (let y = gh - 1; y >= 0; y--) for (let x = gw - 1; x >= 0; x--) {
      const i = y * gw + x; let d = wallDist[i];
      if (x < gw - 1) d = Math.min(d, wallDist[i + 1] + cO);
      if (y < gh - 1) { d = Math.min(d, wallDist[i + gw] + cO); if (x < gw - 1) d = Math.min(d, wallDist[i + gw + 1] + cD); if (x > 0) d = Math.min(d, wallDist[i + gw - 1] + cD); }
      wallDist[i] = d;
    }

    const bases = {};
    for (const r of layout.rooms) if (r.base) bases[r.base] = { x: r.c[0], y: r.c[1] };

    const map = { W, H, RES, gw, gh, solid, wallDist, polys, layout, bases, HW, center: CENTER };

    // lane split lines for the two loops (top loop & bottom loop)
    const lanes = [
      { y0: 21, y1: 45, split: 32 },
      { y0: 51, y1: 75, split: 28 },
    ];
    function laneCost(lane, x, y) {
      if (lane < 0) return 0;
      for (const L of lanes) if (y >= L.y0 && y <= L.y1) return (lane === 0 ? x > L.split : x < L.split) ? 1.6 : 0;
      return 0;
    }

    function buildField(goal, lane) {
      const dist = new Float64Array(N).fill(Infinity);
      const heap = new Heap(N);
      const gr = CC.CONFIG.bases.radius + 1.6;
      for (let i = 0; i < N; i++) {
        if (solid[i]) continue;
        const x = (i % gw + 0.5) / RES, y = ((i / gw | 0) + 0.5) / RES;
        if (Math.hypot(x - goal.x, y - goal.y) <= gr) { dist[i] = 0; heap.push(0, i); }
      }
      while (heap.n) {
        const i = heap.pop(), dk = heap.lastKey;
        if (dk > dist[i]) continue;
        const x = i % gw, y = (i / gw) | 0;
        for (const [dx, dy, c] of NB) {
          const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const j = ny * gw + nx; if (solid[j]) continue;
          if (dx && dy && (solid[y * gw + nx] || solid[ny * gw + x])) continue; // no corner cutting
          const wd = wallDist[j];
          const mult = 1 + (wd < 2.6 ? (2.6 - wd) * 0.7 : 0) + laneCost(lane, (nx + 0.5) / RES, (ny + 0.5) / RES);
          const nd = dk + c / RES * mult;
          if (nd < dist[j]) { dist[j] = nd; heap.push(nd, j); }
        }
      }
      // direction = toward the lowest neighbour, then one smoothing pass
      const fx = new Float32Array(N), fy = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        if (solid[i] || dist[i] === 0) continue;
        const x = i % gw, y = (i / gw) | 0; let best = dist[i], bx = 0, by = 0;
        for (const [dx, dy] of NB) {
          const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const j = ny * gw + nx; if (solid[j]) continue;
          if (dx && dy && (solid[y * gw + nx] || solid[ny * gw + x])) continue;
          if (dist[j] < best) { best = dist[j]; bx = dx; by = dy; }
        }
        const L = Math.hypot(bx, by) || 1; fx[i] = bx / L; fy[i] = by / L;
      }
      // goal cells point straight at the base
      for (let i = 0; i < N; i++) if (!solid[i] && dist[i] === 0) {
        const x = (i % gw + 0.5) / RES, y = ((i / gw | 0) + 0.5) / RES;
        const dx = goal.x - x, dy = goal.y - y, L = Math.hypot(dx, dy) || 1; fx[i] = dx / L; fy[i] = dy / L;
      }
      const sx = new Float32Array(N), sy = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        if (solid[i]) continue;
        const x = i % gw, y = (i / gw) | 0; let ax = fx[i] * 2, ay = fy[i] * 2;
        for (const [dx, dy] of NB) {
          const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const j = ny * gw + nx; if (solid[j]) continue; ax += fx[j]; ay += fy[j];
        }
        const L = Math.hypot(ax, ay) || 1; sx[i] = ax / L; sy[i] = ay / L;
      }
      return { dist, fx: sx, fy: sy };
    }

    // fields[goalSide] = [lane0, lane1, neutral]
    map.fields = {
      red: [buildField(bases.red, 0), buildField(bases.red, 1), buildField(bases.red, -1)],
      blue: [buildField(bases.blue, 0), buildField(bases.blue, 1), buildField(bases.blue, -1)],
    };

    map.idx = function (x, y) {
      let gx = (x * RES) | 0, gy = (y * RES) | 0;
      if (gx < 0) gx = 0; else if (gx >= gw) gx = gw - 1;
      if (gy < 0) gy = 0; else if (gy >= gh) gy = gh - 1;
      return gy * gw + gx;
    };
    map.isSolid = function (x, y) {
      if (x < 0 || y < 0 || x >= W || y >= H) return true;
      return solid[map.idx(x, y)] === 1;
    };
    map.los = function (x0, y0, x1, y1) {
      const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), steps = Math.ceil(L * RES * 1.5);
      for (let s = 1; s < steps; s++) { const t = s / steps; if (map.isSolid(x0 + dx * t, y0 + dy * t)) return false; }
      return true;
    };
    // push a circle out of solid nav cells
    map.resolveCircle = function (u) {
      const r = u.r, cs = 1 / RES;
      const gx0 = Math.max(0, ((u.x - r) * RES) | 0), gx1 = Math.min(gw - 1, ((u.x + r) * RES) | 0);
      const gy0 = Math.max(0, ((u.y - r) * RES) | 0), gy1 = Math.min(gh - 1, ((u.y + r) * RES) | 0);
      for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
        if (!solid[gy * gw + gx]) continue;
        const minx = gx * cs, miny = gy * cs;
        const cx = u.x < minx ? minx : u.x > minx + cs ? minx + cs : u.x;
        const cy = u.y < miny ? miny : u.y > miny + cs ? miny + cs : u.y;
        const dx = u.x - cx, dy = u.y - cy, d2 = dx * dx + dy * dy;
        if (d2 < r * r && d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; u.x += dx * k; u.y += dy * k; }
      }
    };

    // decorative torches along the outer walls
    map.torches = [];
    for (const path of layout.paths) for (let i = 0; i < path.length - 1; i++) {
      const [ax, ay] = path[i], [bx, by] = path[i + 1];
      const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy); if (L < 8) continue;
      const nx = -dy / L, ny = dx / L;
      for (const side of [1, -1]) {
        const t = 0.5, px = ax + dx * t + nx * (HW + 0.15) * side, py = ay + dy * t + ny * (HW + 0.15) * side;
        // only keep torches that sit on a wall (solid just outside, floor just inside)
        if (map.isSolid(px + nx * side * 0.6, py + ny * side * 0.6) && !map.isSolid(px - nx * side * 0.8, py - ny * side * 0.8))
          map.torches.push({ x: px, y: py });
      }
    }
    return map;
  }

  CC.Map = { create };
})(globalThis.CC = globalThis.CC || {});
