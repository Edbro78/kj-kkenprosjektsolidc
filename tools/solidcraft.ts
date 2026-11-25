// Lager SolidCraft-kommandoer (batch-filer) fra en design-JSON.
//
//   node tools/solidcraft.ts eksempler/eksempelrom.design.json solidcraft/batches
//
// Verdenskoordinater i SolidCraft: X mot øst, Y mot nord, Z opp, origo i sørvestre innerhjørne
// (Y = romdybde - y fra planen). Hver plate blir en egen body med navn = del-ID (+ .2, .3 ved like plater).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { LIBRARY, colorHex } from '../src/library/index.ts';
import { moduleLabels } from '../src/model/export.ts';
import type { Design, ModuleInstance } from '../src/model/types.ts';
import { r, explodedPlacement, moduleCmds, type Cmd, type V3 } from './sc-lib.ts';

const [, , input = 'eksempler/eksempelrom.design.json', outDir = 'solidcraft/batches'] = process.argv;
const design: Design = JSON.parse(readFileSync(input, 'utf8'));
const { room } = design;
mkdirSync(outDir, { recursive: true });


/** Plassering av en modul: lokale (u, v, z) → verden. */
function placement(m: ModuleInstance) {
  const f = LIBRARY[m.type].footprint(m.params);
  const a = (m.rotation * Math.PI) / 180;
  const c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
  return {
    point([u, v, z]: V3): V3 {
      const lx = u - f.w / 2, ly = v - f.d / 2;
      return [r(m.x + lx * c - ly * s), r(room.depth - (m.y + lx * s + ly * c)), r(z)];
    },
    dir([du, dv, dz]: V3): V3 {
      return [r(du * c - dv * s), r(-(du * s + dv * c)), r(dz)];
    },
  };
}

function roomCmds() {
  const W = room.width, D = room.depth, H = room.height, T = room.wallThickness;
  const cmds: Cmd[] = [];
  const box = (name: string, corner: V3, l: number, w: number, h: number) =>
    cmds.push({ command: 'solid.box', params: { corner, length: l, width: w, height: h, name, body_name: name, operation: 'new' } });
  box('ROM-GULV', [-T, -T, -20], W + 2 * T, D + 2 * T, 20);
  box('ROM-VEGG-N', [-T, D, 0], W + 2 * T, T, H);
  box('ROM-VEGG-S', [-T, -T, 0], W + 2 * T, T, H);
  box('ROM-VEGG-V', [-T, 0, 0], T, D, H);
  box('ROM-VEGG-Ø', [W, 0, 0], T, D, H);
  let volume = (W + 2 * T) * (D + 2 * T) * 20 + 2 * (W + 2 * T) * T * H + 2 * T * D * H;
  const wallName = { N: 'ROM-VEGG-N', S: 'ROM-VEGG-S', W: 'ROM-VEGG-V', E: 'ROM-VEGG-Ø' } as const;
  for (const o of room.openings) {
    const z0 = o.kind === 'window' ? o.sill ?? 900 : 0;
    const along = o.wall === 'N' || o.wall === 'S';
    const corner: V3 =
      o.wall === 'N' ? [o.offset, D - 1, z0]
      : o.wall === 'S' ? [o.offset, -T - 1, z0]
      : o.wall === 'W' ? [-T - 1, D - o.offset - o.width, z0]
      : [W - 1, D - o.offset - o.width, z0];
    cmds.push({
      command: 'solid.box',
      params: {
        corner, length: along ? o.width : T + 2, width: along ? T + 2 : o.width, height: o.height,
        operation: 'cut', targets: [wallName[o.wall]], name: `${o.kind === 'door' ? 'Døråpning' : 'Vindusåpning'} ${o.id}`,
      },
    });
    volume -= o.width * o.height * T;
  }
  return { cmds, volume, bodies: 5 };
}

const write = (file: string, cmds: Cmd[]) => writeFileSync(join(outDir, file), JSON.stringify({ commands: cmds }, null, 1));
const manifest: { file: string; title: string; volume_mm3: number; bodies: number; holes?: number; module_volume_mm3?: number; module_bodies?: string[] }[] = [];

// 1. Rommet
const rc = roomCmds();
let total = rc.volume, bodies = rc.bodies;
write('00-rom.json', rc.cmds);
// Hele rommet i én fil (rom + alle moduler + farger), for `solidcraft-cli run` (se tools/tegn.ts)
const all: Cmd[] = [...rc.cmds];
const looks = new Map<string, string[]>();
const look = (color: string, body: string) => looks.set(color, [...(looks.get(color) ?? []), body]);
manifest.push({ file: '00-rom.json', title: 'Rom', volume_mm3: Math.round(total), bodies });

// 2. Modulene i rommet, én batch per modul (volum og antall bodies er kumulative)
const labels = moduleLabels(design.modules);
design.modules.forEach((m, i) => {
  const label = labels.get(m.id)!;
  const place = placement(m);
  const mc = moduleCmds(m, label, () => place);
  total += mc.volume;
  bodies += mc.bodies;
  const file = `${String(i + 1).padStart(2, '0')}-${label}.json`;
  write(file, mc.cmds);
  all.push(...mc.cmds);
  LIBRARY[m.type].panels(m.params).forEach((p, k) =>
    look(p.kind === 'back' ? '#dcd8cf' : p.kind === 'top' && m.type === 'underskap' ? '#9c8f7d' : colorHex(m.params.farge), mc.names[k]));
  manifest.push({ file, title: `${label} ${LIBRARY[m.type].name}`, volume_mm3: Math.round(total), bodies, holes: mc.holes, module_volume_mm3: Math.round(mc.volume * 10) / 10, module_bodies: mc.names });
});

all.push(
  { command: 'appearance.assign', params: { bodies: ['ROM-VEGG-N', 'ROM-VEGG-S', 'ROM-VEGG-V', 'ROM-VEGG-Ø'], color: '#e8e4dc', opacity: 0.22 } },
  { command: 'appearance.assign', params: { bodies: ['ROM-GULV'], color: '#c9b08a' } },
  ...[...looks].map(([color, b]) => ({ command: 'appearance.assign', params: { bodies: b, color } })),
);
write('hele-rommet.json', all);
manifest.push({ file: 'hele-rommet.json', title: 'Hele rommet med farger', volume_mm3: Math.round(total), bodies });

// 3. Eksplodert visning: én per unik modul (samme type og parametere)
const unique = new Map<string, ModuleInstance>();
for (const m of design.modules) {
  const key = m.type + JSON.stringify(m.params);
  if (!unique.has(key)) unique.set(key, m);
}
/** Merkelappene til alle moduler som er like denne. */
const mods = (m: ModuleInstance) =>
  design.modules.filter((x) => x.type + JSON.stringify(x.params) === m.type + JSON.stringify(m.params)).map((x) => labels.get(x.id)!);
for (const m of unique.values()) {
  const label = labels.get(m.id)!;
  const panels = LIBRARY[m.type].panels(m.params);
  const ex = explodedPlacement(panels, 0.9);
  const mc = moduleCmds(m, label, ex);
  const file = `eksplodert-${label}.json`;
  write(file, mc.cmds);
  manifest.push({ file, title: `Eksplodert ${label} ${LIBRARY[m.type].name}`, volume_mm3: Math.round(mc.volume), bodies: mc.bodies, holes: mc.holes });
  // Samme eksploderte modul med farger, for solidcraft-cli (tools/tegn.ts)
  const exLooks = new Map<string, string[]>();
  panels.forEach((p, k) => {
    const c = p.kind === 'back' ? '#dcd8cf' : p.kind === 'top' && m.type === 'underskap' ? '#9c8f7d' : colorHex(m.params.farge);
    exLooks.set(c, [...(exLooks.get(c) ?? []), mc.names[k]]);
  });
  write(`eksplodert-farger-${label}.json`, [
    ...mc.cmds,
    ...[...exLooks].map(([color, b]) => ({ command: 'appearance.assign', params: { bodies: b, color } })),
  ]);
  manifest.push({
    file: `eksplodert-farger-${label}.json`, title: `Eksplodert ${LIBRARY[m.type].name} ${label} (${mods(m).join(', ')})`,
    volume_mm3: Math.round(mc.volume * 10) / 10, bodies: mc.bodies, holes: mc.holes,
  });
}

// 4. Tillegg: knotthull for modeller bygget før knotthullene kom med (fase 3)
{
  const cmds: Cmd[] = [];
  let v = 0; // volumet knotthullene tar ut (totalen over inkluderer dem allerede)
  design.modules.forEach((m) => {
    const place = placement(m);
    const mc = moduleCmds(m, labels.get(m.id)!, () => place, ['knott']);
    cmds.push(...mc.cmds);
    v += mc.volume;
  });
  write('tillegg-knott.json', cmds);
  manifest.push({ file: 'tillegg-knott.json', title: 'Tillegg: knotthull', volume_mm3: Math.round(total), bodies, holes: cmds.length, module_volume_mm3: Math.round(v * 10) / 10 });
  for (const m of unique.values()) {
    const label = labels.get(m.id)!;
    const mc = moduleCmds(m, label, explodedPlacement(LIBRARY[m.type].panels(m.params), 0.9), ['knott']);
    if (!mc.cmds.length) continue;
    write(`tillegg-knott-eksplodert-${label}.json`, mc.cmds);
    manifest.push({ file: `tillegg-knott-eksplodert-${label}.json`, title: `Tillegg: knotthull ${label}`, volume_mm3: 0, bodies: 0, holes: mc.cmds.length, module_volume_mm3: Math.round(mc.volume * 10) / 10 });
  }
}

writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.table(manifest);
