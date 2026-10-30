import type { CaseData, DirectorEvent, Ending, GameState, WorldQuery } from "./types";

type Listener = (e: DirectorEvent) => void;

/**
 * El Director lleva el caso: reloj, rutinas, pistas, sospecha, honor y eventos.
 * No sabe nada de Phaser: recibe un WorldQuery para preguntar dónde está la gente.
 * Eso permite probarlo con vitest y reusarlo en un servidor.
 */
export class Director {
  state: GameState;
  private listeners: Listener[] = [];

  constructor(public data: CaseData, state?: Partial<GameState>) {
    this.state = {
      time: data.startMinute, found: [], asked: [], gone: [], forced: [],
      sus: Object.fromEntries(Object.keys(data.npcs).map((k) => [k, 0])),
      honor: data.honor.start, ended: null, flags: {},
      ...state,
    };
    for (const k of Object.keys(data.npcs)) this.state.sus[k] ??= 0;
  }

  on(fn: Listener) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter((l) => l !== fn); }; }
  private emit(e: DirectorEvent) { for (const l of this.listeners) l(e); }

  // ---------- Consultas ----------
  has(id: string) { return this.state.found.includes(id) || this.state.asked.includes(id); }
  placeOf(npc: string, time = this.state.time): string {
    let place = "home";
    for (const [m, p] of this.data.npcs[npc].schedule) if (time >= m) place = p;
    return place;
  }
  isHome(npc: string) { return this.placeOf(npc) === "home"; }
  doorOpen(house: string) { return this.isHome(this.data.houses[house].owner) || this.state.forced.includes(house); }
  clock() {
    const h = Math.floor(this.state.time / 60) % 24, m = this.state.time % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  dayLabel() { return this.state.time < 1440 ? "domingo" : "lunes"; }
  /** 0 = pleno día, 1 = noche cerrada. */
  darkness() {
    const h = (this.state.time / 60) % 24;
    if (h >= 21 || h < 5) return 1;
    if (h >= 18) return (h - 18) / 3;
    if (h < 7) return (7 - h) / 2;
    return 0;
  }
  reputation() {
    const h = this.state.honor;
    return h >= 70 ? "vecina de confianza" : h >= 40 ? "buena vecina" : h >= 20 ? "mala reputación" : "temida en la Cerrada";
  }
  availableQuestions(npc: string) {
    return this.data.npcs[npc].questions.filter((q) => !q.needs || this.has(q.needs));
  }
  refuses(npc: string) { return this.state.sus[npc] >= this.data.suspicion.refuseAt; }

  // ---------- Tiempo ----------
  advance(minutes: number, world?: WorldQuery) {
    if (this.state.ended) return;
    const before = this.state.time;
    this.state.time += minutes;
    this.checkWorld(before);
    if (world) this.checkWitness(world);
    this.emit({ kind: "tick" });
    if (this.state.time >= this.data.endMinute) { this.state.time = this.data.endMinute; this.end("timeout"); }
  }

  private checkWorld(before: number) {
    const s = this.state;
    for (const ev of this.data.events) {
      if (ev.type === "removeItem" && before < ev.at && s.time >= ev.at && !s.found.includes(ev.item) && !s.gone.includes(ev.item)) s.gone.push(ev.item);
    }
    const c = this.data.cleanup;
    if (s.sus[c.npc] >= c.threshold && !s.flags.cleaned) {
      s.flags.cleaned = true;
      for (const i of c.items) if (!s.found.includes(i) && !s.gone.includes(i)) s.gone.push(i);
      this.emit({ kind: "toast", text: c.toast });
    }
  }

  checkWitness(world: WorldQuery) {
    const s = this.state;
    for (const ev of this.data.events) {
      if (ev.type !== "witness" || s.found.includes(ev.clue)) continue;
      if (s.time < ev.from || s.time > ev.to) continue;
      const ok = ev.npcs.every((n) => world.distanceTo(n) < ev.radius) && (ev.zone === "out" ? world.playerZone() !== "yard" : true);
      if (!ok) continue;
      s.found.push(ev.clue);
      this.emit({ kind: "clue", clue: ev.clue });
      this.emit({ kind: "scene", title: ev.title, lines: [ev.text], gain: "Anotado: " + this.data.clues[ev.clue].title });
    }
  }

  // ---------- Acciones ----------
  examine(itemId: string, world: WorldQuery) {
    const s = this.state, it = this.data.items[itemId], clue = this.data.clues[itemId];
    const done = s.found.includes(itemId);
    if (done) { this.emit({ kind: "scene", title: it.label, lines: [it.text, clue.text] }); return; }
    if (s.gone.includes(itemId)) { this.advance(10, world); this.emit({ kind: "scene", title: it.label, lines: [it.gone ?? "Ya no hay nada."] }); return; }
    if (it.needs && !it.needs.some((n) => this.has(n))) { this.emit({ kind: "scene", title: "Todavía no", lines: [it.lock ?? "Todavía no."] }); return; }
    s.found.push(itemId);
    const lines = [it.text];
    if (world.playerZone() !== "out") {
      for (const n of world.witnesses(7)) {
        if (this.data.npcs[n].noHouse) continue;
        s.sus[n] = Math.min(100, s.sus[n] + this.data.suspicion.seenSearching);
        lines.push(`${this.data.npcs[n].name} te ve desde la puerta. No dice nada. No hace falta.`);
      }
    }
    this.advance(this.data.costs.examine, world);
    this.emit({ kind: "clue", clue: itemId });
    this.emit({ kind: "scene", title: it.label, lines, gain: "Anotado en tu cuaderno: " + clue.title });
  }

  forceDoor(house: string, world: WorldQuery) {
    const s = this.state;
    s.forced.push(house);
    const lines = ["Veinte minutos con una tarjeta y una horquilla. La puerta cede."];
    for (const n of world.witnesses(8)) {
      s.sus[n] = Math.min(100, s.sus[n] + this.data.suspicion.seenForcing);
      lines.push(`${this.data.npcs[n].name} te mira desde la calle.`);
    }
    this.advance(this.data.costs.force, world);
    this.emit({ kind: "scene", title: "La puerta", lines });
  }

  ask(npc: string, qid: string, world?: WorldQuery) {
    const s = this.state, q = this.data.npcs[npc].questions.find((x) => x.id === qid)!;
    if (!s.asked.includes(qid)) {
      s.asked.push(qid);
      if (q.needs) s.sus[npc] = Math.min(100, s.sus[npc] + this.data.suspicion.confront);
      this.advance(this.data.costs.ask, world);
    }
    return q.a;
  }

  press(npc: string, qid: string, world?: WorldQuery) {
    const s = this.state, q = this.data.npcs[npc].questions.find((x) => x.id === qid)!;
    const key = "p_" + qid;
    if (!s.asked.includes(qid)) s.asked.push(qid);
    if (!s.asked.includes(key)) {
      s.asked.push(key);
      s.sus[npc] = Math.min(100, s.sus[npc] + this.data.suspicion.press);
      s.honor = Math.max(0, s.honor - this.data.honor.pressCost);
      this.advance(this.data.costs.press, world);
    }
    return q.press ?? q.a;
  }

  accuse(who: string, how: string, why: string) {
    const d = this.data;
    if (who !== d.culprit) return this.end(`wrong:${who}`);
    if (how !== d.solution.how || why !== d.solution.why) return this.end("partial");
    const h = this.state.honor;
    return this.end(h < 30 ? "perfect-dark" : h >= 70 ? "perfect-light" : "perfect");
  }

  private end(e: Ending) { this.state.ended = e; this.emit({ kind: "end", ending: e }); return e; }
}
