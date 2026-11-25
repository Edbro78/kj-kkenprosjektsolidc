// Tegner et rom fra romplanleggeren i SolidCraft, uten at SolidCraft-vinduet trenger å være åpent.
//
//   npm run tegn -- "C:\Users\...\Downloads\mitt-rom.design.json" [--apne]
//
// Resultat i solidcraft/bibliotek/Rom/<Romnavn>/ (vises i bibliotekspanelet i SolidCraft):
//   <Romnavn>.sc                     hele rommet: vegger, dører, vinduer, alle plater med hull, farger
//   <Romnavn>.step                   samme modell for andre CAD-/CAM-programmer
//   Eksplodert <ID> <Modul>.sc       eksplodert visning av hver unike modul
// Antall deler og volum sjekkes mot utregningen. Med --apne åpnes rommet i SolidCraft til slutt.
// Skriver en JSON-linje som starter med RESULTAT: til slutt (brukes av knappen i appen).

import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const open = args.includes('--apne');
const input = args.find((a) => !a.startsWith('--'));
if (!input || !existsSync(input)) {
  console.error('Bruk: npm run tegn -- <fil>.design.json [--apne]');
  process.exit(1);
}
const design = JSON.parse(readFileSync(input, 'utf8'));
if (design.schema !== 'design/1') {
  console.error('Fila er ikke en design-JSON fra romplanleggeren (mangler "schema": "design/1").');
  process.exit(1);
}

const CLI = 'C:/Program Files/SolidCraft/solidcraft-cli.exe';
const APP = 'C:/Program Files/SolidCraft/solidcraft.exe';
const clean = (s: string) => s.replace(/[<>:"/\\|?*]/g, '-').trim();
const name = clean(String(design.room.name || 'Rom'));
const slug = name.toLowerCase().replace(/[^a-z0-9æøå]+/g, '-').replace(/^-|-$/g, '') || 'rom';
const batchDir = resolve('solidcraft', 'batches', slug);
const outDir = resolve('solidcraft', 'bibliotek', 'Rom', name);
rmSync(outDir, { recursive: true, force: true }); // gamle eksploderte filer for moduler som ikke finnes lenger
mkdirSync(outDir, { recursive: true });

type Entry = { file: string; title: string; volume_mm3: number; bodies: number };
console.log(`1/3  Lager SolidCraft-kommandoer for «${design.room.name}» …`);
execFileSync(process.execPath, ['tools/solidcraft.ts', input, batchDir], { stdio: 'ignore' });
const manifest: Entry[] = JSON.parse(readFileSync(join(batchDir, 'manifest.json'), 'utf8'));

const jobs = [
  { entry: manifest.find((m) => m.file === 'hele-rommet.json')!, sc: join(outDir, `${name}.sc`), step: join(outDir, `${name}.step`) },
  ...manifest.filter((m) => m.file.startsWith('eksplodert-farger-')).map((m) => ({
    entry: m, sc: join(outDir, `${clean(m.title.replace(/ \(.*\)$/, ''))}.sc`), step: null as string | null,
  })),
];

console.log(`2/3  Bygger rommet og ${jobs.length - 1} eksploderte moduler i SolidCraft …`);
const t0 = Date.now();
const results: { file: string; ok: boolean; bodies: number; volume: number; expected: number }[] = [];
for (const j of jobs) {
  const run = ['run', join(batchDir, j.entry.file), '--save', j.sc, '--quiet'];
  if (j.step) run.push('--out', j.step);
  execFileSync(CLI, run, { stdio: ['ignore', 'ignore', 'inherit'] });
  const evalFile = join(batchDir, '_kontroll.json');
  execFileSync(CLI, ['eval', j.sc, '--quiet', '--json-out', evalFile], { stdio: 'ignore' });
  const e = JSON.parse(readFileSync(evalFile, 'utf8'));
  const volume = (e.total ?? e.measure?.total).volume_mm3;
  const bodies = (e.bodies ?? e.measure?.bodies ?? []).length;
  const ok = Math.abs(volume - j.entry.volume_mm3) / j.entry.volume_mm3 < 1e-7 && bodies === j.entry.bodies;
  results.push({ file: j.sc, ok, bodies, volume, expected: j.entry.volume_mm3 });
  console.log(`     ${ok ? 'OK     ' : 'AVVIK  '} ${j.sc.split(/[\\/]/).pop()}  (${bodies} deler)`);
}

console.log('3/3  Kontroll');
const allOk = results.every((r) => r.ok);
console.log(`\n${allOk ? 'Ferdig' : 'ADVARSEL: noe avviker fra utregningen'} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
console.log(`  Mappe: ${outDir}`);
console.log('  Åpne fra bibliotekspanelet i SolidCraft: bibliotek › Rom › ' + name);

// SolidCraft sender ikke en fil videre til et vindu som allerede er åpent (det starter et nytt).
// Kjører SolidCraft, ligger rommet klart i bibliotekspanelet; ellers startes det med rommet åpent.
let opened: 'started' | 'running' | 'no' = 'no';
if (open && existsSync(APP)) {
  const running = /solidcraft.exe/i.test(execFileSync('tasklist', ['/FI', 'IMAGENAME eq solidcraft.exe', '/NH'], { encoding: 'utf8' }));
  if (running) {
    opened = 'running';
    console.log('  SolidCraft er åpent: dobbeltklikk rommet i bibliotekspanelet (trykk ↻ hvis det ikke vises).');
  } else {
    spawn(APP, ['--control', '7878', jobs[0].sc], { detached: true, stdio: 'ignore' }).unref();
    opened = 'started';
    console.log('  Starter SolidCraft med rommet …');
  }
}
console.log('RESULTAT:' + JSON.stringify({ ok: allOk, opened, folder: outDir, room: jobs[0].sc, files: results }));
if (!allOk) process.exit(2);
