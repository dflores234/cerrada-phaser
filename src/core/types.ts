export type Minute = number;

export interface Clue { title: string; text: string; key?: boolean }
export interface Item { label: string; text: string; gone?: string; needs?: string[]; lock?: string }
export interface Question { id: string; q: string; a: string[]; needs?: string; press?: string[] }
export interface Npc {
  name: string; role: string; color: string; noHouse?: boolean;
  schedule: [Minute, string][]; questions: Question[];
}
export interface WitnessEvent {
  id: string; type: "witness"; from: Minute; to: Minute; npcs: string[]; zone: string; radius: number;
  clue: string; title: string; text: string;
}
export interface RemoveEvent { id: string; type: "removeItem"; at: Minute; item: string }
export type CaseEvent = WitnessEvent | RemoveEvent;

export interface CaseData {
  id: string; title: string; startMinute: Minute; endMinute: Minute;
  culprit: string; solution: { how: string; why: string };
  howOptions: { id: string; label: string }[]; whyOptions: { id: string; label: string }[];
  clues: Record<string, Clue>; items: Record<string, Item>;
  houses: Record<string, { owner: string }>; npcs: Record<string, Npc>;
  events: CaseEvent[];
  cleanup: { npc: string; threshold: number; items: string[]; toast: string };
  costs: { examine: number; ask: number; press: number; force: number; wait: number };
  suspicion: { seenSearching: number; seenForcing: number; confront: number; press: number; refuseAt: number };
  honor: { start: number; pressCost: number };
}

export type Ending = "perfect" | "perfect-dark" | "perfect-light" | "partial" | "timeout" | `wrong:${string}`;

export interface GameState {
  time: Minute; found: string[]; asked: string[]; gone: string[]; forced: string[];
  sus: Record<string, number>; honor: number; ended: Ending | null; flags: Record<string, boolean>;
}

/** Lo que el director necesita saber del mundo para resolver eventos. */
export interface WorldQuery {
  /** Zona donde está el jugador: id de casa, "yard" u "out". */
  playerZone(): string;
  /** Distancia en tiles entre el jugador y un NPC visible; Infinity si está oculto. */
  distanceTo(npc: string): number;
  /** NPCs visibles dentro de un radio y en la misma zona que el jugador. */
  witnesses(radius: number): string[];
}

export type DirectorEvent =
  | { kind: "clue"; clue: string }
  | { kind: "toast"; text: string }
  | { kind: "scene"; title: string; lines: string[]; gain?: string }
  | { kind: "end"; ending: Ending }
  | { kind: "tick" };
