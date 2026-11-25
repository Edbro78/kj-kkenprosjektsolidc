import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Edges } from '@react-three/drei';
import { colorHex, LIBRARY } from '../library';
import { footprintOf } from '../model/geometry';
import type { Design, ModuleInstance, Opening, Panel, Room } from '../model/types';

const M = 0.001; // mm → meter

interface Props {
  design: Design;
  selectedId: string | null;
  onSelect(id: string | null): void;
}

export default function Preview3D({ design, selectedId, onSelect }: Props) {
  const { room } = design;
  const span = Math.max(room.width, room.depth) * M;
  const [explode, setExplode] = useState(0);
  // Med en modul valgt eksploderes bare den, ellers alle
  const factorFor = (id: string) => (explode && (!selectedId || selectedId === id) ? explode : 0);
  return (
    <div className="preview">
      <label className="explode" title={selectedId ? 'Eksploderer den valgte modulen' : 'Eksploderer alle moduler. Velg en modul for å se bare den.'}>
        <span>Eksplodert{explode ? (selectedId ? ' (valgt modul)' : ' (alle)') : ''}</span>
        <input type="range" min={0} max={1.2} step={0.05} value={explode} onChange={(e) => setExplode(Number(e.target.value))} />
      </label>
      <Canvas
        shadows
        gl={{ preserveDrawingBuffer: true }} // slik at bestillingspakken kan ta et bilde av visningen
        camera={{ position: [span * 0.55, span * 0.85, span * 1.05], fov: 40, near: 0.05, far: 100 }}
        onPointerMissed={() => onSelect(null)}
      >
        <color attach="background" args={['#efece6']} />
        <hemisphereLight args={['#ffffff', '#d8d2c6', 0.9]} />
        <directionalLight
          position={[span * 0.6, span * 1.4, span * 0.9]}
          intensity={1.4}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-span}
          shadow-camera-right={span}
          shadow-camera-top={span}
          shadow-camera-bottom={-span}
        />
        <group position={[-room.width * M / 2, 0, -room.depth * M / 2]}>
          <RoomMesh room={room} />
          {design.modules.map((m) => (
            <ModuleMesh key={m.id} m={m} explode={factorFor(m.id)} selected={m.id === selectedId} onSelect={() => onSelect(m.id)} />
          ))}
        </group>
        <OrbitControls makeDefault target={[0, 0.7, 0]} maxPolarAngle={Math.PI / 2.05} />
      </Canvas>
    </div>
  );
}

function RoomMesh({ room }: { room: Room }) {
  const W = room.width * M, D = room.depth * M, H = room.height * M, T = room.wallThickness * M;
  const walls: { pos: [number, number, number]; size: [number, number, number] }[] = [
    { pos: [W / 2, H / 2, -T / 2], size: [W + 2 * T, H, T] }, // N
    { pos: [W / 2, H / 2, D + T / 2], size: [W + 2 * T, H, T] }, // S
    { pos: [-T / 2, H / 2, D / 2], size: [T, H, D] }, // W
    { pos: [W + T / 2, H / 2, D / 2], size: [T, H, D] }, // E
  ];
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[W / 2, 0, D / 2]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#d9cdb8" />
      </mesh>
      {walls.map((w, i) => (
        <mesh key={i} position={w.pos}>
          <boxGeometry args={w.size} />
          <meshStandardMaterial color="#ffffff" transparent opacity={i < 1 || i === 2 ? 0.55 : 0.12} depthWrite={false} />
        </mesh>
      ))}
      {room.openings.map((o) => <OpeningMesh key={o.id} room={room} o={o} />)}
    </>
  );
}

function OpeningMesh({ room, o }: { room: Room; o: Opening }) {
  const T = room.wallThickness * M + 0.004;
  const w = o.width * M, h = o.height * M;
  const z0 = o.kind === 'window' ? (o.sill ?? 900) * M : 0;
  const c = (o.offset + o.width / 2) * M;
  const pos: [number, number, number] =
    o.wall === 'N' ? [c, z0 + h / 2, -T / 2]
    : o.wall === 'S' ? [c, z0 + h / 2, room.depth * M + T / 2]
    : o.wall === 'W' ? [-T / 2, z0 + h / 2, c]
    : [room.width * M + T / 2, z0 + h / 2, c];
  const size: [number, number, number] = o.wall === 'N' || o.wall === 'S' ? [w, h, T] : [T, h, w];
  return (
    <mesh position={pos}>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={o.kind === 'window' ? '#a9cbe0' : '#a08b72'}
        transparent opacity={o.kind === 'window' ? 0.5 : 0.3} depthWrite={false}
      />
    </mesh>
  );
}

/** Flytter hver plate ut fra modulens senter, slik som de eksploderte visningene i SolidCraft. */
function explodeOffsets(panels: Panel[], factor: number): [number, number, number][] {
  if (!factor) return panels.map(() => [0, 0, 0]);
  const lo = [0, 1, 2].map((i) => Math.min(...panels.map((p) => p.pos[i])));
  const hi = [0, 1, 2].map((i) => Math.max(...panels.map((p) => p.pos[i] + p.size[i])));
  const mc = lo.map((v, i) => (v + hi[i]) / 2);
  const lift = (mc[2] - lo[2]) * factor; // så de nederste platene ikke går under gulvet
  return panels.map((p) => {
    const pc = p.pos.map((v, i) => v + p.size[i] / 2);
    return [(pc[0] - mc[0]) * factor, (pc[1] - mc[1]) * factor, (pc[2] - mc[2]) * factor + lift];
  });
}

function ModuleMesh({ m, explode, selected, onSelect }: { m: ModuleInstance; explode: number; selected: boolean; onSelect(): void }) {
  const f = footprintOf(m);
  const color = colorHex(m.params.farge);
  const panels = LIBRARY[m.type].panels(m.params);
  const offs = explodeOffsets(panels, explode);
  return (
    <group
      position={[m.x * M, 0, m.y * M]}
      rotation={[0, (-m.rotation * Math.PI) / 180, 0]}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
    >
      {panels.map((p, i) => {
        const [u, v, z] = p.pos.map((c, k) => c + offs[i][k]);
        const [sx, sy, sz] = p.size;
        const tone = p.kind === 'top' && m.type === 'underskap' ? '#cfc6b8' : p.kind === 'back' ? shade(color, 0.92) : color;
        return (
          <mesh
            key={i}
            castShadow
            receiveShadow
            position={[(u + sx / 2 - f.w / 2) * M, (z + sz / 2) * M, (v + sy / 2 - f.d / 2) * M]}
          >
            <boxGeometry args={[sx * M, sz * M, sy * M]} />
            <meshStandardMaterial
              color={tone}
              roughness={0.75}
              emissive={selected ? '#2f6f62' : '#000000'}
              emissiveIntensity={selected ? 0.22 : 0}
            />
            <Edges threshold={15} color={selected ? '#2f6f62' : '#8a857c'} />
          </mesh>
        );
      })}
    </group>
  );
}

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => Math.round(x * k));
  return '#' + c.map((x) => x.toString(16).padStart(2, '0')).join('');
}
