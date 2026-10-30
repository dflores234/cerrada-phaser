import type { CaseData } from "./types";
import { zoneAt, type Rect } from "./zones";

/** Lo mínimo que necesitamos del mapa de Tiled para comprobar que el caso cuadra con él. */
export interface TiledObject { name: string; type: string; x: number; y: number; width?: number; height?: number }
export interface TiledMap { tilewidth: number; layers: { type: string; name: string; objects?: TiledObject[] }[] }

/**
 * Revisa que un caso sea coherente consigo mismo y con su mapa.
 * Devuelve la lista de problemas; vacía quiere decir que el caso es jugable.
 *
 * Existe porque un caso es solo un JSON: un `needs` mal escrito no rompe nada al
 * compilar, simplemente deja una pregunta que no aparece nunca y nadie se entera.
 */
export function validateCase(data: CaseData, map?: TiledMap): string[] {
  const problems: string[] = [];
  const bad = (msg: string) => problems.push(msg);

  const npcIds = Object.keys(data.npcs);
  const clueIds = new Set(Object.keys(data.clues));
  const itemIds = new Set(Object.keys(data.items));
  const questions = npcIds.flatMap((npc) => data.npcs[npc].questions.map((q) => ({ npc, q })));
  const questionIds = new Set(questions.map((x) => x.q.id));
  const pressable = new Set(questions.filter((x) => x.q.press?.length).map((x) => x.q.id));

  // ---------- Núcleo ----------
  if (!data.npcs[data.culprit]) bad(`culprit "${data.culprit}" no es ningún vecino`);
  if (!data.howOptions.some((o) => o.id === data.solution.how)) bad(`solution.how "${data.solution.how}" no está entre howOptions`);
  if (!data.whyOptions.some((o) => o.id === data.solution.why)) bad(`solution.why "${data.solution.why}" no está entre whyOptions`);
  if (data.startMinute >= data.endMinute) bad("startMinute no es anterior a endMinute");

  // ---------- Pistas y objetos ----------
  const witnessClues = new Set(data.events.flatMap((e) => (e.type === "witness" ? [e.clue] : [])));
  for (const id of itemIds) if (!clueIds.has(id)) bad(`el objeto "${id}" no tiene una pista con su mismo id`);
  for (const id of clueIds) if (!itemIds.has(id) && !witnessClues.has(id)) bad(`la pista "${id}" no la entrega ningún objeto ni evento`);

  /** `needs` se cumple con CUALQUIERA de sus fichas; una ficha es una pista, una pregunta o "p_<pregunta>". */
  const resolves = (token: string) =>
    token.startsWith("p_") ? pressable.has(token.slice(2)) : clueIds.has(token) || questionIds.has(token);

  for (const [id, item] of Object.entries(data.items)) {
    for (const token of item.needs ?? []) if (!resolves(token)) bad(`el objeto "${id}" necesita "${token}", que no existe`);
    if (item.needs?.length && !item.lock) bad(`el objeto "${id}" está bloqueado pero no tiene texto "lock"`);
  }

  // ---------- Preguntas ----------
  const seen = new Set<string>();
  for (const { npc, q } of questions) {
    if (seen.has(q.id)) bad(`la pregunta "${q.id}" (${npc}) está repetida: los ids son globales`);
    seen.add(q.id);
    if (!q.a.length) bad(`la pregunta "${q.id}" no tiene respuesta`);
    if (q.needs && !resolves(q.needs)) bad(`la pregunta "${q.id}" necesita "${q.needs}", que no existe`);
  }

  // ---------- Casas, eventos y limpieza ----------
  for (const [id, house] of Object.entries(data.houses)) if (!data.npcs[house.owner]) bad(`la casa "${id}" es de "${house.owner}", que no es un vecino`);

  const eventIds = new Set<string>();
  for (const ev of data.events) {
    if (eventIds.has(ev.id)) bad(`el evento "${ev.id}" está repetido`);
    eventIds.add(ev.id);
    if (ev.type === "witness") {
      for (const n of ev.npcs) if (!data.npcs[n]) bad(`el evento "${ev.id}" espera a "${n}", que no es un vecino`);
      if (!clueIds.has(ev.clue)) bad(`el evento "${ev.id}" entrega la pista "${ev.clue}", que no existe`);
      if (ev.from > ev.to) bad(`el evento "${ev.id}" acaba antes de empezar`);
      if (ev.radius <= 0) bad(`el evento "${ev.id}" tiene radio ${ev.radius}`);
    } else {
      if (!itemIds.has(ev.item)) bad(`el evento "${ev.id}" retira "${ev.item}", que no es un objeto`);
      if (ev.at < data.startMinute || ev.at > data.endMinute) bad(`el evento "${ev.id}" ocurre fuera del horario del caso`);
    }
  }

  if (!data.npcs[data.cleanup.npc]) bad(`cleanup.npc "${data.cleanup.npc}" no es un vecino`);
  for (const i of data.cleanup.items) if (!itemIds.has(i)) bad(`cleanup retira "${i}", que no es un objeto`);

  // ---------- Rutinas ----------
  for (const id of npcIds) {
    const sched = data.npcs[id].schedule;
    if (!sched.length) { bad(`${id} no tiene rutina`); continue; }
    if (sched[0][0] > data.startMinute) bad(`la rutina de ${id} empieza después del caso: no se sabe dónde está al arrancar`);
    for (let i = 1; i < sched.length; i++) if (sched[i][0] <= sched[i - 1][0]) bad(`la rutina de ${id} no va en orden en el minuto ${sched[i][0]}`);
  }

  // ---------- Alcanzabilidad ----------
  const reachable = new Set<string>(witnessClues);
  for (let changed = true; changed; ) {
    changed = false;
    const add = (t: string) => { if (!reachable.has(t)) { reachable.add(t); changed = true; } };
    for (const [id, item] of Object.entries(data.items)) {
      if (!reachable.has(id) && (!item.needs?.length || item.needs.some((t) => reachable.has(t)))) add(id);
    }
    for (const { q } of questions) {
      if (reachable.has(q.id) || (q.needs && !reachable.has(q.needs))) continue;
      add(q.id);
      if (pressable.has(q.id)) add("p_" + q.id);
    }
  }
  for (const id of itemIds) if (!reachable.has(id)) bad(`el objeto "${id}" no se puede alcanzar nunca`);
  for (const { q } of questions) if (!reachable.has(q.id)) bad(`la pregunta "${q.id}" no se puede alcanzar nunca`);

  // ---------- Mapa ----------
  if (map) problems.push(...checkMap(data, map, npcIds, itemIds));
  return problems;
}

/** Copia de Director.placeOf, para poder validar sin instanciar nada. */
function placeOf(data: CaseData, npc: string, time: number) {
  let place = "home";
  for (const [m, p] of data.npcs[npc].schedule) if (time >= m) place = p;
  return place;
}

function checkMap(data: CaseData, map: TiledMap, npcIds: string[], itemIds: Set<string>) {
  const out: string[] = [];
  const objects = map.layers.flatMap((l) => l.objects ?? []);
  const named = (type: string) => new Set(objects.filter((o) => o.type === type).map((o) => o.name));
  const items = named("item"), houses = named("house"), doors = named("door"), spots = named("spot"), zones = named("zone");

  for (const id of itemIds) if (!items.has(id)) out.push(`el objeto "${id}" no está colocado en el mapa`);
  for (const id of items) if (!itemIds.has(id)) out.push(`el mapa coloca "${id}", que no es un objeto del caso`);
  for (const id of Object.keys(data.houses)) {
    if (!houses.has(id)) out.push(`la casa "${id}" no está dibujada en el mapa`);
    if (!doors.has(id)) out.push(`la casa "${id}" no tiene puerta en el mapa`);
  }
  if (!zones.has("yard")) out.push('falta la zona "yard" en el mapa');

  const needed = new Set(["player", "away"]);
  for (const id of npcIds) {
    needed.add("home_" + id);
    for (const [, place] of data.npcs[id].schedule) if (place !== "home" && place !== "away") needed.add(place);
  }
  for (const spot of needed) if (!spots.has(spot)) out.push(`falta el punto "${spot}" en el mapa`);

  // La zona de un evento es la del mapa ("yard", una casa u "out"), no el nombre del punto
  // donde está el vecino: hay que resolver las coordenadas como hace WorldScene.zoneOf.
  const T = map.tilewidth;
  const byName = (type: string, name: string) => objects.find((o) => o.type === type && o.name === name);
  const rect = (o: TiledObject): Rect => ({ x: o.x, y: o.y, width: o.width ?? 0, height: o.height ?? 0 });
  const houseRects: Record<string, Rect> = {};
  for (const id of Object.keys(data.houses)) { const h = byName("house", id); if (h) houseRects[id] = rect(h); }
  const yardObj = byName("zone", "yard");

  for (const ev of data.events) {
    if (ev.type !== "witness") continue;
    for (const n of ev.npcs) {
      const place = placeOf(data, n, ev.from);
      if (place === "away") { out.push(`el evento "${ev.id}" espera a ${n}, que a esa hora no está en la Cerrada`); continue; }
      const spot = byName("spot", place === "home" ? "home_" + n : place);
      if (!spot) continue; // ya lo reporta la comprobación de puntos
      const zone = zoneAt(houseRects, yardObj && rect(yardObj), Math.floor(spot.x / T) * T + T / 2, Math.floor(spot.y / T) * T + T / 2);
      if (zone !== ev.zone) out.push(`el evento "${ev.id}" dice ocurrir en "${ev.zone}" pero a esa hora ${n} está en "${zone}"`);
    }
  }
  return out;
}
