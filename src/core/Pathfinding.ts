/** BFS sobre una rejilla. `passable(x,y)` decide qué tiles se pueden pisar. */
export function findPath(
  w: number, h: number, passable: (x: number, y: number) => boolean,
  sx: number, sy: number, tx: number, ty: number,
): [number, number][] {
  const key = (x: number, y: number) => y * w + x;
  const prev = new Map<number, number | null>();
  const queue: [number, number][] = [[sx, sy]];
  prev.set(key(sx, sy), null);
  while (queue.length) {
    const [x, y] = queue.shift()!;
    if (x === tx && y === ty) {
      const out: [number, number][] = [];
      let k: number | null = key(x, y);
      while (k !== null) { out.push([k % w, Math.floor(k / w)]); k = prev.get(k) ?? null; }
      return out.reverse().slice(1);
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (!passable(nx, ny) || prev.has(key(nx, ny))) continue;
      prev.set(key(nx, ny), key(x, y));
      queue.push([nx, ny]);
    }
  }
  return [];
}
