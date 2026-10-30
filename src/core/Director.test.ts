import { describe, expect, it } from "vitest";
import { Director } from "./Director";
import type { CaseData, WorldQuery } from "./types";
import caso from "../data/caso-helena.json";

const data = caso as unknown as CaseData;
const nobody: WorldQuery = { playerZone: () => "out", distanceTo: () => Infinity, witnesses: () => [] };

describe("Director", () => {
  it("sigue las rutinas", () => {
    const d = new Director(data);
    expect(d.placeOf("marisa", 500)).toBe("home");
    expect(d.placeOf("marisa", 650)).toBe("away");
    expect(d.doorOpen("marisa")).toBe(true);
    d.state.time = 650;
    expect(d.doorOpen("marisa")).toBe(false);
  });

  it("registrar cuesta tiempo y anota la pista", () => {
    const d = new Director(data);
    d.examine("copa", nobody);
    expect(d.state.found).toContain("copa");
    expect(d.state.time).toBe(data.startMinute + data.costs.examine);
  });

  it("ser visto sube la desconfianza; con mucha, Marisa limpia", () => {
    const d = new Director(data);
    const seen: WorldQuery = { ...nobody, playerZone: () => "marisa", witnesses: () => ["marisa"] };
    d.examine("vitrina", seen);
    expect(d.state.sus.marisa).toBe(25);
    d.state.sus.marisa = 70;
    d.advance(1, nobody);
    expect(d.state.gone).toEqual(expect.arrayContaining(["guantes", "ceniza"]));
  });

  it("la copa desaparece a medianoche si no la recogiste", () => {
    const d = new Director(data);
    d.state.time = 1440; d.advance(10, nobody);
    expect(d.state.gone).toContain("copa");
  });

  it("presionar baja el honor y desbloquea el cajón", () => {
    const d = new Director(data);
    d.state.found.push("mensajes");
    d.press("tomas", "q_t3");
    expect(d.state.honor).toBe(35);
    d.examine("recorte", nobody);
    expect(d.state.found).toContain("recorte");
  });

  it("una escena solo se ve desde la zona donde ocurre", () => {
    const at = (zone: string): WorldQuery => ({ playerZone: () => zone, distanceTo: () => 1, witnesses: () => [] });
    const d = new Director(data);
    d.state.time = 1430; // Marisa cruza el patio de Helena
    d.checkWitness(at("out"));
    expect(d.state.found).not.toContain("testigo");
    d.checkWitness(at("marisa"));
    expect(d.state.found).not.toContain("testigo");
    d.checkWitness(at("yard"));
    expect(d.state.found).toContain("testigo");
  });

  it("acusar: finales", () => {
    expect(new Director(data).accuse("lucia", "drug", "secret")).toBe("wrong:lucia");
    expect(new Director(data).accuse("marisa", "push", "secret")).toBe("partial");
    expect(new Director(data).accuse("marisa", "drug", "secret")).toBe("perfect");
    const dark = new Director(data, { honor: 10 });
    expect(dark.accuse("marisa", "drug", "secret")).toBe("perfect-dark");
  });

  it("avisa de quién entra y quién sale en la próxima hora", () => {
    const d = new Director(data);
    d.state.time = 590; // Marisa sale a las 10:00
    expect(d.upcoming(60)).toEqual([{ npc: "marisa", at: 600, home: false }]);
  });

  it("solo cuenta los cambios que abren o cierran una puerta", () => {
    const d = new Director(data);
    d.state.time = 830;
    const next = d.upcoming(120);
    expect(next.map((c) => c.at)).toEqual([...next.map((c) => c.at)].sort((a, b) => a - b));
    // Aurelio cambia de sitio a las 15:00, pero no tiene casa: no cambia ninguna puerta.
    expect(next.some((c) => c.npc === "aurelio")).toBe(false);
    expect(next).toContainEqual({ npc: "marisa", at: 840, home: false });
    expect(next).toContainEqual({ npc: "marisa", at: 900, home: true });
  });

  it("dice qué le queda por abrir a una pista", () => {
    const d = new Director(data);
    d.state.found.push("copa");
    expect(d.unlocks("copa")).toEqual(["Marisa Ocampo: «Encontré una de tus copas junto a la alberca.»"]);
    d.ask("marisa", "q_m3");
    expect(d.unlocks("copa")).toEqual([]);
  });

  it("avisa cuando un vecino deja de abrirte la puerta", () => {
    const d = new Director(data);
    const toasts: string[] = [];
    d.on((e) => { if (e.kind === "toast") toasts.push(e.text); });
    const seen: WorldQuery = { ...nobody, playerZone: () => "marisa", witnesses: () => ["marisa"] };
    d.examine("vitrina", seen);
    d.examine("ceniza", seen);
    expect(d.state.sus.marisa).toBe(50);
    expect(toasts).toEqual([]);
    d.examine("guantes", seen); // cruza el umbral de 60
    expect(toasts).toContain("Marisa Ocampo ya no te va a abrir la puerta.");
    expect(d.refuses("marisa")).toBe(true);
  });

  it("el tiempo se acaba", () => {
    const d = new Director(data);
    d.advance(5000, nobody);
    expect(d.state.ended).toBe("timeout");
  });
});
