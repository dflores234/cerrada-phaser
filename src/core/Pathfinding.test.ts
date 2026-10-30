import { describe, expect, it } from "vitest";
import { findPath } from "./Pathfinding";

/** Rejillas de texto: '#' no se pisa. Más legible que una lista de coordenadas. */
const grid = (rows: string[]) => ({
  w: rows[0].length,
  h: rows.length,
  passable: (x: number, y: number) => rows[y][x] !== "#",
});

describe("findPath", () => {
  it("va en línea recta cuando no hay nada en medio", () => {
    const g = grid(["....."]);
    expect(findPath(g.w, g.h, g.passable, 0, 0, 4, 0)).toEqual([[1, 0], [2, 0], [3, 0], [4, 0]]);
  });

  it("no incluye la casilla de salida", () => {
    const g = grid(["..."]);
    expect(findPath(g.w, g.h, g.passable, 0, 0, 1, 0)).toEqual([[1, 0]]);
  });

  it("rodea un muro", () => {
    const g = grid([
      ".#.",
      ".#.",
      "...",
    ]);
    const path = findPath(g.w, g.h, g.passable, 0, 0, 2, 0);
    expect(path[path.length - 1]).toEqual([2, 0]);
    expect(path.some(([x, y]) => x === 1 && y < 2)).toBe(false);
  });

  it("da el camino más corto, no el primero que encuentra", () => {
    const g = grid([
      ".....",
      ".###.",
      ".....",
    ]);
    expect(findPath(g.w, g.h, g.passable, 0, 0, 4, 0)).toHaveLength(4);
  });

  it("devuelve vacío si el destino está tapiado", () => {
    const g = grid([
      "..#",
      "..#",
      "..#",
    ]);
    expect(findPath(g.w, g.h, g.passable, 0, 0, 2, 1)).toEqual([]);
  });

  it("devuelve vacío cuando ya estás en el destino", () => {
    const g = grid(["..."]);
    expect(findPath(g.w, g.h, g.passable, 1, 0, 1, 0)).toEqual([]);
  });
});
