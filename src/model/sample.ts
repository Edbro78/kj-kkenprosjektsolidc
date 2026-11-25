import { defaultParams } from '../library';
import type { Design, Room } from './types';

export const emptyRoom = (): Room => ({
  schema: 'rom/1',
  name: 'Nytt rom',
  width: 4000,
  depth: 3200,
  height: 2500,
  wallThickness: 120,
  openings: [],
});

/** Eksempelrom 4000 × 3200 mm: hjemmekontor med kjøkkenrekke. */
export const sampleDesign = (): Design => ({
  schema: 'design/1',
  room: {
    schema: 'rom/1',
    name: 'Eksempelrom',
    width: 4000,
    depth: 3200,
    height: 2500,
    wallThickness: 120,
    openings: [
      { id: 'd1', kind: 'door', wall: 'S', offset: 400, width: 900, height: 2100, hinge: 'start' },
      { id: 'w1', kind: 'window', wall: 'N', offset: 1500, width: 1200, height: 1200, sill: 900 },
    ],
  },
  modules: [
    { id: 'sb1', type: 'skrivebord', x: 2100, y: 350, rotation: 0, params: defaultParams('skrivebord') },
    { id: 'hy1', type: 'hylle', x: 175, y: 800, rotation: 270, params: defaultParams('hylle') },
    { id: 'hy2', type: 'hylle', x: 175, y: 1600, rotation: 270, params: defaultParams('hylle') },
    ...[1, 2, 3, 4].map((i) => ({
      id: `uk${i}`,
      type: 'underskap' as const,
      x: 4000 - 300, // dybde 580 + 20 mm overheng på benkeplata = 600
      y: 800 + 300 + 600 * (i - 1),
      rotation: 90 as const,
      params: defaultParams('underskap'),
    })),
  ],
});
