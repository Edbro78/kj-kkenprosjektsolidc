// DXF (R12, ASCII) for CNC: én fil per unik MDF-plate, sett ovenfra på side 1.
//
// Lag:
//   KONTUR             platens ytterkant (lukket polylinje)
//   GJENNOM_D<d>       gjennomgående hull
//   S1_D<d>_Z<dybde>   blindhull boret fra side 1 (siden du ser på)
//   S2_D<d>_Z<dybde>   blindhull boret fra side 2 (baksiden), tegnet i samme koordinater som sett gjennom platen
//   KANT_D<d>_Z<dybde> hull i kanten, tegnet som en linje fra kanten og innover (i midten av tykkelsen)
//   TEKST              del-ID, mål og antall

import type { Panel } from './types.ts';
import type { Hole } from '../library/holes.ts';

type V3 = [number, number, number];

/** Et hull i platens egne koordinater: a langs lengden, b langs bredden, k gjennom tykkelsen (0 = side 1). */
export interface LocalHole { p: V3; d: V3; diameter: number; depth: number }

export interface PanelFrame { l: number; w: number; t: number; holes: LocalHole[] }

const r2 = (v: number) => Math.round(v * 100) / 100 + 0;

function axesOf(panel: Panel) {
  const idx = [0, 1, 2];
  const k = idx.reduce((a, b) => (panel.size[a] <= panel.size[b] ? a : b));
  const [a, b] = idx.filter((i) => i !== k).sort((x, y) => panel.size[y] - panel.size[x]);
  return { a, b, k };
}

/** Utvider mønstre og gjør hullene om til platens egne koordinater. */
export function panelFrame(panel: Panel, holes: Hole[]): PanelFrame {
  const { a, b, k } = axesOf(panel);
  const out: LocalHole[] = [];
  for (const h of holes) {
    const n1 = h.pattern?.count1 ?? 1, n2 = h.pattern?.count2 ?? 1;
    for (let i = 0; i < n1; i++)
      for (let j = 0; j < n2; j++) {
        const s = h.start.map((v, x) =>
          v + (h.pattern ? i * h.pattern.spacing1 * h.pattern.dir1[x] + j * h.pattern.spacing2 * h.pattern.dir2[x] : 0) - panel.pos[x]);
        const hole: LocalHole = {
          p: [r2(s[a]), r2(s[b]), r2(s[k])],
          d: [h.dir[a], h.dir[b], h.dir[k]].map((v) => v + 0) as V3,
          diameter: h.diameter,
          depth: r2(h.depth),
        };
        // Et gjennomgående hull er likt fra begge sider: lagres alltid som boret fra side 1
        if (hole.d[2] !== 0 && hole.depth >= panel.size[k] - 0.01) {
          hole.p[2] = 0;
          hole.d = [0, 0, 1];
        }
        out.push(hole);
      }
  }
  return { l: panel.size[a], w: panel.size[b], t: panel.size[k], holes: out };
}

const key = (f: PanelFrame) =>
  f.holes.map((h) => [...h.p, ...h.d, h.diameter, h.depth].join(',')).sort().join(';');

/**
 * Samme plate kan ligge snudd i en modul (venstre og høyre side). Velger én fast orientering av fire
 * mulige (snudd om lengden, om bredden eller rotert 180°), slik at like plater får lik tegning.
 */
export function canonical(f: PanelFrame): PanelFrame {
  const { l, w, t } = f;
  const variants: ((h: LocalHole) => LocalHole)[] = [
    (h) => h,
    (h) => ({ ...h, p: [h.p[0], w - h.p[1], t - h.p[2]], d: [h.d[0], -h.d[1], -h.d[2]] }),
    (h) => ({ ...h, p: [l - h.p[0], h.p[1], t - h.p[2]], d: [-h.d[0], h.d[1], -h.d[2]] }),
    (h) => ({ ...h, p: [l - h.p[0], w - h.p[1], h.p[2]], d: [-h.d[0], -h.d[1], h.d[2]] }),
  ];
  const all = variants.map((v) => {
    const g: PanelFrame = {
      ...f,
      holes: f.holes.map((h) => {
        const x = v(h);
        const p = x.p.map(r2) as V3;
        let d = x.d.map((c) => c + 0) as V3;
        if (d[2] !== 0 && x.depth >= t - 0.01) { p[2] = 0; d = [0, 0, 1]; } // gjennomgående: side spiller ingen rolle
        return { ...x, p, d };
      }),
    };
    return { g, k: key(g) };
  });
  all.sort((x, y) => (x.k < y.k ? -1 : x.k > y.k ? 1 : 0));
  return all[0].g;
}

export const frameKey = key;

export function holeLayer(h: LocalHole, t: number): string {
  const d = `D${r2(h.diameter)}`.replace('.', ',');
  const z = `Z${r2(h.depth)}`.replace('.', ',');
  if (h.d[2] !== 0) {
    if (h.depth >= t - 0.01) return `GJENNOM_${d}`;
    return `${h.p[2] < t / 2 ? 'S1' : 'S2'}_${d}_${z}`;
  }
  return `KANT_${d}_${z}`;
}

const LAYER_COLOR = (name: string) =>
  name === 'KONTUR' ? 7 : name === 'TEKST' ? 8 : name.startsWith('GJENNOM') ? 1 : name.startsWith('S1') ? 3 : name.startsWith('S2') ? 5 : 6;

/** Lager selve DXF-teksten. */
export function panelDxf(f: PanelFrame, title: string[]): string {
  const ents: string[] = [];
  const layers = new Set<string>(['KONTUR', 'TEKST']);
  const g = (...pairs: (string | number)[]) => {
    for (let i = 0; i < pairs.length; i += 2) ents.push(String(pairs[i]), String(pairs[i + 1]));
  };
  // Kontur
  g(0, 'POLYLINE', 8, 'KONTUR', 66, 1, 70, 1);
  for (const [x, y] of [[0, 0], [f.l, 0], [f.l, f.w], [0, f.w]]) g(0, 'VERTEX', 8, 'KONTUR', 10, r2(x), 20, r2(y), 30, 0);
  g(0, 'SEQEND', 8, 'KONTUR');
  // Hull
  for (const h of f.holes) {
    const layer = holeLayer(h, f.t);
    layers.add(layer);
    if (h.d[2] !== 0) {
      g(0, 'CIRCLE', 8, layer, 10, h.p[0], 20, h.p[1], 30, 0, 40, r2(h.diameter / 2));
    } else {
      g(0, 'LINE', 8, layer, 10, h.p[0], 20, h.p[1], 30, 0, 11, r2(h.p[0] + h.d[0] * h.depth), 21, r2(h.p[1] + h.d[1] * h.depth), 31, 0);
    }
  }
  // Tekst under platen
  title.forEach((line, i) => g(0, 'TEXT', 8, 'TEKST', 10, 0, 20, r2(-12 - i * 9), 30, 0, 40, 6, 1, line));

  const tables = [
    '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', String(layers.size),
    ...[...layers].flatMap((n) => ['0', 'LAYER', '2', n, '70', '0', '62', String(LAYER_COLOR(n)), '6', 'CONTINUOUS']),
    '0', 'ENDTAB', '0', 'ENDSEC',
  ];
  return [
    '0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '4',
    '9', '$EXTMIN', '10', '0', '20', String(r2(-12 - title.length * 9)), '30', '0',
    '9', '$EXTMAX', '10', String(r2(f.l)), '20', String(r2(f.w)), '30', '0', '0', 'ENDSEC',
    ...tables,
    '0', 'SECTION', '2', 'ENTITIES', ...ents, '0', 'ENDSEC', '0', 'EOF', '',
  ].join('\r\n');
}

/** Kort oppsummering av hullene for delelisten. */
export function holeSummary(f: PanelFrame): string {
  const counts = new Map<string, number>();
  for (const h of f.holes) {
    const l = holeLayer(h, f.t);
    counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  return [...counts].map(([l, c]) => `${c}× ${l}`).join(', ');
}
