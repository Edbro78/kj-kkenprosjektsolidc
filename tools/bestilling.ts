// Lager en bestillingspakke fra en design-JSON:
//
//   node tools/bestilling.ts eksempler/eksempelrom.design.json
//
// Resultat i bestilling/<romnavn>/:
//   dxf/                  én DXF per unik MDF-plate (kontur + hull), klar for CNC
//   mdf-bestilling.csv    alle MDF-deler med mål, antall, hull og DXF-fil
//   mdf-sammendrag.csv    m² og antall hele plater per tykkelse
//   beslag-kjop.csv       skruer og beslag som kjøpes
//   3d-print.csv          plastdeler som printes, med fil, antall og vekt
//   3d-print/             STL og 3MF for plastdelene
//   modell/               SolidCraft-modell og STEP av hele rommet
//   montering.pdf         monteringsanvisning med eksploderte tegninger
//   LESMEG.txt            hva pakken inneholder
//
// Innholdet lages av buildPackage i src/model/bestilling.ts, som knappen i appen også bruker.
// Her legges filsystemet til: plastdelfiler, bilder og modell kopieres inn, og PDF lages med Edge.

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildPackage, packageSlug } from '../src/model/bestilling.ts';
import type { Design } from '../src/model/types.ts';

const [, , input = 'eksempler/eksempelrom.design.json'] = process.argv;
const design: Design = JSON.parse(readFileSync(input, 'utf8'));
const slug = packageSlug(design);
const out = resolve('bestilling', slug);
rmSync(out, { recursive: true, force: true });
for (const d of ['dxf', '3d-print', 'modell', 'bilder']) mkdirSync(join(out, d), { recursive: true });

const SC = resolve('solidcraft');

// Modell og bilder fra SolidCraft (finnes bare når rommet er bygget der)
let model = false;
for (const f of ['eksempelrom.step', 'eksempelrom.sc']) {
  if (!existsSync(join(SC, f))) continue;
  copyFileSync(join(SC, f), join(out, 'modell', f.replace('eksempelrom', slug)));
  model = true;
}
const copyImage = (name: string) => {
  const src = [join(SC, name), join(SC, 'plastdeler', name)].find(existsSync);
  if (src) copyFileSync(src, join(out, 'bilder', name));
  return src ? `bilder/${name}` : null;
};

const pkg = buildPackage(design, {
  pdf: true,
  model,
  images: {
    overview: copyImage('eksempelrom.png'),
    plast: copyImage('plastdeler.png'),
    module: (label) => copyImage(`eksplodert-${label}.png`),
  },
});

for (const f of pkg.files) {
  mkdirSync(dirname(join(out, f.path)), { recursive: true });
  writeFileSync(join(out, f.path), f.content);
}

// STL og 3MF for plastdelene
for (const key of pkg.print) {
  for (const ext of ['stl', '3mf']) {
    const src = join(SC, 'plastdeler', `${key}.${ext}`);
    if (existsSync(src)) copyFileSync(src, join(out, '3d-print', `${key}.${ext}`));
    else console.warn(`Mangler ${src}`);
  }
}

// PDF med Edge i hodeløs modus
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (edge) {
  execFileSync(edge, [
    '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
    `--print-to-pdf=${join(out, 'montering.pdf')}`, 'file:///' + join(out, 'montering.html').replace(/\\/g, '/'),
  ], { stdio: 'ignore', timeout: 60000 });
} else console.warn('Fant ikke Edge: montering.pdf ble ikke laget (montering.html finnes)');

console.log(`Bestillingspakke: ${out}`);
console.table(pkg.mdf.map((r) => ({ fil: r.file, antall: r.qty, mål: `${r.l}×${r.w}×${r.t}`, hull: r.holes })));
