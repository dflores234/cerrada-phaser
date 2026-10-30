import { describe, expect, it } from "vitest";
import { zoneAt, type Rect } from "./zones";

const houses: Record<string, Rect> = {
  marisa: { x: 0, y: 0, width: 100, height: 100 },
  lucia: { x: 100, y: 0, width: 100, height: 100 },
};
const yard: Rect = { x: 0, y: 100, width: 100, height: 100 };

describe("zoneAt", () => {
  it("reconoce la casa, el patio y la calle", () => {
    expect(zoneAt(houses, yard, 50, 50)).toBe("marisa");
    expect(zoneAt(houses, yard, 50, 150)).toBe("yard");
    expect(zoneAt(houses, yard, 500, 500)).toBe("out");
  });

  it("no deja que dos casas pegadas se peleen por el borde", () => {
    expect(zoneAt(houses, yard, 99.9, 50)).toBe("marisa");
    expect(zoneAt(houses, yard, 100, 50)).toBe("lucia");
  });

  it("sin patio, todo lo que no es casa es calle", () => {
    expect(zoneAt(houses, undefined, 50, 150)).toBe("out");
  });
});
