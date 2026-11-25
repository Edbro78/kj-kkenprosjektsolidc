// Lager SolidCraft-batcher for et modulbibliotek: én ferdig modell per modultype og variant,
// med alle plater, hull og farger. Hver batch starter et nytt design og lagrer det som .sc.
//
//   node tools/bibliotek.ts <mappe for batcher> <mappe der .sc-filene skal lagres>
//
// Bygg uten appen (raskt, skriver rett i mappen):
//   solidcraft-cli run <batchmappe>/cli-01-underskap.json --save "solidcraft/bibliotek/Underskap 400 - 1 dør.sc"
//
// Modulen står med ryggen mot Y = 0 og fronten mot -Y, venstre side i X = 0, gulvet i Z = 0.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { LIBRARY, defaultParams, colorHex, type Params } from '../src/library/index.ts';
import type { ModuleInstance, ModuleType, Panel } from '../src/model/types.ts';
import { explodedPlacement, moduleCmds, type Cmd } from './sc-lib.ts';

const [, , batchDir = 'solidcraft/batches/bibliotek', saveDir = 'solidcraft/bibliotek'] = process.argv;
mkdirSync(batchDir, { recursive: true });

interface Variant { file: string; type: ModuleType; params: Params }
const V = (file: string, type: ModuleType, params: Params): Variant => ({ file, type, params: { ...defaultParams(type), ...params } });

export const VARIANTS: Variant[] = [
  V('Underskap 400 - 1 dør', 'underskap', { bredde: 400, dorer: 1 }),
  V('Underskap 600 - 1 dør', 'underskap', { bredde: 600, dorer: 1 }),
  V('Underskap 800 - 2 dører', 'underskap', { bredde: 800, dorer: 2 }),
  V('Underskap 1000 - 2 dører', 'underskap', { bredde: 1000, dorer: 2 }),
  V('Underskap 600 - åpent', 'underskap', { bredde: 600, dorer: 0, hyller: 2 }),
  V('Hylle 400 x 2000', 'hylle', { bredde: 400, hoyde: 2000 }),
  V('Hylle 800 x 2000', 'hylle', { bredde: 800, hoyde: 2000 }),
  V('Hylle 800 x 1200 lav', 'hylle', { bredde: 800, hoyde: 1200, hyller: 2 }),
  V('Hylle 1000 x 800 benk', 'hylle', { bredde: 1000, hoyde: 800, hyller: 1 }),
  V('Skrivebord 1200', 'skrivebord', { bredde: 1200, dybde: 600 }),
  V('Skrivebord 1400', 'skrivebord', { bredde: 1400 }),
  V('Skrivebord 1800', 'skrivebord', { bredde: 1800, dybde: 800 }),
];

const BACK = '#dcd8cf', TOP = '#9c8f7d';
const manifest: { file: string; batch: string; volume_mm3: number; bodies: number; bbox: { min: number[]; max: number[] } }[] = [];

VARIANTS.forEach((v, i) => {
  const t = LIBRARY[v.type];
  const m: ModuleInstance = { id: 'bib', type: v.type, x: 0, y: 0, rotation: 0, params: v.params };
  const panels = t.panels(v.params);
  const mc = moduleCmds(m, t.prefix, explodedPlacement(panels, 0));
  const color = colorHex(v.params.farge);
  // Farge per platetype
  const groups = new Map<string, string[]>();
  panels.forEach((p: Panel, k) => {
    const c = p.kind === 'back' ? BACK : p.kind === 'top' && v.type === 'underskap' ? TOP : color;
    groups.set(c, [...(groups.get(c) ?? []), mc.names[k]]);
  });
  const path = join(saveDir, `${v.file}.sc`).replace(/\\/g, '/');
  const cmds: Cmd[] = [
    { command: 'new_design', params: { name: v.file } },
    ...mc.cmds,
    ...[...groups].map(([c, bodies]) => ({ command: 'appearance.assign', params: { bodies, color: c } })),
    { command: 'save', params: { path } },
  ];
  const batch = `${String(i + 1).padStart(2, '0')}-${v.type}.json`;
  writeFileSync(join(batchDir, batch), JSON.stringify({ commands: cmds }));
  // Samme bygging uten new_design og save, for `solidcraft-cli run <fil> --save <sc>`
  writeFileSync(join(batchDir, `cli-${batch}`), JSON.stringify({ commands: cmds.slice(1, -1) }));
  // Forventet ramme: alle plater i lokale koordinater, Y = -v
  const lo = [0, 1, 2].map((a) => Math.min(...panels.map((p) => p.pos[a])));
  const hi = [0, 1, 2].map((a) => Math.max(...panels.map((p) => p.pos[a] + p.size[a])));
  manifest.push({
    file: path, batch, volume_mm3: Math.round(mc.volume * 10) / 10, bodies: mc.bodies,
    bbox: { min: [lo[0], -hi[1], lo[2]], max: [hi[0], -lo[1], hi[2]] },
  });
});

writeFileSync(join(batchDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.table(manifest.map((x) => ({ batch: x.batch, fil: x.file.split('/').pop(), volum: x.volume_mm3, plater: x.bodies })));
