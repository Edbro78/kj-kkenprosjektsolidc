import { LIBRARY, sanitizeParams } from '../library';
import { footprintOf, type Warning } from '../model/geometry';
import { totals, type PartRow } from '../model/export';
import type { Design, ModuleInstance, ParamValue, Rotation } from '../model/types';
import type { SetOptions, Updater } from '../model/store';
import { NumberField, RangeField } from './Fields';

interface Props {
  design: Design;
  labels: Map<string, string>;
  warnings: Warning[];
  parts: PartRow[];
  selected: ModuleInstance | null;
  set(fn: Updater, opts?: SetOptions): void;
  onSelect(id: string | null): void;
  onRotate(): void;
  onDuplicate(): void;
  onDelete(): void;
}

export default function Inspector(p: Props) {
  if (!p.selected) return <Overview {...p} />;
  const m = p.selected;
  const t = LIBRARY[m.type];
  const f = footprintOf(m);
  const own = p.warnings.filter((w) => w.moduleId === m.id);

  const setParam = (key: string, v: ParamValue) =>
    p.set((d) => ({
      ...d,
      modules: d.modules.map((x) => x.id === m.id ? { ...x, params: sanitizeParams(x.type, { ...x.params, [key]: v }) } : x),
    }), { coalesce: m.id + key });

  const setPos = (patch: Partial<ModuleInstance>) =>
    p.set((d) => ({ ...d, modules: d.modules.map((x) => (x.id === m.id ? { ...x, ...patch } : x)) }),
      { coalesce: m.id + Object.keys(patch).join() });

  return (
    <aside className="inspector">
      <section>
        <div className="insp-head">
          <span className="tag">{p.labels.get(m.id)}</span>
          <h2>{t.name}</h2>
        </div>
        <p className="muted small">{t.description}</p>
        <p className="dims">{Math.round(f.w)} × {Math.round(f.d)} × {Math.round(f.h)} mm</p>
        {own.map((w, i) => (
          <div key={i} className={`alert ${w.level}`}>{w.text}</div>
        ))}
      </section>

      <section>
        <h3>Mål og utførelse</h3>
        {t.params.map((s) => {
          const v = m.params[s.key];
          if (s.key === 'benkTykkelse' && !m.params.benkeplate) return null;
          if (s.key === 'ryggHoyde' && !m.params.rygg) return null;
          if (s.kind === 'number')
            return (
              <RangeField key={s.key} label={s.label} value={Number(v)} min={s.min!} max={s.max!}
                step={s.step} unit={s.unit} onChange={(x) => setParam(s.key, x)} />
            );
          if (s.kind === 'bool')
            return (
              <label key={s.key} className="check">
                <input type="checkbox" checked={Boolean(v)} onChange={(e) => setParam(s.key, e.target.checked)} />
                <span>{s.label}</span>
              </label>
            );
          return (
            <label key={s.key} className="field">
              <span>{s.label}</span>
              <select value={String(v)} onChange={(e) => setParam(s.key, e.target.value)}>
                {s.options!.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
              </select>
            </label>
          );
        })}
      </section>

      <section>
        <h3>Plassering</h3>
        <div className="grid2">
          <NumberField label="X (senter)" unit="mm" value={m.x} onChange={(x) => setPos({ x })} />
          <NumberField label="Y (senter)" unit="mm" value={m.y} onChange={(y) => setPos({ y })} />
        </div>
        <div className="seg">
          {([0, 90, 180, 270] as Rotation[]).map((r) => (
            <button key={r} className={m.rotation === r ? 'on' : ''} onClick={() => setPos({ rotation: r })}>
              {r === 0 ? 'Rygg N' : r === 90 ? 'Rygg Ø' : r === 180 ? 'Rygg S' : 'Rygg V'}
            </button>
          ))}
        </div>
        <div className="row">
          <button className="btn" onClick={p.onRotate}>↻ Roter</button>
          <button className="btn" onClick={p.onDuplicate}>Dupliser</button>
          <button className="btn danger" onClick={p.onDelete}>Slett</button>
        </div>
      </section>

      <section>
        <h3>Deler i modulen</h3>
        <table className="mini">
          <tbody>
            {p.parts.filter((r) => r.module === p.labels.get(m.id)).map((r) => (
              <tr key={r.id}>
                <td>{r.qty}×</td>
                <td>{r.part}</td>
                <td className="r">{r.material === 'Beslag' ? '' : `${r.l}×${r.w}×${r.t}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </aside>
  );
}

function Overview({ design, warnings, labels, parts, onSelect }: Props) {
  const tot = totals(parts);
  return (
    <aside className="inspector">
      <section>
        <h2>{design.room.name}</h2>
        <p className="dims">{design.room.width} × {design.room.depth} mm · {((design.room.width * design.room.depth) / 1e6).toFixed(1)} m²</p>
        <p className="muted small">Velg en modul i planen for å endre mål og utførelse.</p>
      </section>
      <section>
        <h3>Sammendrag</h3>
        <div className="stats">
          <div><b>{design.modules.length}</b><span>moduler</span></div>
          <div><b>{tot.panels}</b><span>plater</span></div>
          <div><b>{tot.areaM2.toLocaleString('nb-NO')}</b><span>m² MDF</span></div>
        </div>
      </section>
      <section>
        <h3>Kontroll</h3>
        {warnings.length === 0 && <div className="alert ok">Ingen kollisjoner eller varsler.</div>}
        {warnings.map((w, i) => (
          <button key={i} className={`alert ${w.level} clickable`} onClick={() => onSelect(w.moduleId)}>
            <b>{labels.get(w.moduleId)}</b> {w.text}
          </button>
        ))}
      </section>
      <section>
        <h3>Beslag totalt</h3>
        <table className="mini">
          <tbody>
            {[...tot.hardware].map(([name, qty]) => (
              <tr key={name}><td>{qty}×</td><td>{name}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </aside>
  );
}
