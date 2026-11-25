// Felles datamodell. Alle mål er i millimeter, vinkler i grader.
// Planet: x mot øst (høyre), y mot sør (ned i planen), z opp.

export type WallId = 'N' | 'E' | 'S' | 'W';

export interface Opening {
  id: string;
  kind: 'door' | 'window';
  wall: WallId;
  /** Avstand langs veggen. N/S: fra vest-hjørnet (x). E/W: fra nord-hjørnet (y). */
  offset: number;
  width: number;
  height: number;
  /** Brystningshøyde (kun vindu). */
  sill?: number;
  /** Hvilken ende av åpningen dørhengslene sitter i (kun dør). */
  hinge?: 'start' | 'end';
}

export interface Room {
  schema: 'rom/1';
  name: string;
  width: number; // x
  depth: number; // y
  height: number; // takhøyde
  wallThickness: number;
  openings: Opening[];
}

export type ModuleType = 'hylle' | 'underskap' | 'skrivebord';
export type Rotation = 0 | 90 | 180 | 270;
export type ParamValue = number | boolean | string;

export interface ModuleInstance {
  id: string;
  type: ModuleType;
  /** Senter av fotavtrykket i planet. */
  x: number;
  y: number;
  /** Rotasjon med klokka. 0 = ryggen mot nordveggen, fronten mot sør. */
  rotation: Rotation;
  params: Record<string, ParamValue>;
}

export interface Design {
  schema: 'design/1';
  room: Room;
  modules: ModuleInstance[];
}

/** En plate i modulens lokale koordinater: u langs bredden, v fra ryggen og fremover, z opp. */
export interface Panel {
  code: string; // kort kode for del-ID, f.eks. SIDE
  name: string;
  pos: [number, number, number];
  size: [number, number, number];
  material: 'MDF' | 'Plast';
  kind: 'carcass' | 'front' | 'back' | 'top' | 'shelf' | 'plinth';
  note?: string;
}

/** Plastdeler som 3D-printes. Modellene ligger i solidcraft/plastdeler. */
export type PrintPart = 'hyllebaerer' | 'knott' | 'vinkelbeslag';

export interface Hardware {
  name: string;
  qty: number;
  note?: string;
  /** Satt når beslaget 3D-printes i stedet for å kjøpes. */
  print?: PrintPart;
}

export interface ParamSpec {
  key: string;
  label: string;
  kind: 'number' | 'select' | 'bool';
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: { value: ParamValue; label: string }[];
  default: ParamValue;
}
