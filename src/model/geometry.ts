import { LIBRARY, defaultParams, type Params } from '../library';
import type { Design, ModuleInstance, ModuleType, Opening, Room, Rotation, WallId } from './types';

export interface Rect { x0: number; y0: number; x1: number; y1: number }

export const uid = () => Math.random().toString(36).slice(2, 9);

export function footprintOf(m: { type: ModuleType; params: Params }) {
  return LIBRARY[m.type].footprint(m.params);
}

/** Størrelse i planet etter rotasjon. */
export function planSize(w: number, d: number, rot: Rotation) {
  return rot === 90 || rot === 270 ? { sx: d, sy: w } : { sx: w, sy: d };
}

export function rectOf(m: ModuleInstance): Rect {
  const f = footprintOf(m);
  const { sx, sy } = planSize(f.w, f.d, m.rotation);
  return { x0: m.x - sx / 2, y0: m.y - sy / 2, x1: m.x + sx / 2, y1: m.y + sy / 2 };
}

const overlapArea = (a: Rect, b: Rect) => {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0.5 && h > 0.5 ? w * h : 0;
};

/** Veggen modulen står med ryggen mot, for hver rotasjon. */
export const BACK_WALL: Record<Rotation, WallId> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
export const WALL_ROT: Record<WallId, Rotation> = { N: 0, E: 90, S: 180, W: 270 };
export const WALL_NAME: Record<WallId, string> = { N: 'Nord', E: 'Øst', S: 'Sør', W: 'Vest' };

export const wallLength = (room: Room, w: WallId) => (w === 'N' || w === 'S' ? room.width : room.depth);

/** Rektangelet til selve åpningen i veggen, pluss slagsonen for dører. */
export function openingZone(room: Room, o: Opening): Rect {
  const depth = o.kind === 'door' ? o.width : 0;
  const a0 = o.offset, a1 = o.offset + o.width;
  switch (o.wall) {
    case 'N': return { x0: a0, x1: a1, y0: 0, y1: depth };
    case 'S': return { x0: a0, x1: a1, y0: room.depth - depth, y1: room.depth };
    case 'W': return { x0: 0, x1: depth, y0: a0, y1: a1 };
    case 'E': return { x0: room.width - depth, x1: room.width, y0: a0, y1: a1 };
  }
}

/** Sonen foran modulen der man skal kunne stå og gå. */
function frontZone(m: ModuleInstance, r: Rect, clearance: number): Rect {
  switch (m.rotation) {
    case 0: return { ...r, y0: r.y1, y1: r.y1 + clearance };
    case 180: return { ...r, y1: r.y0, y0: r.y0 - clearance };
    case 90: return { ...r, x1: r.x0, x0: r.x0 - clearance };
    case 270: return { ...r, x0: r.x1, x1: r.x1 + clearance };
  }
}

function touchesWall(room: Room, r: Rect, wall: WallId, tol = 30) {
  switch (wall) {
    case 'N': return r.y0 <= tol;
    case 'S': return r.y1 >= room.depth - tol;
    case 'W': return r.x0 <= tol;
    case 'E': return r.x1 >= room.width - tol;
  }
}

export interface Warning { moduleId: string; level: 'error' | 'warn'; text: string }

export const CLEARANCE = 800;

export function validate(design: Design): Warning[] {
  const { room, modules } = design;
  const out: Warning[] = [];
  const rects = new Map(modules.map((m) => [m.id, rectOf(m)]));
  modules.forEach((m, i) => {
    const r = rects.get(m.id)!;
    const f = footprintOf(m);
    if (r.x0 < -1 || r.y0 < -1 || r.x1 > room.width + 1 || r.y1 > room.depth + 1)
      out.push({ moduleId: m.id, level: 'error', text: 'Står utenfor rommet' });
    if (f.h > room.height) out.push({ moduleId: m.id, level: 'error', text: 'Høyere enn takhøyden' });
    for (let j = i + 1; j < modules.length; j++) {
      if (overlapArea(r, rects.get(modules[j].id)!) > 0) {
        out.push({ moduleId: m.id, level: 'error', text: 'Kolliderer med en annen modul' });
        out.push({ moduleId: modules[j].id, level: 'error', text: 'Kolliderer med en annen modul' });
      }
    }
    for (const o of room.openings) {
      const z = openingZone(room, o);
      if (o.kind === 'door' && overlapArea(r, z) > 0)
        out.push({ moduleId: m.id, level: 'error', text: 'Sperrer døra eller slagsonen' });
      if (o.kind === 'window' && touchesWall(room, r, o.wall) && f.h > (o.sill ?? 0)) {
        const along = o.wall === 'N' || o.wall === 'S' ? [r.x0, r.x1] : [r.y0, r.y1];
        if (along[1] > o.offset + 1 && along[0] < o.offset + o.width - 1)
          out.push({ moduleId: m.id, level: 'warn', text: 'Er høyere enn vinduets brystning' });
      }
    }
    const fz = frontZone(m, r, CLEARANCE);
    for (const other of modules) {
      if (other.id !== m.id && overlapArea(fz, rects.get(other.id)!) > 0) {
        out.push({ moduleId: m.id, level: 'warn', text: `Mindre enn ${CLEARANCE} mm fri plass foran` });
        break;
      }
    }
  });
  // fjern duplikater
  const seen = new Set<string>();
  return out.filter((w) => {
    const k = w.moduleId + w.text;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------------------------------------------------------------- Snapping

const WALL_SNAP = 150;
const EDGE_SNAP = 60;

/**
 * Justerer posisjonen til en modul som dras: legger ryggen inntil nærmeste vegg
 * (og roterer modulen), og fester sidekantene mot hjørner og andre moduler.
 */
export function snap(
  design: Design,
  m: ModuleInstance,
  x: number,
  y: number,
): { x: number; y: number; rotation: Rotation } {
  const { room } = design;
  const f = footprintOf(m);
  let rotation = m.rotation;

  // 1. Finn nærmeste vegg innenfor snap-avstand, målt fra ryggkanten.
  const dist: [WallId, number][] = [
    ['N', Math.abs(y - f.d / 2)],
    ['S', Math.abs(room.depth - y - f.d / 2)],
    ['W', Math.abs(x - f.d / 2)],
    ['E', Math.abs(room.width - x - f.d / 2)],
  ];
  dist.sort((a, b) => a[1] - b[1]);
  const [wall, dmin] = dist[0];
  if (dmin < WALL_SNAP) {
    rotation = WALL_ROT[wall];
    if (wall === 'N') y = f.d / 2;
    if (wall === 'S') y = room.depth - f.d / 2;
    if (wall === 'W') x = f.d / 2;
    if (wall === 'E') x = room.width - f.d / 2;
  }

  const { sx, sy } = planSize(f.w, f.d, rotation);

  // 2. Fest kantene mot hjørner og andre modulers kanter.
  const xs = [0, room.width];
  const ys = [0, room.depth];
  for (const o of design.modules) {
    if (o.id === m.id) continue;
    const r = rectOf(o);
    xs.push(r.x0, r.x1);
    ys.push(r.y0, r.y1);
  }
  const snapAxis = (c: number, half: number, targets: number[]) => {
    let best = c, bestD = EDGE_SNAP;
    for (const t of targets) {
      for (const cand of [t + half, t - half]) {
        const d = Math.abs(cand - c);
        if (d < bestD) { bestD = d; best = cand; }
      }
    }
    return best;
  };
  x = snapAxis(x, sx / 2, xs);
  y = snapAxis(y, sy / 2, ys);

  // 3. Hold modulen inne i rommet.
  x = Math.min(Math.max(x, sx / 2), room.width - sx / 2);
  y = Math.min(Math.max(y, sy / 2), room.depth - sy / 2);
  return { x: Math.round(x), y: Math.round(y), rotation };
}

// ---------------------------------------------------------------- Fyll vegg

/** Plasserer moduler jevnt langs en vegg, i ledige partier mellom dører og eksisterende moduler. */
export function fillWall(design: Design, wall: WallId, type: ModuleType): ModuleInstance[] {
  const { room } = design;
  const t = LIBRARY[type];
  const base = defaultParams(type);
  const f = t.footprint(base);
  const wSpec = t.params.find((p) => p.key === 'bredde')!;
  const minW = wSpec.min!, maxW = wSpec.max!;
  const L = wallLength(room, wall);
  const horiz = wall === 'N' || wall === 'S';

  // Stripen langs veggen som nye moduler vil bruke
  const strip: Rect =
    wall === 'N' ? { x0: 0, x1: room.width, y0: 0, y1: f.d }
    : wall === 'S' ? { x0: 0, x1: room.width, y0: room.depth - f.d, y1: room.depth }
    : wall === 'W' ? { x0: 0, x1: f.d, y0: 0, y1: room.depth }
    : { x0: room.width - f.d, x1: room.width, y0: 0, y1: room.depth };

  const blocked: [number, number][] = [];
  const addBlock = (r: Rect) => {
    if (overlapArea(r, strip) > 0) blocked.push(horiz ? [r.x0, r.x1] : [r.y0, r.y1]);
  };
  design.modules.forEach((m) => addBlock(rectOf(m)));
  for (const o of room.openings) {
    if (o.kind === 'door') addBlock(openingZone(room, o));
    if (o.kind === 'window' && o.wall === wall && f.h > (o.sill ?? 0))
      blocked.push([o.offset, o.offset + o.width]);
  }
  blocked.sort((a, b) => a[0] - b[0]);

  const free: [number, number][] = [];
  let cursor = 0;
  for (const [a, b] of blocked) {
    if (a > cursor) free.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < L) free.push([cursor, L]);

  const out: ModuleInstance[] = [];
  for (const [a, b] of free) {
    const len = b - a;
    if (len < minW) continue;
    let count = Math.max(1, Math.round(len / t.fillWidth));
    while (len / count > maxW) count++;
    while (count > 1 && len / count < minW) count--;
    const w = Math.floor((len / count) * 10) / 10; // jevne bredder, avrundet ned til 0,1 mm
    for (let i = 0; i < count; i++) {
      const along = a + w * i + w / 2;
      const across = f.d / 2;
      const pos =
        wall === 'N' ? { x: along, y: across }
        : wall === 'S' ? { x: along, y: room.depth - across }
        : wall === 'W' ? { x: across, y: along }
        : { x: room.width - across, y: along };
      out.push({ id: uid(), type, rotation: WALL_ROT[wall], ...pos, params: { ...base, bredde: w } });
    }
  }
  return out;
}
