import { useState } from 'react';
import { TEMPLATES } from '../library';
import { uid, wallLength, WALL_NAME } from '../model/geometry';
import type { Design, ModuleType, Opening, WallId } from '../model/types';
import type { SetOptions, Updater } from '../model/store';
import { NumberField } from './Fields';

interface Props {
  design: Design;
  set(fn: Updater, opts?: SetOptions): void;
  onAdd(type: ModuleType): void;
  onFill(wall: WallId, type: ModuleType): void;
}

const WALLS: WallId[] = ['N', 'E', 'S', 'W'];

export default function Sidebar({ design, set, onAdd, onFill }: Props) {
  const { room } = design;
  const [fillWall, setFillWall] = useState<WallId>('E');
  const [fillType, setFillType] = useState<ModuleType>('underskap');

  const setRoom = (patch: Partial<typeof room>, key: string) =>
    set((d) => ({ ...d, room: { ...d.room, ...patch } }), { coalesce: 'room-' + key });

  const setOpening = (id: string, patch: Partial<Opening>) =>
    set((d) => ({
      ...d,
      room: { ...d.room, openings: d.room.openings.map((o) => (o.id === id ? { ...o, ...patch } : o)) },
    }), { coalesce: 'op-' + id + Object.keys(patch).join() });

  const addOpening = (kind: Opening['kind']) =>
    set((d) => ({
      ...d,
      room: {
        ...d.room,
        openings: [
          ...d.room.openings,
          kind === 'door'
            ? { id: uid(), kind, wall: 'S', offset: 200, width: 900, height: 2100, hinge: 'start' }
            : { id: uid(), kind, wall: 'N', offset: 200, width: 1200, height: 1200, sill: 900 },
        ],
      },
    }));

  const removeOpening = (id: string) =>
    set((d) => ({ ...d, room: { ...d.room, openings: d.room.openings.filter((o) => o.id !== id) } }));

  return (
    <aside className="sidebar">
      <section>
        <h3>Moduler</h3>
        <p className="muted small">Dra inn i planen, eller klikk for å legge til.</p>
        <div className="palette">
          {TEMPLATES.map((t) => (
            <button
              key={t.type}
              className="card"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/module-type', t.type);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => onAdd(t.type)}
              title={t.description}
            >
              <ModuleIcon type={t.type} />
              <span>{t.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>Fyll vegg</h3>
        <p className="muted small">Fyller ledig plass langs veggen med jevne moduler, utenom dører og vinduer.</p>
        <div className="row">
          <select value={fillWall} onChange={(e) => setFillWall(e.target.value as WallId)}>
            {WALLS.map((w) => <option key={w} value={w}>{WALL_NAME[w]}</option>)}
          </select>
          <select value={fillType} onChange={(e) => setFillType(e.target.value as ModuleType)}>
            {TEMPLATES.map((t) => <option key={t.type} value={t.type}>{t.name}</option>)}
          </select>
        </div>
        <button className="btn wide" onClick={() => onFill(fillWall, fillType)}>Fyll {WALL_NAME[fillWall].toLowerCase()}veggen</button>
      </section>

      <section>
        <h3>Rom</h3>
        <label className="field">
          <span>Navn</span>
          <input value={room.name} onChange={(e) => setRoom({ name: e.target.value }, 'name')} />
        </label>
        <NumberField label="Bredde (øst–vest)" unit="mm" value={room.width} min={500} max={20000} onChange={(v) => setRoom({ width: v }, 'w')} />
        <NumberField label="Dybde (nord–sør)" unit="mm" value={room.depth} min={500} max={20000} onChange={(v) => setRoom({ depth: v }, 'd')} />
        <NumberField label="Takhøyde" unit="mm" value={room.height} min={1800} max={6000} onChange={(v) => setRoom({ height: v }, 'h')} />
        <NumberField label="Veggtykkelse" unit="mm" value={room.wallThickness} min={0} max={500} onChange={(v) => setRoom({ wallThickness: v }, 'wt')} />
      </section>

      <section>
        <h3>Dører og vinduer</h3>
        {room.openings.length === 0 && <p className="muted small">Ingen ennå.</p>}
        {room.openings.map((o) => (
          <div key={o.id} className="opening">
            <div className="opening-head">
              <strong>{o.kind === 'door' ? 'Dør' : 'Vindu'}</strong>
              <select value={o.wall} onChange={(e) => setOpening(o.id, { wall: e.target.value as WallId })}>
                {WALLS.map((w) => <option key={w} value={w}>{WALL_NAME[w]}vegg</option>)}
              </select>
              <button className="icon" onClick={() => removeOpening(o.id)} title="Fjern">×</button>
            </div>
            <div className="grid2">
              <NumberField label="Fra hjørne" unit="mm" value={o.offset} min={0}
                max={Math.max(0, wallLength(room, o.wall) - o.width)} onChange={(v) => setOpening(o.id, { offset: v })} />
              <NumberField label="Bredde" unit="mm" value={o.width} min={300} max={wallLength(room, o.wall)}
                onChange={(v) => setOpening(o.id, { width: v })} />
              <NumberField label="Høyde" unit="mm" value={o.height} min={300} max={room.height}
                onChange={(v) => setOpening(o.id, { height: v })} />
              {o.kind === 'window' ? (
                <NumberField label="Brystning" unit="mm" value={o.sill ?? 900} min={0} max={room.height}
                  onChange={(v) => setOpening(o.id, { sill: v })} />
              ) : (
                <label className="field">
                  <span>Hengsel</span>
                  <select value={o.hinge ?? 'start'} onChange={(e) => setOpening(o.id, { hinge: e.target.value as 'start' | 'end' })}>
                    <option value="start">{o.wall === 'N' || o.wall === 'S' ? 'Vest' : 'Nord'}</option>
                    <option value="end">{o.wall === 'N' || o.wall === 'S' ? 'Øst' : 'Sør'}</option>
                  </select>
                </label>
              )}
            </div>
          </div>
        ))}
        <div className="row">
          <button className="btn" onClick={() => addOpening('door')}>+ Dør</button>
          <button className="btn" onClick={() => addOpening('window')}>+ Vindu</button>
        </div>
      </section>
    </aside>
  );
}

function ModuleIcon({ type }: { type: ModuleType }) {
  const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 };
  return (
    <svg viewBox="0 0 40 40" width="36" height="36" aria-hidden>
      {type === 'hylle' && (
        <g {...s}><rect x="9" y="4" width="22" height="32" /><path d="M9 12h22M9 20h22M9 28h22" /></g>
      )}
      {type === 'underskap' && (
        <g {...s}><rect x="5" y="12" width="30" height="3" /><rect x="7" y="15" width="26" height="18" /><path d="M20 15v18M17 22v3M23 22v3M9 33v3M31 33v3" /></g>
      )}
      {type === 'skrivebord' && (
        <g {...s}><rect x="3" y="12" width="34" height="3" /><path d="M6 15v20M34 15v20M6 22h28" /></g>
      )}
    </svg>
  );
}
