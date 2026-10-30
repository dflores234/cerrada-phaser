import type { CaseData, DirectorEvent, Ending, GameState, Minute, WorldQuery } from "./types";

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
  clock(time = this.state.time) {
    const h = Math.floor(time / 60) % 24, m = time % 60;
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

  /** Qué cambia de sitio en los próximos minutos, pero solo lo que decide si una puerta estará abierta. */
  upcoming(minutes: number) {
    const out: { npc: string; at: Minute; home: boolean }[] = [];
    for (const npc of Object.keys(this.data.npcs)) {
      let was = this.isHome(npc);
      for (const [m] of this.data.npcs[npc].schedule) {
        if (m <= this.state.time || m > this.state.time + minutes) continue;
        const home = this.placeOf(npc, m) === "home";
        if (home !== was) out.push({ npc, at: m, home });
        was = home;
      }
    }
    return out.sort((a, b) => a.at - b.at);
  }

  /** Qué puertas abre todavía una pista o una respuesta: lo que te queda por usar de ella. */
  unlocks(token: string) {
    const out: string[] = [];
    for (const [id, it] of Object.entries(this.data.items)) {
      if (it.needs?.includes(token) && !this.state.found.includes(id)) out.push(it.label);
    }
    for (const npc of Object.keys(this.data.npcs)) {
      for (const q of this.data.npcs[npc].questions) {
        if (q.needs === token && !this.state.asked.includes(q.id)) out.push(`${this.data.npcs[npc].name}: «${q.q}»`);
      }
    }
    return out;
  }

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
      const ok = ev.npcs.every((n) => world.distanceTo(n) < ev.radius) && world.playerZone() === ev.zone;
      if (!ok) continue;
      s.found.push(ev.clue);
      this.emit({ kind: "clue", clue: ev.clue });
      this.emit({ kind: "scene", title: ev.title, lines: [ev.text], gain: "Anotado: " + this.data.clues[ev.clue].title });
    }
  }

  // ---------- Acciones ----------
  /** Sube la desconfianza de un vecino y avisa si con esto deja de hablarte: hasta ahora
   *  solo se podía averiguar yendo a tocarle la puerta, que es justo lo que la sube. */
  private raise(npc: string, amount: number) {
    const s = this.state, before = s.sus[npc], limit = this.data.suspicion.refuseAt;
    s.sus[npc] = Math.min(100, before + amount);
    if (before < limit && s.sus[npc] >= limit) this.emit({ kind: "toast", text: `${this.data.npcs[npc].name} ya no te va a abrir la puerta.` });
  }

  examine(itemId: string, world: WorldQuery) {
    const s = this.state, it = this.data.items[itemId], clue = this.data.clues[itemId];
    const done = s.found.includes(itemId);
    if (done) { this.emit({ kind: "scene", title: it.label, lines: [it.text, clue.text] }); return; }
    if (s.gone.includes(itemId)) { this.advance(this.data.costs.examine, world); this.emit({ kind: "scene", title: it.label, lines: [it.gone ?? "Ya no hay nada."] }); return; }
    if (it.needs && !it.needs.some((n) => this.has(n))) { this.emit({ kind: "scene", title: "Todavía no", lines: [it.lock ?? "Todavía no."] }); return; }
    s.found.push(itemId);
    const lines = [it.text];
    if (world.playerZone() !== "out") {
      for (const n of world.witnesses(7)) {
        if (this.data.npcs[n].noHouse) continue;
        this.raise(n, this.data.suspicion.seenSearching);
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
    // A diferencia de registrar, aquí no se salta a los `noHouse`: reventar una puerta
    // escandaliza a cualquiera que lo vea, tenga casa en la Cerrada o no.
    for (const n of world.witnesses(8)) {
      this.raise(n, this.data.suspicion.seenForcing);
      lines.push(`${this.data.npcs[n].name} te mira desde la calle.`);
    }
    this.advance(this.data.costs.force, world);
    this.emit({ kind: "scene", title: "La puerta", lines });
  }

  ask(npc: string, qid: string, world?: WorldQuery) {
    const s = this.state, q = this.data.npcs[npc].questions.find((x) => x.id === qid)!;
    if (!s.asked.includes(qid)) {
      s.asked.push(qid);
      if (q.needs) this.raise(npc, this.data.suspicion.confront);
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
      this.raise(npc, this.data.suspicion.press);
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
