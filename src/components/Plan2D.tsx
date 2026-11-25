import { useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Group, Rect, Line, Text, Arc, Shape } from 'react-konva';
import type Konva from 'konva';
import { colorHex, LIBRARY } from '../library';
import { footprintOf, snap, type Warning } from '../model/geometry';
import type { Design, ModuleInstance, ModuleType, Opening, Room } from '../model/types';
import type { SetOptions, Updater } from '../model/store';

interface Props {
  design: Design;
  labels: Map<string, string>;
  warnings: Warning[];
  selectedId: string | null;
  snapOn: boolean;
  onSelect(id: string | null): void;
  set(fn: Updater, opts?: SetOptions): void;
  checkpoint(): void;
  onDropModule(type: ModuleType, x: number, y: number): void;
}

const PAD = 56;
const INK = '#2b2b2b';
const MUTED = '#8a8780';
const ACCENT = '#2f6f62';
const ERR = '#c2410c';
const WARN = '#ca8a04';

export default function Plan2D(p: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { room } = p.design;
  const wt = room.wallThickness;
  const scale = Math.max(0.01, Math.min(
    (size.w - 2 * PAD) / (room.width + 2 * wt),
    (size.h - 2 * PAD) / (room.depth + 2 * wt),
  ));
  const ox = (size.w - room.width * scale) / 2;
  const oy = (size.h - room.depth * scale) / 2;
  const px = (v: number) => v / scale; // skjermpiksler → mm

  const toMm = (sx: number, sy: number) => ({ x: (sx - ox) / scale, y: (sy - oy) / scale });

  const handleDrop = (e: React.DragEvent) => {
    const type = e.dataTransfer.getData('text/module-type') as ModuleType;
    if (!type || !LIBRARY[type]) return;
    e.preventDefault();
    const st = stageRef.current!;
    st.setPointersPositions(e);
    const pos = st.getPointerPosition();
    if (!pos) return;
    const mm = toMm(pos.x, pos.y);
    p.onDropModule(type, mm.x, mm.y);
  };

  const levelOf = useMemo(() => {
    const m = new Map<string, 'error' | 'warn'>();
    for (const w of p.warnings) if (m.get(w.moduleId) !== 'error') m.set(w.moduleId, w.level);
    return m;
  }, [p.warnings]);

  return (
    <div
      ref={wrap}
      className="plan"
      onDragOver={(e) => { if (e.dataTransfer.types.includes('text/module-type')) e.preventDefault(); }}
      onDrop={handleDrop}
    >
      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        onMouseDown={(e) => { if (e.target === e.target.getStage() || e.target.name() === 'floor') p.onSelect(null); }}
      >
        <Layer>
          <Group x={ox} y={oy} scaleX={scale} scaleY={scale}>
            <RoomShape room={room} px={px} />
            {room.openings.map((o) => <OpeningShape key={o.id} room={room} o={o} px={px} />)}
            {p.design.modules.map((m) => (
              <ModuleShape
                key={m.id}
                m={m}
                label={p.labels.get(m.id) ?? ''}
                level={levelOf.get(m.id)}
                selected={m.id === p.selectedId}
                px={px}
                onSelect={() => p.onSelect(m.id)}
                onDragStart={() => { p.checkpoint(); p.onSelect(m.id); }}
                onDragMove={(node, free) => {
                  const pos = free || !p.snapOn
                    ? { x: Math.round(node.x()), y: Math.round(node.y()), rotation: m.rotation }
                    : snap(p.design, m, node.x(), node.y());
                  node.position({ x: pos.x, y: pos.y });
                  node.rotation(pos.rotation);
                  p.set((d) => ({
                    ...d,
                    modules: d.modules.map((x) => (x.id === m.id ? { ...x, ...pos } : x)),
                  }), { commit: false });
                }}
              />
            ))}
            <Dimensions room={room} px={px} />
          </Group>
        </Layer>
      </Stage>
      <div className="plan-hint">
        Dra moduler inn fra venstre · Shift = fri plassering · R = roter · Del = slett · Ctrl+D = dupliser
      </div>
    </div>
  );
}

function RoomShape({ room, px }: { room: Room; px: (v: number) => number }) {
  const wt = room.wallThickness;
  return (
    <>
      <Rect x={-wt} y={-wt} width={room.width + 2 * wt} height={room.depth + 2 * wt} fill="#3a3835" />
      <Rect name="floor" x={0} y={0} width={room.width} height={room.depth} fill="#fbfaf7" />
      <Shape
        listening={false}
        sceneFunc={(ctx) => {
          for (let x = 100; x < room.width; x += 100) {
            ctx.beginPath();
            ctx.moveTo(x, 0); ctx.lineTo(x, room.depth);
            ctx.strokeStyle = x % 500 === 0 ? '#e4e0d8' : '#f0ede6';
            ctx.lineWidth = px(1);
            ctx.stroke();
          }
          for (let y = 100; y < room.depth; y += 100) {
            ctx.beginPath();
            ctx.moveTo(0, y); ctx.lineTo(room.width, y);
            ctx.strokeStyle = y % 500 === 0 ? '#e4e0d8' : '#f0ede6';
            ctx.lineWidth = px(1);
            ctx.stroke();
          }
        }}
      />
    </>
  );
}

/** Retning i grader (0 = +x, 90 = +y) for veggens løperetning og innover i rommet. */
const ALONG = { N: 0, S: 0, E: 90, W: 90 } as const;
const INWARD = { N: 90, S: 270, E: 180, W: 0 } as const;

function OpeningShape({ room, o, px }: { room: Room; o: Opening; px: (v: number) => number }) {
  const wt = room.wallThickness;
  const horiz = o.wall === 'N' || o.wall === 'S';
  // Åpningen i veggen
  const r =
    o.wall === 'N' ? { x: o.offset, y: -wt, width: o.width, height: wt }
    : o.wall === 'S' ? { x: o.offset, y: room.depth, width: o.width, height: wt }
    : o.wall === 'W' ? { x: -wt, y: o.offset, width: wt, height: o.width }
    : { x: room.width, y: o.offset, width: wt, height: o.width };

  if (o.kind === 'window') {
    const mid = horiz ? { x1: r.x, x2: r.x + r.width, y: r.y + wt / 2 } : null;
    return (
      <>
        <Rect {...r} fill="#dcebf2" stroke="#6f97ab" strokeWidth={1} strokeScaleEnabled={false} />
        {mid
          ? <Line points={[mid.x1, mid.y, mid.x2, mid.y]} stroke="#6f97ab" strokeWidth={1} strokeScaleEnabled={false} />
          : <Line points={[r.x + wt / 2, r.y, r.x + wt / 2, r.y + r.height]} stroke="#6f97ab" strokeWidth={1} strokeScaleEnabled={false} />}
      </>
    );
  }

  // Dør: hengselpunkt på innerkant av veggen
  const atEnd = o.hinge === 'end';
  const a = atEnd ? o.offset + o.width : o.offset;
  const hp =
    o.wall === 'N' ? { x: a, y: 0 }
    : o.wall === 'S' ? { x: a, y: room.depth }
    : o.wall === 'W' ? { x: 0, y: a }
    : { x: room.width, y: a };
  const closed = (ALONG[o.wall] + (atEnd ? 180 : 0)) % 360;
  const open = INWARD[o.wall];
  const start = (closed + 90) % 360 === open ? closed : open;
  const rad = (open * Math.PI) / 180;
  return (
    <>
      <Rect {...r} fill="#fbfaf7" />
      <Arc
        x={hp.x} y={hp.y} innerRadius={o.width} outerRadius={o.width} angle={90} rotation={start}
        stroke={MUTED} strokeWidth={1} dash={[px(4), px(4)]} strokeScaleEnabled={false}
      />
      <Line
        points={[hp.x, hp.y, hp.x + Math.cos(rad) * o.width, hp.y + Math.sin(rad) * o.width]}
        stroke={INK} strokeWidth={2} strokeScaleEnabled={false}
      />
    </>
  );
}

interface ModuleProps {
  m: ModuleInstance;
  label: string;
  level?: 'error' | 'warn';
  selected: boolean;
  px: (v: number) => number;
  onSelect(): void;
  onDragStart(): void;
  onDragMove(node: Konva.Group, free: boolean): void;
}

function ModuleShape({ m, label, level, selected, px, onSelect, onDragStart, onDragMove }: ModuleProps) {
  const f = footprintOf(m);
  const fill = colorHex(m.params.farge);
  const stroke = level === 'error' ? ERR : level === 'warn' ? WARN : selected ? ACCENT : INK;
  const doors = m.type === 'underskap' ? Number(m.params.dorer) : 0;
  const fs = Math.min(px(11), f.d / 2.8);

  return (
    <Group
      x={m.x}
      y={m.y}
      rotation={m.rotation}
      draggable
      onMouseDown={onSelect}
      onTap={onSelect}
      onDragStart={onDragStart}
      onDragMove={(e) => onDragMove(e.target as Konva.Group, e.evt.shiftKey)}
      onMouseEnter={(e) => { const c = e.target.getStage()?.container(); if (c) c.style.cursor = 'grab'; }}
      onMouseLeave={(e) => { const c = e.target.getStage()?.container(); if (c) c.style.cursor = ''; }}
    >
      {selected && (
        <Rect x={-f.w / 2 - px(5)} y={-f.d / 2 - px(5)} width={f.w + px(10)} height={f.d + px(10)}
          stroke={ACCENT} strokeWidth={1} dash={[4, 3]} strokeScaleEnabled={false} />
      )}
      <Rect
        x={-f.w / 2} y={-f.d / 2} width={f.w} height={f.d}
        fill={fill} opacity={0.92}
        stroke={stroke} strokeWidth={selected || level ? 2 : 1} strokeScaleEnabled={false}
        shadowColor="#000" shadowOpacity={0.12} shadowBlur={6} shadowOffsetY={2}
      />
      {/* Fronten markeres med en tykk linje */}
      <Line points={[-f.w / 2, f.d / 2, f.w / 2, f.d / 2]} stroke={stroke} strokeWidth={3} strokeScaleEnabled={false} />
      {doors === 2 && (
        <Line points={[0, f.d / 2 - px(10), 0, f.d / 2]} stroke={stroke} strokeWidth={1} strokeScaleEnabled={false} />
      )}
      {m.type === 'hylle' && (
        <Line points={[-f.w / 2, -f.d / 2, f.w / 2, f.d / 2]} stroke={MUTED} strokeWidth={0.75} opacity={0.5} strokeScaleEnabled={false} />
      )}
      {/* Teksten går langs modulens bredde og snus slik at den alltid kan leses */}
      <Group rotation={m.rotation === 90 || m.rotation === 180 ? 180 : 0}>
        <Text
          text={`${label}\n${Math.round(f.w)} mm`}
          x={-f.w / 2} y={-fs * 1.25} width={f.w} align="center" wrap="none"
          fontSize={fs} lineHeight={1.25} fontFamily="Inter, sans-serif"
          fill={m.params.farge === 'antrasitt' ? '#fff' : INK}
          listening={false}
        />
      </Group>
    </Group>
  );
}

function Dimensions({ room, px }: { room: Room; px: (v: number) => number }) {
  const wt = room.wallThickness;
  const gap = wt + px(18);
  const fs = px(12);
  return (
    <>
      <Line points={[0, -gap, room.width, -gap]} stroke={MUTED} strokeWidth={1} strokeScaleEnabled={false} />
      <Line points={[0, -gap - px(5), 0, -gap + px(5)]} stroke={MUTED} strokeWidth={1} strokeScaleEnabled={false} />
      <Line points={[room.width, -gap - px(5), room.width, -gap + px(5)]} stroke={MUTED} strokeWidth={1} strokeScaleEnabled={false} />
      <Text text={`${room.width} mm`} x={room.width / 2 - px(50)} y={-gap - px(18)} width={px(100)} align="center"
        fontSize={fs} fill={MUTED} fontFamily="Inter, sans-serif" />
      <Line points={[-gap, 0, -gap, room.depth]} stroke={MUTED} strokeWidth={1} strokeScaleEnabled={false} />
      <Line points={[-gap - px(5), 0, -gap + px(5), 0]} stroke={MUTED} strokeWidth={1} strokeScaleEnabled={false} />
      <Line points={[-gap - px(5), room.depth, -gap + px(5), room.depth]} stroke={MUTED} strokeWidth={1} strokeScaleEnabled={false} />
      <Text text={`${room.depth} mm`} x={-gap - px(18)} y={room.depth / 2 + px(50)} width={px(100)} align="center"
        rotation={-90} fontSize={fs} fill={MUTED} fontFamily="Inter, sans-serif" />
      <Text text="N ↑" x={room.width + wt + px(8)} y={-wt - px(18)} fontSize={px(11)} fill={MUTED}
        fontFamily="Inter, sans-serif" listening={false} />
    </>
  );
}
