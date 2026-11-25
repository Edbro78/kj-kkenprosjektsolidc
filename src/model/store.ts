import { useCallback, useEffect, useRef, useState } from 'react';
import { sanitizeParams } from '../library';
import type { Design } from './types';
import { sampleDesign } from './sample';

const KEY = 'romplanlegger.design.v1';
const LIMIT = 100;

export function normalize(d: Design): Design {
  return {
    ...d,
    schema: 'design/1',
    room: { ...d.room, schema: 'rom/1', openings: d.room.openings ?? [] },
    modules: (d.modules ?? []).map((m) => ({ ...m, params: sanitizeParams(m.type, m.params ?? {}) })),
  };
}

function load(): Design {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch { /* tom eller ugyldig lagring */ }
  return sampleDesign();
}

interface Hist { past: Design[]; present: Design; future: Design[] }

export type Updater = (d: Design) => Design;
export interface SetOptions {
  /** false = ingen ny angre-steg (brukes under dra). */
  commit?: boolean;
  /** Endringer med samme nøkkel innen ett sekund slås sammen til ett angre-steg. */
  coalesce?: string;
}

/** Designtilstand med angre/gjør om og autolagring. */
export function useDesign() {
  const [h, setH] = useState<Hist>(() => ({ past: [], present: load(), future: [] }));
  const last = useRef<{ key?: string; t: number }>({ t: 0 });

  const set = useCallback((fn: Updater, opts: SetOptions = {}) => {
    setH((s) => {
      const next = fn(s.present);
      if (next === s.present) return s;
      const now = Date.now();
      const merge =
        opts.commit === false ||
        (opts.coalesce && last.current.key === opts.coalesce && now - last.current.t < 1000);
      last.current = { key: opts.coalesce, t: now };
      if (merge) return { ...s, present: next };
      return { past: [...s.past, s.present].slice(-LIMIT), present: next, future: [] };
    });
  }, []);

  /** Legger nåværende tilstand på angre-stakken (før et dra starter). */
  const checkpoint = useCallback(() => {
    last.current = { t: 0 };
    setH((s) => ({ past: [...s.past, s.present].slice(-LIMIT), present: s.present, future: [] }));
  }, []);

  const undo = useCallback(() => setH((s) => s.past.length
    ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] }
    : s), []);
  const redo = useCallback(() => setH((s) => s.future.length
    ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) }
    : s), []);

  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(h.present)); } catch { /* lagring utilgjengelig */ }
    }, 300);
    return () => clearTimeout(t);
  }, [h.present]);

  return {
    design: h.present, set, checkpoint, undo, redo,
    canUndo: h.past.length > 0, canRedo: h.future.length > 0,
  };
}
