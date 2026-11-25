import type { Panel } from '../model/types';

/** Et borehull i modulens lokale koordinater (u langs bredden, v fra ryggen og frem, z opp). */
export interface Hole {
  panel: number; // indeks i platelista
  kind: 'konfirmat' | 'konfirmat-forboring' | 'hyllehull' | 'hengselkopp' | 'knott';
  /** Punktet på plateflaten der boret går inn. */
  start: [number, number, number];
  /** Enhetsvektor inn i materialet. */
  dir: [number, number, number];
  diameter: number;
  depth: number;
  /** Gjenta hullet i et rutenett (brukes for 32 mm-rader). */
  pattern?: { dir1: [number, number, number]; count1: number; spacing1: number; dir2: [number, number, number]; count2: number; spacing2: number };
}

const TOL = 0.5;
const CONFIRMAT_LEN = 50;
const minOf = (p: Panel) => p.pos;
const maxOf = (p: Panel) => p.pos.map((v, i) => v + p.size[i]) as [number, number, number];
const thinAxis = (p: Panel) => p.size.indexOf(Math.min(...p.size));
const unit = (axis: number, sign: number) => {
  const d: [number, number, number] = [0, 0, 0];
  d[axis] = sign;
  return d;
};

/**
 * Finner alle hull i en modul:
 * - konfirmatskruer der en korpusplate ender mot flaten på en annen (Ø7 gjennom, Ø5 forboring i kanten)
 * - 32 mm-hyllehull Ø5 i sidene når modulen har løse hyller
 * - Ø35 hengselkopper i dørene
 */
export function moduleHoles(panels: Panel[]): Hole[] {
  const holes: Hole[] = [];
  const lo = [0, 1, 2].map((i) => Math.min(...panels.map((p) => minOf(p)[i])));
  const hi = [0, 1, 2].map((i) => Math.max(...panels.map((p) => maxOf(p)[i])));
  const centre = lo.map((v, i) => (v + hi[i]) / 2);

  // Konfirmatskruer
  panels.forEach((A, ai) => {
    if (A.kind !== 'carcass') return;
    const k = thinAxis(A);
    const aMin = minOf(A), aMax = maxOf(A);
    panels.forEach((B, bi) => {
      if (bi === ai || B.kind !== 'carcass') return;
      const bMin = minOf(B), bMax = maxOf(B);
      let s = 0;
      if (Math.abs(bMin[k] - aMax[k]) < TOL) s = 1; // B ligger på + siden av A
      else if (Math.abs(bMax[k] - aMin[k]) < TOL) s = -1;
      if (!s) return;
      const others = [0, 1, 2].filter((i) => i !== k);
      if (!others.every((i) => bMin[i] >= aMin[i] - TOL && bMax[i] <= aMax[i] + TOL)) return;
      const tB = others.reduce((a, b) => (B.size[a] <= B.size[b] ? a : b));
      const L = others.find((i) => i !== tB)!;
      const len = B.size[L];
      const n = Math.max(2, Math.ceil(len / 200));
      const inset = Math.min(37, len / 4);
      const contact = s > 0 ? aMax[k] : aMin[k];
      const outer = s > 0 ? aMin[k] : aMax[k];
      for (let i = 0; i < n; i++) {
        const at: [number, number, number] = [0, 0, 0];
        at[L] = bMin[L] + inset + ((len - 2 * inset) * i) / (n - 1);
        at[tB] = bMin[tB] + B.size[tB] / 2;
        at[k] = outer;
        holes.push({ panel: ai, kind: 'konfirmat', start: [...at], dir: unit(k, s), diameter: 7, depth: A.size[k] });
        at[k] = contact;
        holes.push({
          panel: bi, kind: 'konfirmat-forboring', start: [...at], dir: unit(k, s), diameter: 5,
          depth: CONFIRMAT_LEN - A.size[k] + 3,
        });
      }
    });
  });

  // 32 mm-hyllehull
  if (panels.some((p) => p.kind === 'shelf')) {
    const bottom = panels.find((p) => p.code === 'BUNN');
    const tops = panels.filter((p) => p.code === 'TOPP' || p.code === 'REKKE');
    if (bottom && tops.length) {
      const z0 = maxOf(bottom)[2] + 64;
      const z1 = Math.min(...tops.map((p) => minOf(p)[2])) - 64;
      const count = Math.floor((z1 - z0) / 32) + 1;
      panels.forEach((S, si) => {
        if (S.code !== 'SIDE' || count < 1) return;
        const sMin = minOf(S), sMax = maxOf(S);
        const inward = (sMin[0] + sMax[0]) / 2 < centre[0] ? 1 : -1;
        const face = inward > 0 ? sMax[0] : sMin[0];
        const v0 = sMin[1] + 37, v1 = sMax[1] - 37;
        holes.push({
          panel: si, kind: 'hyllehull', start: [face, v0, z0], dir: unit(0, -inward), diameter: 5, depth: 12,
          pattern: { dir1: [0, 0, 1], count1: count, spacing1: 32, dir2: [0, 1, 0], count2: 2, spacing2: v1 - v0 },
        });
      });
    }
  }

  // Hengselkopper
  const doors = panels.map((p, i) => ({ p, i })).filter(({ p }) => p.code === 'DOR');
  for (const { p: D, i } of doors) {
    const dMin = minOf(D), dMax = maxOf(D);
    const left = doors.length === 1 || (dMin[0] + dMax[0]) / 2 < centre[0];
    const u = left ? dMin[0] + 22.5 : dMax[0] - 22.5;
    const zs = [dMin[2] + 100, dMax[2] - 100];
    if (D.size[2] > 900) zs.splice(1, 0, (dMin[2] + dMax[2]) / 2);
    for (const z of zs)
      holes.push({ panel: i, kind: 'hengselkopp', start: [u, dMin[1], z], dir: [0, 1, 0], diameter: 35, depth: 12.5 });
    // Knott: Ø5 gjennom for M4-skrue, 40 mm fra kanten motsatt hengslene, 60 mm under overkant
    const ku = left ? dMax[0] - 40 : dMin[0] + 40;
    holes.push({ panel: i, kind: 'knott', start: [ku, dMin[1], dMax[2] - 60], dir: [0, 1, 0], diameter: 5, depth: D.size[1] });
  }
  return holes;
}

/** Volumet hullene tar ut av platene (hullene overlapper ikke hverandre). */
export function holeVolume(h: Hole) {
  const n = h.pattern ? h.pattern.count1 * h.pattern.count2 : 1;
  return n * Math.PI * (h.diameter / 2) ** 2 * h.depth;
}
