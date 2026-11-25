// Bestillingspakken som tekstfiler. Brukes både av CLI-en (tools/bestilling.ts) og av knappen i appen.
// Ingen filsystem her: kalleren skriver filene, legger til STL/3MF og bilder, og lager eventuelt PDF.

import { LIBRARY, COLORS } from '../library/index.ts';
import { moduleHoles } from '../library/holes.ts';
import { identifyPanels, moduleLabels, partListCsv } from './export.ts';
import { canonical, frameKey, holeSummary, panelDxf, panelFrame, type PanelFrame } from './dxf.ts';
import type { Design, ModuleInstance, PrintPart } from './types.ts';

export interface PackageImages {
  /** Bilde av hele rommet (sti i pakken eller data-URL). */
  overview?: string | null;
  /** Bilde av plastdelene. */
  plast?: string | null;
  /** Eksplodert bilde av en modul, gitt modulens merkelapp (f.eks. UK-01). */
  module?: (label: string) => string | null;
}

export interface PackageOptions {
  images?: PackageImages;
  /** Om pakken får montering.pdf (CLI) eller bare montering.html (appen). */
  pdf?: boolean;
  /** Om pakken har en modell-mappe med STEP og SolidCraft-fil. */
  model?: boolean;
}

export interface PackageFile { path: string; content: string }

export interface MdfRow {
  file: string; id: string; module: string; part: string; t: number; l: number; w: number;
  qty: number; color: string; holes: string; note: string;
}

export interface Package {
  slug: string;
  files: PackageFile[];
  /** Plastdeler pakken trenger STL/3MF for: 3d-print/<nøkkel>.stl og .3mf */
  print: PrintPart[];
  mdf: MdfRow[];
  html: string;
}

export const packageSlug = (design: Design) =>
  design.room.name.toLowerCase().replace(/[^a-z0-9æøå]+/g, '-').replace(/^-|-$/g, '') || 'rom';

export const PRINT_PARTS: Record<PrintPart, { name: string; volumeCm3: number; note: string }> = {
  hyllebaerer: { name: 'Hyllebærer Ø5', volumeCm3: 1.0097, note: 'Print liggende på siden, tappen langs byggeplata' },
  knott: { name: 'Knott Ø30', volumeCm3: 10.122, note: 'Print stående på den flate undersiden (halsen ned). Gjengeinnsats M4 presses inn med loddebolt' },
  vinkelbeslag: { name: 'Vinkelbeslag 40 mm', volumeCm3: 8.652, note: 'Print stående på den lange kanten for sterkest hjørne' },
};
const PETG = 1.27; // g/cm³
const SHEET = 2.44 * 1.22; // hel plate 2440 × 1220 mm

const csv = (rows: (string | number)[][]) =>
  '﻿' + rows.map((r) => r.map((v) => {
    const s = typeof v === 'number' ? String(v).replace('.', ',') : v;
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(';')).join('\r\n');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const STEPS: Record<string, string[]> = {
  underskap: [
    'Skru de fire justerbare skapbena fast under bunnplata, ca. 50 mm inn fra hjørnene.',
    'Sett bunnen mellom sidene. Skru konfirmatskruene (7×50) gjennom Ø7-hullene i sidene og inn i Ø5-forboringene i kanten av bunnen.',
    'Monter de to topprekkene på samme måte, én foran og én bak.',
    'Mål diagonalene. Når de er like er skapet i vinkel. Skru bakplata fast med sponplateskruer 3,5×16.',
    'Skru hengselplatene på innsiden av sida. Trykk hengslene i Ø35-koppene i døra, heng på døra og juster fugen til 3 mm.',
    'Varm gjengeinnsatsen inn i knotten med loddebolt. Skru knotten fast med M4×25 fra innsiden av døra.',
    'Sett hyllebærerne i 32 mm-hullene i ønsket høyde og legg på hylla.',
    'Klips sokkelfronten på bena. Legg på benkeplata og skru den fast nedenfra gjennom topprekkene (4×40).',
  ],
  hylle: [
    'Legg den ene sida ned med hyllehullene opp. Sett topp og bunn på plass.',
    'Skru konfirmatskruene (7×50) gjennom sida og inn i kantene. Sett på den andre sida og gjenta.',
    'Mål diagonalene og skru bakplata fast med sponplateskruer 3,5×16.',
    'Reis hylla og fest den til veggen med veggfestet. Det er viktig: høye hyller kan velte.',
    'Sett hyllebærerne i 32 mm-hullene og legg inn hyllene.',
  ],
  skrivebord: [
    'Sett ryggen mellom gavlene og skru konfirmatskruene (7×50) gjennom gavlene og inn i kantene.',
    'Skru to vinkelbeslag på innsiden av hver gavl, i flukt med overkanten. Forbor Ø2,5 og bruk 4×16.',
    'Legg bordplata med undersiden opp på et mykt underlag. Sett understellet opp ned på plata, sentrert.',
    'Skru vinkelbeslagene fast i bordplata (4×16). Forbor Ø2,5, maks 15 mm dypt.',
    'Skru inn glidere under gavlene, snu bordet og juster.',
  ],
};

export function buildPackage(design: Design, opts: PackageOptions = {}): Package {
  const images = opts.images ?? {};
  const files: PackageFile[] = [];
  const add = (path: string, content: string) => files.push({ path, content });
  const labels = moduleLabels(design.modules);

  // ---------------------------------------------------------------- MDF og DXF
  const mdf: MdfRow[] = [];
  for (const m of design.modules) {
    const label = labels.get(m.id)!;
    const ids = identifyPanels(m, label);
    const holes = moduleHoles(ids.map((x) => x.panel));
    const color = COLORS.find((c) => c.value === m.params.farge)?.label ?? '';
    // Grupper platene etter del-ID, og innen hver ID etter hullbilde (snudd til fast orientering)
    const groups = new Map<string, { frame: PanelFrame; qty: number; part: string; note: string }[]>();
    ids.forEach((x, i) => {
      if (x.panel.material !== 'MDF') return;
      const frame = canonical(panelFrame(x.panel, holes.filter((h) => h.panel === i)));
      const list = groups.get(x.partId) ?? [];
      const same = list.find((g) => frameKey(g.frame) === frameKey(frame));
      if (same) same.qty++;
      else list.push({ frame, qty: 1, part: x.panel.name, note: x.panel.note ?? '' });
      groups.set(x.partId, list);
    });
    for (const [id, list] of groups) {
      list.forEach((g, i) => {
        const fullId = list.length > 1 ? `${id}-${String.fromCharCode(65 + i)}` : id;
        const f = g.frame;
        const file = `dxf/${fullId}.dxf`;
        add(file, panelDxf(f, [
          `${fullId}  ${g.part}  MDF ${f.t} mm  ${color}`,
          `${f.l} x ${f.w} mm   Antall: ${g.qty}`,
          'Sett fra side 1. S2-hull bores fra baksiden.',
        ]));
        mdf.push({
          file, id: fullId, module: label, part: g.part, t: f.t, l: f.l, w: f.w, qty: g.qty, color,
          holes: holeSummary(f), note: g.note,
        });
      });
    }
  }

  add('mdf-bestilling.csv', csv([
    ['Fil', 'ID', 'Modul', 'Del', 'Tykkelse (mm)', 'Lengde (mm)', 'Bredde (mm)', 'Antall', 'Farge', 'Hull', 'Merknad'],
    ...mdf.map((r) => [r.file, r.id, r.module, r.part, r.t, r.l, r.w, r.qty, r.color, r.holes, r.note]),
  ]));

  // Sammendrag per tykkelse og farge, hele plater med 15 % kapp
  const byThickness = new Map<string, { t: number; color: string; parts: number; area: number }>();
  for (const r of mdf) {
    const k = `${r.t}|${r.color}`;
    const s = byThickness.get(k) ?? { t: r.t, color: r.color, parts: 0, area: 0 };
    s.parts += r.qty;
    s.area += (r.qty * r.l * r.w) / 1e6;
    byThickness.set(k, s);
  }
  const summary = [...byThickness.values()].sort((a, b) => a.t - b.t);
  add('mdf-sammendrag.csv', csv([
    ['Tykkelse (mm)', 'Farge', 'Antall deler', 'Areal (m²)', 'Hele plater 2440×1220 (inkl. 15 % kapp)'],
    ...summary.map((s) => [s.t, s.color, s.parts, Math.round(s.area * 100) / 100, Math.ceil((s.area * 1.15) / SHEET)]),
  ]));

  // ---------------------------------------------------------------- Beslag og 3D-print
  const buy = new Map<string, number>();
  const print = new Map<PrintPart, number>();
  for (const m of design.modules) {
    for (const h of LIBRARY[m.type].hardware(m.params)) {
      if (h.qty <= 0) continue;
      if (h.print) print.set(h.print, (print.get(h.print) ?? 0) + h.qty);
      else buy.set(h.name, (buy.get(h.name) ?? 0) + h.qty);
    }
  }
  add('beslag-kjop.csv', csv([
    ['Beslag', 'Antall'],
    ...[...buy].sort((a, b) => a[0].localeCompare(b[0], 'nb')),
  ]));
  const printRows: (string | number)[][] = [];
  for (const [key, qty] of print) {
    const p = PRINT_PARTS[key];
    const g = Math.round(p.volumeCm3 * PETG * 10) / 10;
    printRows.push([p.name, qty, `3d-print/${key}.stl`, `3d-print/${key}.3mf`, 'PETG, 100 % fyll', g, Math.round(g * qty), p.note]);
  }
  add('3d-print.csv', csv([
    ['Del', 'Antall', 'STL', '3MF', 'Materiale', 'Vekt per stk (g)', 'Vekt totalt (g)', 'Merknad'],
    ...printRows,
  ]));

  add('deleliste.csv', partListCsv(design));

  // ---------------------------------------------------------------- Monteringsanvisning
  const unique = new Map<string, ModuleInstance[]>();
  for (const m of design.modules) {
    const k = m.type + JSON.stringify(m.params);
    unique.set(k, [...(unique.get(k) ?? []), m]);
  }
  const overview = images.overview ?? null;
  const plastImg = images.plast ?? null;
  let sections = '';
  for (const mods of unique.values()) {
    const m = mods[0];
    const t = LIBRARY[m.type];
    const label = labels.get(m.id)!;
    const f = t.footprint(m.params);
    const img = images.module?.(label) ?? null;
    const rows = mdf.filter((r) => r.module === label);
    const hw = t.hardware(m.params).filter((h) => h.qty > 0);
    sections += `
  <section class="module">
    <h2>${esc(t.name)} <span>${mods.map((x) => labels.get(x.id)).join(', ')}</span></h2>
    <p class="dims">${Math.round(f.w)} × ${Math.round(f.d)} × ${Math.round(f.h)} mm · ${mods.length} stk</p>
    <div class="cols">
      ${img ? `<img src="${img}" alt="Eksplodert ${esc(t.name)}">` : ''}
      <div>
        <h3>Deler per ${t.name.toLowerCase()}</h3>
        <table><tr><th>ID</th><th>Del</th><th class="r">Mål</th><th class="r">Ant.</th></tr>
        ${rows.map((r) => `<tr><td>${r.id.replace(label + '-', '')}</td><td>${esc(r.part)}</td><td class="r">${r.l}×${r.w}×${r.t}</td><td class="r">${r.qty}</td></tr>`).join('')}
        </table>
        <h3>Beslag per ${t.name.toLowerCase()}</h3>
        <table>${hw.map((h) => `<tr><td>${esc(h.name)}</td><td class="r">${h.qty}</td></tr>`).join('')}</table>
      </div>
    </div>
    <h3>Montering</h3>
    <ol>${(STEPS[m.type] ?? []).map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
  </section>`;
  }
  const totalArea = summary.reduce((a, s) => a + s.area, 0);
  const html = `<!doctype html><html lang="no"><head><meta charset="utf-8"><title>Monteringsanvisning – ${esc(design.room.name)}</title>
<style>
@page { size: A4; margin: 16mm 14mm; }
body { font-family: "Segoe UI", Inter, sans-serif; color: #222; font-size: 10.5pt; line-height: 1.45; }
h1 { font-size: 22pt; margin: 0 0 2mm; font-weight: 600; }
h2 { font-size: 15pt; margin: 0 0 1mm; font-weight: 600; } h2 span { color: #2f6f62; font-size: 11pt; font-weight: 500; margin-left: 6px; }
h3 { font-size: 9pt; text-transform: uppercase; letter-spacing: .06em; color: #777; margin: 4mm 0 1.5mm; }
.dims { color: #555; margin: 0 0 3mm; }
.module { page-break-before: always; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; align-items: start; }
img { width: 100%; border-radius: 4px; background: #2e3440; }
.module img { height: 85mm; object-fit: cover; }
table { border-collapse: collapse; width: 100%; font-size: 9.5pt; }
td, th { padding: 0.7mm 1.5mm; border-bottom: 1px solid #e5e2dc; text-align: left; } th { color: #777; font-weight: 500; }
.r { text-align: right; white-space: nowrap; }
ol { padding-left: 6mm; margin: 0; } li { margin-bottom: 1.2mm; }
.facts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; margin: 5mm 0; }
.facts div { background: #f4f2ee; padding: 3mm; border-radius: 3px; } .facts b { display: block; font-size: 15pt; }
.note { background: #fdf4d8; padding: 3mm 4mm; border-radius: 3px; }
</style></head><body>
<h1>${esc(design.room.name)}</h1>
<p class="dims">Monteringsanvisning · ${design.room.width} × ${design.room.depth} mm · ${design.modules.length} moduler</p>
<div class="facts">
  <div><b>${mdf.reduce((a, r) => a + r.qty, 0)}</b>MDF-deler</div>
  <div><b>${(Math.round(totalArea * 10) / 10).toLocaleString('nb-NO')} m²</b>MDF</div>
  <div><b>${[...print.values()].reduce((a, b) => a + b, 0)}</b>3D-printede deler</div>
  <div><b>${[...buy.values()].reduce((a, b) => a + b, 0)}</b>skruer og beslag</div>
</div>
${overview ? `<img src="${overview}" alt="Oversikt">` : ''}
<h3>Verktøy</h3>
<p>Drill med bits for konfirmatskruer (unbrako/torx), Ø2,5-bor, loddebolt for gjengeinnsatser, vater og tommestokk.</p>
<p class="note">Del-ID-en står på hver plate i DXF-filene og i delelista. Sorter platene per modul før du begynner.</p>
<h3>Plastdeler (3D-print)</h3>
<div class="cols">
  ${plastImg ? `<img src="${plastImg}" alt="Plastdeler">` : ''}
  <table><tr><th>Del</th><th class="r">Antall</th></tr>
  ${[...print].map(([k, q]) => `<tr><td>${PRINT_PARTS[k].name}<br><small>${esc(PRINT_PARTS[k].note)}</small></td><td class="r">${q}</td></tr>`).join('')}</table>
</div>
${sections}
</body></html>`;
  add('montering.html', html);

  // ---------------------------------------------------------------- Lesmeg
  const montering = opts.pdf
    ? '  montering.pdf        oversikt, plastdeler og én side per modultype med eksplodert tegning og steg'
    : '  montering.html       oversikt, plastdeler og én side per modultype med steg.\n                       Åpne i nettleseren og skriv ut som PDF.';
  add('LESMEG.txt', `Bestillingspakke: ${design.room.name}
${'='.repeat(20 + design.room.name.length)}

MDF (CNC / platetilskjæring)
  dxf/                 ${mdf.length} DXF-filer, én per unik plate. Lag:
                         KONTUR            ytterkant
                         GJENNOM_D<d>      gjennomgående hull
                         S1_D<d>_Z<dybde>  blindhull fra side 1 (siden i tegningen)
                         S2_D<d>_Z<dybde>  blindhull fra side 2 (baksiden), sett gjennom platen
                         KANT_D<d>_Z<dybde> horisontal boring i kanten, midt i tykkelsen
                         TEKST             del-ID, mål og antall
  mdf-bestilling.csv   alle deler med mål, antall og hull
  mdf-sammendrag.csv   ${summary.map((s) => `${s.t} mm: ${Math.round(s.area * 100) / 100} m²`).join(', ')}

3D-print
  3d-print/            STL og 3MF
  3d-print.csv         antall, materiale og vekt (${printRows.reduce((a, r) => a + Number(r[6]), 0)} g PETG totalt)

Kjøpes
  beslag-kjop.csv      skruer, hengsler, ben og innsatser

Montering
${montering}
${opts.model ? '\nModell\n  modell/              STEP for CAD/CAM og SolidCraft-fil\n' : ''}
Alle mål i mm.
`);

  return { slug: packageSlug(design), files, print: [...print.keys()], mdf, html };
}
