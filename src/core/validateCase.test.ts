import { describe, expect, it } from "vitest";
import { validateCase, type TiledMap } from "./validateCase";
import type { CaseData } from "./types";
import caso from "../data/caso-helena.json";
import mapa from "../../public/assets/map.json";

const data = caso as unknown as CaseData;
const map = mapa as unknown as TiledMap;
const clone = () => JSON.parse(JSON.stringify(data)) as CaseData;

describe("validateCase", () => {
  it("el caso de Helena cuadra consigo mismo y con el mapa", () => {
    expect(validateCase(data, map)).toEqual([]);
  });

  it("caza una pista que no existe en un needs", () => {
    const c = clone();
    c.npcs.marisa.questions[2].needs = "copaa";
    expect(validateCase(c)).toContain('la pregunta "q_m3" necesita "copaa", que no existe');
  });

  it("caza un objeto al que ya no se puede llegar", () => {
    const c = clone();
    c.items.recorte.needs = ["q_m4"]; // q_m4 pide recorte: se muerde la cola
    const out = validateCase(c);
    expect(out).toContain('el objeto "recorte" no se puede alcanzar nunca');
    expect(out).toContain('la pregunta "q_m4" no se puede alcanzar nunca');
  });

  it("caza ids de pregunta repetidos, que comparten espacio global", () => {
    const c = clone();
    c.npcs.lucia.questions[0].id = "q_m1";
    expect(validateCase(c).join(" ")).toContain('"q_m1" (lucia) está repetida');
  });

  it("caza un objeto que no está en el mapa", () => {
    const c = clone();
    c.items.pistola = { label: "Una pistola", text: "..." };
    c.clues.pistola = { title: "Una pistola", text: "..." };
    expect(validateCase(c, map)).toContain('el objeto "pistola" no está colocado en el mapa');
  });

  it("caza un evento que cita a alguien donde no está", () => {
    const c = clone();
    const ev = c.events.find((e) => e.id === "parque")!;
    if (ev.type === "witness") ev.npcs = ["marisa"]; // a esa hora sigue en su casa
    expect(validateCase(c, map)).toContain('el evento "parque" dice ocurrir en "out" pero a esa hora marisa está en "marisa"');
  });

  it("caza una rutina desordenada", () => {
    const c = clone();
    c.npcs.tomas.schedule = [[480, "home"], [300, "park"]];
    expect(validateCase(c)).toContain("la rutina de tomas no va en orden en el minuto 300");
  });
});
