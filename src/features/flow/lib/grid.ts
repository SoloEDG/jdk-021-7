import type {
  Cell,
  Grid,
  LayoutIssue,
  Stove,
} from "../../../shared/types";

export const GRID_W = 10;
export const GRID_H = 7;
/** 两个厨师的出生点（固定） */
export const STARTS = [
  { x: 1, y: 5 },
  { x: 8, y: 5 },
];

export function key(x: number, y: number) {
  return `${x},${y}`;
}
export function parseKey(k: string): { x: number; y: number } {
  const [x, y] = k.split(",").map(Number);
  return { x, y };
}
export function cellAt(g: Grid, x: number, y: number): Cell | null {
  if (x < 0 || y < 0 || x >= g.w || y >= g.h) return null;
  return g.cells[y][x];
}
export function isWalkable(c: Cell | null) {
  return !!c && c.type !== "wall";
}
export function neighbors4(g: Grid, k: string): string[] {
  const { x, y } = parseKey(k);
  const out: string[] = [];
  for (const [dx, dy] of [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ]) {
    const c = cellAt(g, x + dx, y + dy);
    if (isWalkable(c)) out.push(c!.x + "," + c!.y);
  }
  return out;
}

/** 固定的邻接顺序，保证 BFS 结果可复现（用于拥堵基准对照） */
const DIRS: [number, number][] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

export function bfs(
  g: Grid,
  from: string,
  to: string,
  avoid: string[] = [],
): string[] {
  if (from === to) return [];
  const blocked = new Set(avoid);
  const prev = new Map<string, string>();
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === to) break;
    const { x, y } = parseKey(cur);
    for (const [dx, dy] of DIRS) {
      const c = cellAt(g, x + dx, y + dy);
      if (!c || !isWalkable(c)) continue;
      const nk = key(c.x, c.y);
      if (seen.has(nk) || (nk !== to && blocked.has(nk))) continue;
      seen.add(nk);
      prev.set(nk, cur);
      queue.push(nk);
    }
  }
  if (!seen.has(to)) return [];
  const path: string[] = [];
  let cur = to;
  while (cur !== from) {
    path.unshift(cur);
    cur = prev.get(cur)!;
  }
  return path;
}

export function reachable(g: Grid, from: string, targets: string[]) {
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const nk of neighbors4(g, cur)) {
      if (!seen.has(nk)) {
        seen.add(nk);
        queue.push(nk);
      }
    }
  }
  return targets.filter((t) => !seen.has(t));
}

function emptyCells(): Cell[][] {
  const cells: Cell[][] = [];
  for (let y = 0; y < GRID_H; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < GRID_W; x++) {
      const border = x === 0 || y === 0 || x === GRID_W - 1 || y === GRID_H - 1;
      row.push({ x, y, type: border ? "wall" : "floor" });
    }
    cells.push(row);
  }
  return cells;
}

export interface PresetDef {
  id: "A" | "B" | "C";
  name: string;
  desc: string;
  walls: [number, number][];
  stations: {
    pantry: [number, number];
    prep: [number, number];
    pass: [number, number];
    stoves: { id: number; kind: "pan" | "pot"; at: [number, number] }[];
  };
}

/**
 * A：横墙只留一扇 1 格宽的门（近路），墙两端可绕远路。
 * 两人在门口迎头相遇时只能后退让行，实测比直接绕远路更慢（见基准对照）。
 */
export const PRESET_A: PresetDef = {
  id: "A",
  name: "近路拥堵型",
  desc: "横墙单门是近路，两人迎面相遇只能后退让行",
  walls: [
    [2, 3],
    [3, 3],
    [5, 3],
    [6, 3],
    [7, 3],
  ],
  stations: {
    pantry: [1, 1],
    prep: [2, 1],
    pass: [8, 1],
    stoves: [
      { id: 1, kind: "pan", at: [3, 5] },
      { id: 2, kind: "pan", at: [6, 5] },
      { id: 3, kind: "pot", at: [7, 4] },
    ],
  },
};

/** B：开阔绕行型，没有窄过道，几乎不会堵 */
export const PRESET_B: PresetDef = {
  id: "B",
  name: "开阔绕行型",
  desc: "大厅畅通，路线略长但不必让行",
  walls: [],
  stations: {
    pantry: [1, 1],
    prep: [2, 1],
    pass: [7, 5],
    stoves: [
      { id: 1, kind: "pan", at: [3, 3] },
      { id: 2, kind: "pan", at: [5, 3] },
      { id: 3, kind: "pot", at: [7, 3] },
    ],
  },
};

/** C：高墙迷宫型，通道多但出口唯一 */
export const PRESET_C: PresetDef = {
  id: "C",
  name: "高墙迷宫型",
  desc: "多段窄道，适合练习改派与让行",
  walls: [
    [2, 2],
    [3, 2],
    [4, 2],
    [6, 2],
    [7, 2],
    [2, 4],
    [4, 4],
    [5, 4],
    [7, 4],
    [2, 5],
    [4, 5],
  ],
  stations: {
    pantry: [1, 1],
    prep: [1, 3],
    pass: [8, 5],
    stoves: [
      { id: 1, kind: "pan", at: [3, 4] },
      { id: 2, kind: "pan", at: [6, 4] },
      { id: 3, kind: "pot", at: [8, 2] },
    ],
  },
};

export const PRESETS: Record<"A" | "B" | "C", PresetDef> = {
  A: PRESET_A,
  B: PRESET_B,
  C: PRESET_C,
};

export function buildGrid(p: PresetDef, stoves: Stove[]): Grid {
  const cells = emptyCells();
  const set = (x: number, y: number, type: Cell["type"], extra?: Partial<Cell>) =>
    Object.assign(cells[y][x], { type, ...extra });
  for (const [x, y] of p.walls) set(x, y, "wall");
  set(...p.stations.pantry, "pantry");
  set(...p.stations.prep, "prep");
  set(...p.stations.pass, "pass");
  for (const s of p.stations.stoves) {
    const live = stoves.find((v) => v.id === s.id);
    set(s.at[0], s.at[1], "stove", {
      stoveId: s.id,
      stoveKind: live?.kind ?? s.kind,
    });
  }
  return { w: GRID_W, h: GRID_H, cells, starts: STARTS.map((s) => ({ ...s })) };
}

/** 所有关键功能格（设备移动后仍需彼此连通） */
export function stationKeys(g: Grid) {
  const keys: string[] = [];
  for (const row of g.cells)
    for (const c of row)
      if (c.type !== "floor" && c.type !== "wall") keys.push(key(c.x, c.y));
  return keys;
}

/**
 * 开餐前 / 每次编辑后校验：出口（传菜口）与所有设备、两位厨师的出生点
 * 必须在同一连通域，否则拒绝开餐并标出断点。
 */
export function validateLayout(g: Grid): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  const pass = g.cells.flat().find((c) => c.type === "pass");
  if (!pass) {
    issues.push({ cell: "-", label: "传菜口", reason: "缺少传菜口，无法上菜" });
    return issues;
  }
  const missing = reachable(g, key(pass.x, pass.y), [
    ...stationKeys(g).filter((k) => k !== key(pass.x, pass.y)),
    ...g.starts.map((s) => key(s.x, s.y)),
  ]);
  for (const k of missing) {
    const { x, y } = parseKey(k);
    const c = cellAt(g, x, y)!;
    const label =
      c.type === "pantry"
        ? "食材库"
        : c.type === "prep"
          ? "备料台"
          : c.type === "stove"
            ? `${c.stoveKind === "pan" ? "煎锅" : "汤锅"} 0${c.stoveId}`
            : "厨师站位";
    issues.push({
      cell: k,
      label,
      reason: `与传菜口不连通（断点：${k}），出口被封时无法开餐`,
    });
  }
  return issues;
}

export function findCell(g: Grid, pred: (c: Cell) => boolean) {
  return g.cells.flat().find(pred) ?? null;
}
export function pantryCell(g: Grid) {
  return findCell(g, (c) => c.type === "pantry")!;
}
export function prepCell(g: Grid) {
  return findCell(g, (c) => c.type === "prep")!;
}
export function passCell(g: Grid) {
  return findCell(g, (c) => c.type === "pass")!;
}
export function stoveCell(g: Grid, stoveId: number) {
  return findCell(g, (c) => c.type === "stove" && c.stoveId === stoveId)!;
}
