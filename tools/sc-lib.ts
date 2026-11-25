// Felles byggesteiner for SolidCraft-kommandoer (brukes av solidcraft.ts og bibliotek.ts).

import { moduleHoles, holeVolume, type Hole } from '../src/library/holes.ts';
import { identifyPanels } from '../src/model/export.ts';
import type { ModuleInstance, Panel } from '../src/model/types.ts';

export type V3 = [number, number, number];
export type Cmd = { command: string; params: Record<string, unknown> };

export const r = (v: number) => Math.round(v * 1000) / 1000 + 0; // + 0 fjerner -0
export const vol = (s: V3) => s[0] * s[1] * s[2];

/** Plassering for eksplodert visning: X = u, Y = -v, Z = z, flyttet ut fra modulens senter. */
export function explodedPlacement(panels: Panel[], factor: number) {
  const lo = [0, 1, 2].map((i) => Math.min(...panels.map((p) => p.pos[i])));
  const hi = [0, 1, 2].map((i) => Math.max(...panels.map((p) => p.pos[i] + p.size[i])));
  const mc = lo.map((v, i) => (v + hi[i]) / 2);
  return (panel: Panel) => {
    const pc = panel.pos.map((v, i) => v + panel.size[i] / 2);
    const off = pc.map((v, i) => (v - mc[i]) * factor);
    return {
      point([u, v, z]: V3): V3 { return [r(u + off[0]), r(-(v + off[1])), r(z + off[2])]; },
      dir([du, dv, dz]: V3): V3 { return [r(du), r(-dv), r(dz)]; },
    };
  };
}

export type Place = { point(p: V3): V3; dir(d: V3): V3 };

export function boxCmd(name: string, panel: Panel, place: Place): Cmd {
  const a = place.point(panel.pos);
  const b = place.point(panel.pos.map((v, i) => v + panel.size[i]) as V3);
  const corner = [0, 1, 2].map((i) => Math.min(a[i], b[i])) as V3;
  const size = [0, 1, 2].map((i) => r(Math.abs(a[i] - b[i])));
  return {
    command: 'solid.box',
    params: { corner, length: size[0], width: size[1], height: size[2], name, body_name: name, operation: 'new' },
  };
}

let featureNo = 0;
export function holeCmds(body: string, h: Hole, place: Place): Cmd[] {
  const d = place.dir(h.dir);
  const s = place.point(h.start);
  const through = h.kind === 'konfirmat' || h.kind === 'knott';
  const base = s.map((v, i) => r(v - d[i] * 0.5));
  const name = `${body} ${h.kind} ${++featureNo}`;
  const cmds: Cmd[] = [{
    command: 'solid.cylinder',
    params: {
      diameter: h.diameter, height: r(h.depth + (through ? 1 : 0.5)), base, axis: d,
      operation: 'cut', targets: [body], name,
    },
  }];
  if (h.pattern) {
    const p = h.pattern;
    cmds.push({
      command: 'solid.pattern.rectangular',
      params: {
        features: [name], name: `${name} rader`,
        dir1: place.dir(p.dir1), count1: p.count1, spacing1: p.spacing1,
        dir2: place.dir(p.dir2), count2: p.count2, spacing2: r(p.spacing2),
      },
    });
  }
  return cmds;
}

/** Bygger én modul: plater først, så hull. Returnerer kommandoer og forventet volum. */
/** Med `onlyKinds` lages bare de hullene (et tillegg til en modell som allerede er bygget). */
export function moduleCmds(m: ModuleInstance, label: string, placeFor: (p: Panel) => Place, onlyKinds?: Hole['kind'][]) {
  const ids = identifyPanels(m, label);
  const counts = new Map<string, number>();
  ids.forEach((x) => counts.set(x.partId, (counts.get(x.partId) ?? 0) + 1));
  const names = ids.map((x) => (counts.get(x.partId)! > 1 ? `${x.partId}.${x.instance}` : x.partId));
  const panels = ids.map((x) => x.panel);
  const holes = moduleHoles(panels).filter((h) => !onlyKinds || onlyKinds.includes(h.kind));
  const cmds: Cmd[] = onlyKinds ? [] : panels.map((p, i) => boxCmd(names[i], p, placeFor(p)));
  for (const h of holes) cmds.push(...holeCmds(names[h.panel], h, placeFor(panels[h.panel])));
  const volume = (onlyKinds ? 0 : panels.reduce((a, p) => a + vol(p.size), 0)) - holes.reduce((a, h) => a + holeVolume(h), 0);
  return { cmds, volume, bodies: panels.length, holes: holes.length, names };
}

