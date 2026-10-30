/** Un rectángulo del mapa. Phaser.Geom.Rectangle encaja aquí sin convertir nada. */
export interface Rect { x: number; y: number; width: number; height: number }

/** Semiabierto por arriba y por la izquierda, para que dos rectángulos pegados no se peleen por el borde. */
export const contains = (r: Rect, x: number, y: number) =>
  x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;

/**
 * La zona de un punto: el id de la casa que lo contiene, "yard" o "out".
 * Es lo que el Director usa para saber si te están viendo y desde dónde.
 */
export function zoneAt(houses: Record<string, Rect>, yard: Rect | undefined, x: number, y: number): string {
  for (const id in houses) if (contains(houses[id], x, y)) return id;
  return yard && contains(yard, x, y) ? "yard" : "out";
}
