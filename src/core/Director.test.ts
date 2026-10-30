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

  it("acusar: finales", () => {
    expect(new Director(data).accuse("lucia", "drug", "secret")).toBe("wrong:lucia");
    expect(new Director(data).accuse("marisa", "push", "secret")).toBe("partial");
    expect(new Director(data).accuse("marisa", "drug", "secret")).toBe("perfect");
    const dark = new Director(data, { honor: 10 });
    expect(dark.accuse("marisa", "drug", "secret")).toBe("perfect-dark");
  });

  it("el tiempo se acaba", () => {
    const d = new Director(data);
    d.advance(5000, nobody);
    expect(d.state.ended).toBe("timeout");
  });
});
