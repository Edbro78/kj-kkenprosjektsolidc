import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Plan2D from './components/Plan2D';
import Preview3D from './components/Preview3D';
import Sidebar from './components/Sidebar';
import Inspector from './components/Inspector';
import PartsTable from './components/PartsTable';
import { defaultParams, LIBRARY } from './library';
import { fillWall, snap, uid, validate, WALL_NAME } from './model/geometry';
import { download, moduleLabels, partList, partListCsv } from './model/export';
import { downloadPackage, printMontering } from './model/bestillingWeb';
import { normalize, useDesign } from './model/store';
import { emptyRoom, sampleDesign } from './model/sample';
import type { Design, ModuleInstance, ModuleType, Rotation, WallId } from './model/types';

type View = 'split' | 'plan' | '3d' | 'parts';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9æøå]+/g, '-').replace(/^-|-$/g, '') || 'rom';

export default function App() {
  const { design, set, checkpoint, undo, redo, canUndo, canRedo } = useDesign();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<View>('split');
  const [snapOn, setSnapOn] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [packing, setPacking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const labels = useMemo(() => moduleLabels(design.modules), [design.modules]);
  const warnings = useMemo(() => validate(design), [design]);
  const parts = useMemo(() => partList(design), [design]);
  const selected = design.modules.find((m) => m.id === selectedId) ?? null;

  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const flash = (msg: string, ms = 2600) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    if (ms > 0) toastTimer.current = setTimeout(() => setToast(null), ms);
  };

  // Lagrer rommet i prosjektet (rom/), tegner det med SolidCraft og åpner det i SolidCraft-vinduet.
  // Krever at appen kjører med `npm run dev` (endepunktet ligger i vite.config.ts).
  const [building, setBuilding] = useState(false);
  const openInSolidCraft = async () => {
    if (!design.modules.length) { flash('Legg inn minst én modul først'); return; }
    if (warnings.some((w) => w.level === 'error'))
      flash('Obs: planen har røde varsler. Tegner likevel …', 0);
    else flash('Tegner rommet i SolidCraft … (ca. 10 s per modul)', 0);
    setBuilding(true);
    try {
      const res = await fetch('/api/solidcraft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(design),
      }).catch(() => null);
      if (!res) throw new Error('knappen virker bare når appen kjører med «npm run dev». Fra index.html: lagre Design-JSON og kjør «npm run tegn -- <fil>».');
      const r = await res.json().catch(() => null);
      if (!r) throw new Error('fant ikke SolidCraft-tjenesten. Start appen med «npm run dev».');
      if (!res.ok && !r.result) throw new Error(r.error ?? 'ukjent feil');
      const n = r.result?.files?.length ?? 0;
      const where = `bibliotek › Rom › ${design.room.name}`;
      flash(!r.ok
        ? 'Tegnet, men noe avviker fra utregningen. Se terminalen.'
        : r.result?.opened === 'started'
          ? `Åpner SolidCraft med rommet. ${n - 1} eksploderte moduler ligger i ${where}.`
          : `Klart: rommet og ${n - 1} eksploderte moduler ligger i SolidCraft under ${where}. Dobbeltklikk for å åpne (↻ oppdaterer panelet).`, 10000);
    } catch (e) {
      flash(`Kunne ikke tegne i SolidCraft: ${e instanceof Error ? e.message : e}`, 7000);
    } finally {
      setBuilding(false);
    }
  };

  const orderPackage = async () => {
    if (!design.modules.length) { flash('Legg inn minst én modul først'); return; }
    setPacking(true);
    try {
      const r = await downloadPackage(design);
      flash(r.missing.length
        ? `Lastet ned ${r.filename}, men mangler ${r.missing.join(', ')}`
        : `Lastet ned ${r.filename} (${r.files} filer)`);
    } catch (e) {
      flash(`Kunne ikke lage bestillingspakken: ${e instanceof Error ? e.message : e}`);
    } finally {
      setPacking(false);
    }
  };

  const printAssembly = () => {
    if (!printMontering(design)) flash('Nettleseren blokkerte vinduet. Tillat sprettoppvinduer og prøv igjen.');
  };

  const addModule = useCallback((type: ModuleType, x?: number, y?: number) => {
    const id = uid();
    set((d) => {
      const m: ModuleInstance = {
        id, type, rotation: 0, params: defaultParams(type),
        x: x ?? d.room.width / 2, y: y ?? d.room.depth / 2,
      };
      return { ...d, modules: [...d.modules, { ...m, ...snap(d, m, m.x, m.y) }] };
    });
    setSelectedId(id);
  }, [set]);

  const rotate = useCallback(() => {
    if (!selectedId) return;
    set((d) => ({
      ...d,
      modules: d.modules.map((m) => {
        if (m.id !== selectedId) return m;
        const rotation = ((m.rotation + 90) % 360) as Rotation;
        return { ...m, rotation };
      }),
    }));
  }, [selectedId, set]);

  const duplicate = useCallback(() => {
    if (!selected) return;
    const id = uid();
    set((d) => {
      const copy = { ...selected, id, params: { ...selected.params } };
      const f = LIBRARY[copy.type].footprint(copy.params);
      // Legg kopien ved siden av originalen, langs veggen
      const step = f.w;
      const dx = selected.rotation === 0 || selected.rotation === 180 ? step : 0;
      const dy = selected.rotation === 90 || selected.rotation === 270 ? step : 0;
      const placed = { ...copy, ...snap(d, copy, copy.x + dx, copy.y + dy) };
      return { ...d, modules: [...d.modules, placed] };
    });
    setSelectedId(id);
  }, [selected, set]);

  const remove = useCallback(() => {
    if (!selectedId) return;
    set((d) => ({ ...d, modules: d.modules.filter((m) => m.id !== selectedId) }));
    setSelectedId(null);
  }, [selectedId, set]);

  const fill = (wall: WallId, type: ModuleType) => {
    const added = fillWall(design, wall, type);
    if (!added.length) {
      flash(`Ingen ledig plass langs ${WALL_NAME[wall].toLowerCase()}veggen`);
      return;
    }
    set((d) => ({ ...d, modules: [...d.modules, ...added] }));
    const widths = [...new Set(added.map((m) => m.params.bredde))].join(' / ');
    flash(`La til ${added.length} × ${LIBRARY[type].name.toLowerCase()} (${widths} mm)`);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') remove();
      else if (e.key.toLowerCase() === 'r') rotate();
      else if (e.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, duplicate, remove, rotate]);

  const replace = (d: Design) => { set(() => normalize(d)); setSelectedId(null); };

  const openFile = async (file: File) => {
    try {
      const json = JSON.parse(await file.text());
      if (json.schema === 'design/1') replace(json);
      else if (json.schema === 'rom/1') replace({ ...design, room: json });
      else throw new Error('ukjent format');
      flash(`Åpnet ${file.name}`);
    } catch {
      flash('Kunne ikke lese fila. Forventet design-JSON eller rom-JSON.');
    }
  };

  const name = slug(design.room.name);

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo">▦</span>
          <strong>Romplanlegger</strong>
          <span className="muted small">Fase 1</span>
        </div>
        <div className="tools">
          <button className="btn ghost" onClick={() => replace({ schema: 'design/1', room: emptyRoom(), modules: [] })}>Nytt rom</button>
          <button className="btn ghost" onClick={() => replace(sampleDesign())}>Eksempel</button>
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>Åpne…</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) openFile(f); e.target.value = ''; }} />
          <span className="sep" />
          <button className="btn ghost" disabled={!canUndo} onClick={undo} title="Angre (Ctrl+Z)">↶</button>
          <button className="btn ghost" disabled={!canRedo} onClick={redo} title="Gjør om (Ctrl+Y)">↷</button>
          <label className="toggle" title="Fest moduler mot vegger og hverandre">
            <input type="checkbox" checked={snapOn} onChange={(e) => setSnapOn(e.target.checked)} /> Snap
          </label>
          <span className="sep" />
          <div className="seg">
            {(['plan', 'split', '3d', 'parts'] as View[]).map((v) => (
              <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
                {v === 'plan' ? '2D' : v === 'split' ? '2D + 3D' : v === '3d' ? '3D' : 'Deleliste'}
              </button>
            ))}
          </div>
          <span className="sep" />
          <button className="btn" onClick={() => download(`${name}.rom.json`, JSON.stringify(design.room, null, 2), 'application/json')}>Rom-JSON</button>
          <button className="btn" onClick={() => download(`${name}.design.json`, JSON.stringify(design, null, 2), 'application/json')}>Design-JSON</button>
          <button className="btn" onClick={openInSolidCraft} disabled={building}
            title="Lagrer rommet i prosjektmappen, tegner det med plater, hull og eksploderte moduler, og åpner det i SolidCraft">
            {building ? 'Tegner…' : 'Åpne i SolidCraft'}
          </button>
          <button className="btn" onClick={() => download(`${name}.deleliste.csv`, partListCsv(design), 'text/csv;charset=utf-8')}>Deleliste CSV</button>
          <button className="btn primary" disabled={packing} onClick={orderPackage}
            title="ZIP med DXF per plate, bestillingslister, beslag, 3D-printfiler og monteringsanvisning">
            {packing ? 'Pakker…' : 'Bestillingspakke'}
          </button>
        </div>
      </header>

      <main className="body">
        <Sidebar design={design} set={set} onAdd={(t) => addModule(t)} onFill={fill} />
        <div className={`stage view-${view}`}>
          {view === 'parts' ? (
            <PartsTable rows={parts} onPrint={printAssembly}
              onExport={() => download(`${name}.deleliste.csv`, partListCsv(design), 'text/csv;charset=utf-8')} />
          ) : (
            <>
              {view !== '3d' && (
                <Plan2D
                  design={design} labels={labels} warnings={warnings} selectedId={selectedId} snapOn={snapOn}
                  onSelect={setSelectedId} set={set} checkpoint={checkpoint}
                  onDropModule={(t, x, y) => addModule(t, x, y)}
                />
              )}
              {view !== 'plan' && <Preview3D design={design} selectedId={selectedId} onSelect={setSelectedId} />}
            </>
          )}
        </div>
        <Inspector
          design={design} labels={labels} warnings={warnings} parts={parts} selected={selected}
          set={set} onSelect={setSelectedId} onRotate={rotate} onDuplicate={duplicate} onDelete={remove}
        />
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
