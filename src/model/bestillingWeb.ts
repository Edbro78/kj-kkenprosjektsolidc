// Bestillingspakken i nettleseren: ZIP-nedlasting og utskrift av monteringsanvisningen.
// Innholdet kommer fra buildPackage (samme som CLI-en), plastdelfilene ligger i src/assets/plastdeler/.

import { strToU8, zipSync } from 'fflate';
import { buildPackage } from './bestilling.ts';
import type { Design } from './types.ts';

// Plastdelfilene bakes inn i appen (som data-URL i index.html), så pakken virker også når index.html åpnes direkte fra disken
const FILES = import.meta.glob('../assets/plastdeler/*', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const asset = (name: string) => FILES[`../assets/plastdeler/${name}`];

/** Bilde av 3D-visningen, hvis den vises (krever preserveDrawingBuffer på canvaset). */
function snapshot3d(): string | null {
  const canvas = document.querySelector<HTMLCanvasElement>('.preview canvas');
  if (!canvas || !canvas.width || !canvas.height) return null;
  try {
    // Et bilde tatt før 3D-visningen er tegnet er ensfarget: da er det bedre å droppe det
    const probe = document.createElement('canvas');
    probe.width = 32;
    probe.height = 20;
    const g = probe.getContext('2d')!;
    g.drawImage(canvas, 0, 0, 32, 20);
    const px = g.getImageData(0, 0, 32, 20).data;
    const colours = new Set<number>();
    for (let i = 0; i < px.length; i += 4) colours.add(((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4));
    if (colours.size < 4) return null;
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

const dataUrlBytes = (url: string) => {
  const bin = atob(url.slice(url.indexOf(',') + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

async function fetchBytes(name: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(asset(name));
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export interface DownloadResult { filename: string; files: number; missing: string[] }

/** Lager og laster ned <romnavn>-bestilling.zip. */
export async function downloadPackage(design: Design): Promise<DownloadResult> {
  const shot = snapshot3d();
  const plastPng = await fetchBytes('plastdeler.png');
  const pkg = buildPackage(design, {
    pdf: false,
    images: {
      overview: shot ? 'bilder/oversikt.png' : null,
      plast: plastPng ? 'bilder/plastdeler.png' : null,
    },
  });

  const zip: Record<string, Uint8Array> = {};
  for (const f of pkg.files) zip[f.path] = strToU8(f.content);
  if (shot) zip['bilder/oversikt.png'] = dataUrlBytes(shot);
  if (plastPng) zip['bilder/plastdeler.png'] = plastPng;
  zip['design.json'] = strToU8(JSON.stringify(design, null, 2));

  const missing: string[] = [];
  for (const key of pkg.print) {
    for (const ext of ['stl', '3mf']) {
      const bytes = await fetchBytes(`${key}.${ext}`);
      if (bytes) zip[`3d-print/${key}.${ext}`] = bytes;
      else missing.push(`${key}.${ext}`);
    }
  }

  const data = zipSync(zip, { level: 6, mtime: new Date() });
  const filename = `${pkg.slug}-bestilling.zip`;
  const url = URL.createObjectURL(new Blob([data], { type: 'application/zip' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return { filename, files: Object.keys(zip).length, missing };
}

/** Åpner monteringsanvisningen i et nytt vindu og starter utskrift (lagre som PDF der). */
export function printMontering(design: Design): boolean {
  const pkg = buildPackage(design, {
    images: { overview: snapshot3d(), plast: asset('plastdeler.png') },
  });
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(pkg.html);
  w.document.close();
  const go = () => setTimeout(() => { w.focus(); w.print(); }, 300);
  if (w.document.readyState === 'complete') go();
  else w.addEventListener('load', go);
  return true;
}
