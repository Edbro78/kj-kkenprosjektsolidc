import { LIBRARY, COLORS } from '../library/index.ts';
import type { Design, ModuleInstance, ModuleType, Panel } from './types';

export interface PartRow {
  id: string;
  module: string;
  part: string;
  material: string;
  t: number | '';
  l: number | '';
  w: number | '';
  qty: number;
  color: string;
  note: string;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Gir hver modul en lesbar merkelapp: UK-01, HY-02 osv. */
export function moduleLabels(modules: ModuleInstance[]): Map<string, string> {
  const counters: Partial<Record<ModuleType, number>> = {};
  const out = new Map<string, string>();
  for (const m of modules) {
    const c = (counters[m.type] = (counters[m.type] ?? 0) + 1);
    out.set(m.id, `${LIBRARY[m.type].prefix}-${String(c).padStart(2, '0')}`);
  }
  return out;
}

export interface IdentifiedPanel {
  panel: Panel;
  /** Del-ID som i delelisten, f.eks. UK-01-SIDE. Like plater deler ID. */
  partId: string;
  /** Løpenummer blant platene med samme del-ID (1, 2, ...). */
  instance: number;
  dims: { t: number; w: number; l: number };
}

/** Gir hver plate i en modul en del-ID. Like plater (samme kode, mål og materiale) får samme ID. */
export function identifyPanels(m: ModuleInstance, label: string): IdentifiedPanel[] {
  const keyToId = new Map<string, string>();
  const codeCount = new Map<string, number>();
  const seen = new Map<string, number>();
  return LIBRARY[m.type].panels(m.params).map((panel) => {
    const [t, w, l] = [...panel.size].sort((a, b) => a - b).map(r1);
    const key = `${panel.code}|${l}|${w}|${t}|${panel.material}`;
    let partId = keyToId.get(key);
    if (!partId) {
      const c = (codeCount.get(panel.code) ?? 0) + 1;
      codeCount.set(panel.code, c);
      partId = `${label}-${panel.code}${c > 1 ? '-' + c : ''}`;
      keyToId.set(key, partId);
    }
    const instance = (seen.get(partId) ?? 0) + 1;
    seen.set(partId, instance);
    return { panel, partId, instance, dims: { t, w, l } };
  });
}

export function partList(design: Design): PartRow[] {
  const labels = moduleLabels(design.modules);
  const rows: PartRow[] = [];
  for (const m of design.modules) {
    const t = LIBRARY[m.type];
    const label = labels.get(m.id)!;
    const color = COLORS.find((c) => c.value === m.params.farge)?.label ?? '';
    // Slå sammen like plater innen samme modul
    const groups = new Map<string, PartRow>();
    for (const { panel: p, partId, dims } of identifyPanels(m, label)) {
      const g = groups.get(partId);
      if (g) { g.qty++; continue; }
      groups.set(partId, {
        id: partId, module: label, part: p.name, material: p.material,
        t: dims.t, l: dims.l, w: dims.w, qty: 1, color, note: p.note ?? '',
      });
    }
    rows.push(...groups.values());
    t.hardware(m.params).forEach((h, i) => {
      if (h.qty <= 0) return;
      rows.push({
        id: `${label}-B${String(i + 1).padStart(2, '0')}`, module: label, part: h.name,
        material: 'Beslag', t: '', l: '', w: '', qty: h.qty, color: '', note: h.note ?? '',
      });
    });
  }
  return rows;
}

export interface Totals {
  panels: number;
  areaM2: number;
  hardware: Map<string, number>;
}

export function totals(rows: PartRow[]): Totals {
  let panels = 0, area = 0;
  const hardware = new Map<string, number>();
  for (const r of rows) {
    if (r.material === 'Beslag') {
      hardware.set(r.part, (hardware.get(r.part) ?? 0) + r.qty);
    } else {
      panels += r.qty;
      area += r.qty * (Number(r.l) * Number(r.w)) / 1e6;
    }
  }
  return { panels, areaM2: Math.round(area * 100) / 100, hardware };
}

/** CSV med semikolon og komma som desimaltegn, slik norsk Excel forventer. */
export function partListCsv(design: Design): string {
  const head = ['ID', 'Modul', 'Del', 'Materiale', 'Tykkelse (mm)', 'Lengde (mm)', 'Bredde (mm)', 'Antall', 'Farge', 'Merknad'];
  const fmt = (v: string | number) => {
    const s = typeof v === 'number' ? String(v).replace('.', ',') : v;
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [head.join(';')];
  for (const r of partList(design)) {
    lines.push([r.id, r.module, r.part, r.material, r.t, r.l, r.w, r.qty, r.color, r.note].map(fmt).join(';'));
  }
  return '﻿' + lines.join('\r\n');
}

export function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
