import type { Hardware, ModuleType, Panel, ParamSpec, ParamValue } from '../model/types';

export type Params = Record<string, ParamValue>;

export interface Footprint {
  w: number; // langs bredden (u)
  d: number; // dybde fra rygg til front (v)
  h: number; // total høyde
}

export interface Template {
  type: ModuleType;
  name: string;
  prefix: string; // for del-ID, f.eks. HY
  description: string;
  params: ParamSpec[];
  /** Ønsket bredde når en vegg fylles automatisk. */
  fillWidth: number;
  footprint(p: Params): Footprint;
  panels(p: Params): Panel[];
  hardware(p: Params): Hardware[];
}

export const COLORS: { value: string; label: string; hex: string }[] = [
  { value: 'hvit', label: 'Hvit', hex: '#f2f0eb' },
  { value: 'raa', label: 'Rå MDF', hex: '#c9a97c' },
  { value: 'salvie', label: 'Salvie', hex: '#a7b49b' },
  { value: 'antrasitt', label: 'Antrasitt', hex: '#4a4d50' },
  { value: 'eik', label: 'Eik-finér', hex: '#c79a62' },
];

export const colorHex = (v: ParamValue | undefined) =>
  COLORS.find((c) => c.value === v)?.hex ?? COLORS[0].hex;

const colorParam: ParamSpec = {
  key: 'farge',
  label: 'Farge',
  kind: 'select',
  options: COLORS.map((c) => ({ value: c.value, label: c.label })),
  default: 'hvit',
};

const thicknessParam = (def: number, opts = [16, 18, 19, 22, 25]): ParamSpec => ({
  key: 'tykkelse',
  label: 'Platetykkelse',
  kind: 'select',
  unit: 'mm',
  options: opts.map((t) => ({ value: t, label: `${t} mm` })),
  default: def,
});

const BACK_T = 6; // bakplate i 6 mm MDF
const n = (p: Params, k: string) => Number(p[k]);
const b = (p: Params, k: string) => Boolean(p[k]);

/** Antall konfirmatskruer i en skjøt, ca. én per 200 mm, minst 2. */
const confirmats = (len: number) => Math.max(2, Math.ceil(len / 200));
/** Skruer i bakplate rundt kanten, ca. hver 150 mm. */
const backScrews = (w: number, h: number) => Math.ceil((2 * (w + h)) / 150);

// ---------------------------------------------------------------- Hylle
const hylle: Template = {
  type: 'hylle',
  name: 'Hylle',
  prefix: 'HY',
  description: 'Åpen reol med justerbare hyller i 32 mm-system.',
  fillWidth: 800,
  params: [
    { key: 'bredde', label: 'Bredde', kind: 'number', min: 300, max: 1200, step: 10, unit: 'mm', default: 800 },
    { key: 'hoyde', label: 'Høyde', kind: 'number', min: 300, max: 2400, step: 10, unit: 'mm', default: 2000 },
    { key: 'dybde', label: 'Dybde', kind: 'number', min: 200, max: 450, step: 10, unit: 'mm', default: 350 },
    thicknessParam(18),
    { key: 'hyller', label: 'Antall hyller', kind: 'number', min: 0, max: 10, step: 1, default: 4 },
    { key: 'bakplate', label: 'Bakplate', kind: 'bool', default: true },
    colorParam,
  ],
  footprint: (p) => ({ w: n(p, 'bredde'), d: n(p, 'dybde'), h: n(p, 'hoyde') }),
  panels(p) {
    const W = n(p, 'bredde'), H = n(p, 'hoyde'), D = n(p, 'dybde'), T = n(p, 'tykkelse');
    const back = b(p, 'bakplate');
    const y0 = back ? BACK_T : 0;
    const cd = D - y0;
    const out: Panel[] = [
      { code: 'SIDE', name: 'Side', pos: [0, y0, 0], size: [T, cd, H], material: 'MDF', kind: 'carcass',
        note: '32 mm-hyllehull Ø5, 2 rader 37 mm fra kant. Ø5 konfirmathull topp/bunn' },
      { code: 'SIDE', name: 'Side', pos: [W - T, y0, 0], size: [T, cd, H], material: 'MDF', kind: 'carcass',
        note: '32 mm-hyllehull Ø5, 2 rader 37 mm fra kant. Ø5 konfirmathull topp/bunn' },
      { code: 'TOPP', name: 'Topp', pos: [T, y0, H - T], size: [W - 2 * T, cd, T], material: 'MDF', kind: 'carcass',
        note: 'Ø7 konfirmathull i begge ender' },
      { code: 'BUNN', name: 'Bunn', pos: [T, y0, 0], size: [W - 2 * T, cd, T], material: 'MDF', kind: 'carcass',
        note: 'Ø7 konfirmathull i begge ender' },
    ];
    const count = n(p, 'hyller');
    const inner = H - 2 * T;
    const gap = (inner - count * T) / (count + 1);
    for (let i = 0; i < count; i++) {
      out.push({
        code: 'HYLLE', name: 'Løs hylle',
        pos: [T + 1, y0, T + gap * (i + 1) + T * i],
        size: [W - 2 * T - 2, cd - 10, T], material: 'MDF', kind: 'shelf',
        note: '1 mm klaring per side, 10 mm tilbaketrukket',
      });
    }
    if (back) {
      out.push({ code: 'BAK', name: 'Bakplate', pos: [0, 0, 0], size: [W, BACK_T, H], material: 'MDF', kind: 'back',
        note: 'Skrus i bakkant' });
    }
    return out;
  },
  hardware(p) {
    const D = n(p, 'dybde'), W = n(p, 'bredde'), H = n(p, 'hoyde');
    const hw: Hardware[] = [
      { name: 'Konfirmatskrue 7×50', qty: 4 * confirmats(D) },
      { name: 'Hyllebærer Ø5 (3D-print, plast)', qty: 4 * n(p, 'hyller'), print: 'hyllebaerer' },
      { name: 'Veggfeste / tippsikring', qty: H > 1000 ? 2 : 1 },
    ];
    if (b(p, 'bakplate')) hw.push({ name: 'Sponplateskrue 3,5×16', qty: backScrews(W, H) });
    return hw;
  },
};

// ---------------------------------------------------------------- Underskap
const underskap: Template = {
  type: 'underskap',
  name: 'Underskap',
  prefix: 'UK',
  description: 'Kjøkken-/benkeskap med sokkel, dører og hyller.',
  fillWidth: 600,
  params: [
    { key: 'bredde', label: 'Bredde', kind: 'number', min: 300, max: 1200, step: 10, unit: 'mm', default: 600 },
    { key: 'hoyde', label: 'Høyde (uten benkeplate)', kind: 'number', min: 700, max: 920, step: 10, unit: 'mm', default: 870 },
    { key: 'dybde', label: 'Dybde (med dør)', kind: 'number', min: 450, max: 650, step: 10, unit: 'mm', default: 580 },
    thicknessParam(18, [16, 18, 19]),
    { key: 'sokkel', label: 'Sokkelhøyde', kind: 'number', min: 80, max: 150, step: 5, unit: 'mm', default: 100 },
    {
      key: 'dorer', label: 'Dører', kind: 'select', default: 1,
      options: [ { value: 0, label: 'Ingen' }, { value: 1, label: '1 dør' }, { value: 2, label: '2 dører' } ],
    },
    { key: 'hyller', label: 'Antall hyller', kind: 'number', min: 0, max: 3, step: 1, default: 1 },
    { key: 'benkeplate', label: 'Benkeplate', kind: 'bool', default: true },
    { key: 'benkTykkelse', label: 'Benkeplate tykkelse', kind: 'number', min: 19, max: 40, step: 1, unit: 'mm', default: 30 },
    colorParam,
  ],
  footprint(p) {
    const benk = b(p, 'benkeplate');
    return {
      w: n(p, 'bredde'),
      d: n(p, 'dybde') + (benk ? 20 : 0),
      h: n(p, 'hoyde') + (benk ? n(p, 'benkTykkelse') : 0),
    };
  },
  panels(p) {
    const W = n(p, 'bredde'), H = n(p, 'hoyde'), D = n(p, 'dybde'), T = n(p, 'tykkelse');
    const sok = n(p, 'sokkel');
    const doors = n(p, 'dorer');
    const cd = D - (doors > 0 ? T + 2 : 0); // korpusdybde inkl. bakplate
    const ch = H - sok; // korpushøyde
    const out: Panel[] = [
      { code: 'SIDE', name: 'Side', pos: [0, BACK_T, sok], size: [T, cd - BACK_T, ch], material: 'MDF', kind: 'carcass',
        note: 'Ø35 hengselkopp-plater, 32 mm-hyllehull Ø5' },
      { code: 'SIDE', name: 'Side', pos: [W - T, BACK_T, sok], size: [T, cd - BACK_T, ch], material: 'MDF', kind: 'carcass',
        note: 'Ø35 hengselkopp-plater, 32 mm-hyllehull Ø5' },
      { code: 'BUNN', name: 'Bunn', pos: [T, BACK_T, sok], size: [W - 2 * T, cd - BACK_T, T], material: 'MDF', kind: 'carcass',
        note: 'Ø7 konfirmathull i begge ender, Ø10 for justerbare ben' },
      { code: 'REKKE', name: 'Topprekke', pos: [T, cd - 100, H - T], size: [W - 2 * T, 100, T], material: 'MDF', kind: 'carcass',
        note: 'Front. Ø7 konfirmathull i begge ender' },
      { code: 'REKKE', name: 'Topprekke', pos: [T, BACK_T, H - T], size: [W - 2 * T, 100, T], material: 'MDF', kind: 'carcass',
        note: 'Bak. Ø7 konfirmathull i begge ender' },
      { code: 'BAK', name: 'Bakplate', pos: [0, 0, sok], size: [W, BACK_T, ch], material: 'MDF', kind: 'back',
        note: 'Skrus i bakkant' },
      { code: 'SOKKEL', name: 'Sokkelfront', pos: [0, cd - 50 - T, 0], size: [W, T, sok - 2], material: 'MDF', kind: 'plinth',
        note: 'Festes med sokkelklips, 50 mm tilbaketrukket' },
    ];
    const shelves = n(p, 'hyller');
    const inner = ch - 2 * T;
    const gap = (inner - shelves * T) / (shelves + 1);
    for (let i = 0; i < shelves; i++) {
      out.push({
        code: 'HYLLE', name: 'Løs hylle',
        pos: [T + 1, BACK_T, sok + T + gap * (i + 1) + T * i],
        size: [W - 2 * T - 2, cd - BACK_T - 20, T], material: 'MDF', kind: 'shelf',
        note: '1 mm klaring per side',
      });
    }
    if (doors > 0) {
      const dw = W / doors - 3;
      for (let i = 0; i < doors; i++) {
        out.push({
          code: 'DOR', name: 'Dør',
          pos: [(i * W) / doors + 1.5, cd + 2, sok + 1.5], size: [dw, T, ch - 3], material: 'MDF', kind: 'front',
          note: 'Ø35 hengselkopp 22 mm fra kant, 100 mm fra topp/bunn. 3 mm fuge',
        });
      }
    }
    if (b(p, 'benkeplate')) {
      const bt = n(p, 'benkTykkelse');
      out.push({ code: 'BENK', name: 'Benkeplate', pos: [0, 0, H], size: [W, D + 20, bt], material: 'MDF', kind: 'top',
        note: 'Fuktbestandig MDF, lakkert. Skrus fra undersiden gjennom rekker' });
    }
    return out;
  },
  hardware(p) {
    const W = n(p, 'bredde'), H = n(p, 'hoyde'), D = n(p, 'dybde'), sok = n(p, 'sokkel');
    const doors = n(p, 'dorer');
    const hinges = doors * (H - sok > 900 ? 3 : 2);
    const hw: Hardware[] = [
      { name: 'Konfirmatskrue 7×50', qty: 2 * confirmats(D) + 8 },
      { name: 'Justerbart skapben', qty: 4 },
      { name: 'Sokkelklips', qty: 2 },
      { name: 'Sponplateskrue 3,5×16', qty: backScrews(W, H - sok) },
    ];
    if (hinges) hw.push({ name: 'Hengsel Ø35 med demping', qty: hinges });
    if (doors) {
      hw.push({ name: 'Knott Ø30 (3D-print, plast)', qty: doors, print: 'knott' });
      hw.push({ name: 'Gjengeinnsats M4 (messing, for knott)', qty: doors });
      hw.push({ name: 'Maskinskrue M4×25 (knott)', qty: doors });
    }
    if (n(p, 'hyller')) hw.push({ name: 'Hyllebærer Ø5 (3D-print, plast)', qty: 4 * n(p, 'hyller'), print: 'hyllebaerer' });
    if (b(p, 'benkeplate')) hw.push({ name: 'Sponplateskrue 4×40 (benkeplate)', qty: 6 });
    return hw;
  },
};

// ---------------------------------------------------------------- Skrivebord
const skrivebord: Template = {
  type: 'skrivebord',
  name: 'Skrivebord',
  prefix: 'SB',
  description: 'Skrivebord med gavlsider og rygg for stivhet.',
  fillWidth: 1400,
  params: [
    { key: 'bredde', label: 'Bredde', kind: 'number', min: 800, max: 2400, step: 10, unit: 'mm', default: 1400 },
    { key: 'dybde', label: 'Dybde', kind: 'number', min: 500, max: 900, step: 10, unit: 'mm', default: 700 },
    { key: 'hoyde', label: 'Høyde', kind: 'number', min: 650, max: 800, step: 5, unit: 'mm', default: 740 },
    thicknessParam(25, [18, 19, 22, 25, 30]),
    { key: 'rygg', label: 'Rygg (stiver)', kind: 'bool', default: true },
    { key: 'ryggHoyde', label: 'Rygghøyde', kind: 'number', min: 150, max: 500, step: 10, unit: 'mm', default: 300 },
    colorParam,
  ],
  footprint: (p) => ({ w: n(p, 'bredde'), d: n(p, 'dybde'), h: n(p, 'hoyde') }),
  panels(p) {
    const W = n(p, 'bredde'), H = n(p, 'hoyde'), D = n(p, 'dybde'), T = n(p, 'tykkelse');
    const out: Panel[] = [
      { code: 'GAVL', name: 'Gavl', pos: [0, 0, 0], size: [T, D, H - T], material: 'MDF', kind: 'carcass',
        note: 'Ø7 konfirmathull for rygg, Ø10 for justerbare glidere' },
      { code: 'GAVL', name: 'Gavl', pos: [W - T, 0, 0], size: [T, D, H - T], material: 'MDF', kind: 'carcass',
        note: 'Ø7 konfirmathull for rygg, Ø10 for justerbare glidere' },
      { code: 'TOPP', name: 'Bordplate', pos: [0, 0, H - T], size: [W, D, T], material: 'MDF', kind: 'top',
        note: 'Festes med vinkelbeslag fra undersiden' },
    ];
    if (b(p, 'rygg')) {
      const rh = n(p, 'ryggHoyde');
      out.push({ code: 'RYGG', name: 'Rygg', pos: [T, 60, H - T - rh], size: [W - 2 * T, T, rh], material: 'MDF', kind: 'carcass',
        note: '60 mm fra bakkant. Ø7 konfirmathull i begge ender' });
    }
    return out;
  },
  hardware(p) {
    const hw: Hardware[] = [
      { name: 'Vinkelbeslag (3D-print, plast)', qty: 4, print: 'vinkelbeslag' },
      { name: 'Sponplateskrue 4×16', qty: 16 },
      { name: 'Justerbar glider', qty: 4 },
    ];
    if (b(p, 'rygg')) hw.push({ name: 'Konfirmatskrue 7×50', qty: 2 * confirmats(n(p, 'ryggHoyde')) });
    return hw;
  },
};

export const LIBRARY: Record<ModuleType, Template> = { hylle, underskap, skrivebord };
export const TEMPLATES: Template[] = [underskap, hylle, skrivebord];

export function defaultParams(type: ModuleType): Params {
  const p: Params = {};
  for (const s of LIBRARY[type].params) p[s.key] = s.default;
  return p;
}

/** Sørger for at alle parametere finnes og ligger innenfor grensene. */
export function sanitizeParams(type: ModuleType, params: Params): Params {
  const out: Params = { ...defaultParams(type), ...params };
  for (const s of LIBRARY[type].params) {
    if (s.kind === 'number') {
      let v = Number(out[s.key]);
      if (!Number.isFinite(v)) v = Number(s.default);
      if (s.min !== undefined) v = Math.max(s.min, v);
      if (s.max !== undefined) v = Math.min(s.max, v);
      out[s.key] = v;
    } else if (s.kind === 'bool') {
      out[s.key] = Boolean(out[s.key]);
    } else if (s.kind === 'select' && !s.options?.some((o) => o.value === out[s.key])) {
      // Tall fra <select> kommer som tekst
      const match = s.options?.find((o) => String(o.value) === String(out[s.key]));
      out[s.key] = match ? match.value : s.default;
    }
  }
  return out;
}
