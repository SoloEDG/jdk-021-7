/* 仿真验证：不互穿 / 不死锁 / 近路更慢 / 断点拦截 / 完整搬运链 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createGame } from "../src/shared/initial";
import { runBenchmark } from "../src/features/flow/model/benchmark";
import { validateLayout, key, buildGrid, PRESET_A, bfs } from "../src/features/flow/lib/grid";
import { stepMovement } from "../src/features/flow/lib/movement";
import type { Chef, Grid, Task } from "../src/shared/types";
import { tickFlow } from "../src/features/flow/model/engine";
import {
  enqueuePrepare,
  enqueueCook,
  enqueueLift,
  cancelTask,
} from "../src/features/flow/model/tasks";

function cloneGrid(g: Grid): Grid {
  return JSON.parse(JSON.stringify(g)) as Grid;
}
function makeChefs(grid: Grid): Chef[] {
  return grid.starts.map((s, i) => ({
    id: i + 1,
    name: `c${i + 1}`,
    x: s.x,
    y: s.y,
    path: [],
    trail: [],
    taskId: null,
    mode: "idle",
    waitReason: "",
    blockedTicks: 0,
    reroutes: 0,
    backtracks: 0,
    routing: "auto",
    avoid: [],
  }));
}

test("基准：近路迎头拥堵比绕远路更慢", () => {
  const r = runBenchmark();
  assert.ok(r.shortest.ticks > r.detour.ticks,
    `期望绕行更快，实际近路 ${r.shortest.ticks} vs 绕行 ${r.detour.ticks}`);
  assert.ok(r.shortest.waits > 0, "近路模式应当发生等待");
});

test("窄道迎面：绝不互换位置，且两人都能到达", () => {
  const stoves = [
    { id: 1, kind: "pan" as const, portion: null, started: 0 },
    { id: 2, kind: "pan" as const, portion: null, started: 0 },
    { id: 3, kind: "pot" as const, portion: null, started: 0 },
  ];
  const grid = cloneGrid(buildGrid(PRESET_A, stoves));
  // 在门两侧等距放对穿任务，最短路径在 4,3 迎头相遇
  const chefs = makeChefs(grid);
  chefs[0].x = 4; chefs[0].y = 4;
  chefs[1].x = 4; chefs[1].y = 2;
  const tasks: Task[] = [
    { id: 1, chef: 1, type: "prepare", dest: "4,1", chain: 1, leg: 0, note: "a" },
    { id: 2, chef: 2, type: "prepare", dest: "4,5", chain: 2, leg: 0, note: "b" },
  ];
  chefs[0].taskId = 1;
  chefs[1].taskId = 2;
  let prev = new Map(chefs.map((c) => [c.id, key(c.x, c.y)]));
  for (let tick = 0; tick < 300 && tasks.length; tick++) {
    stepMovement({ grid, chefs, tasks }, (chef) => {
      const idx = tasks.findIndex((t) => t.id === chef.taskId);
      if (idx >= 0) tasks.splice(idx, 1);
      chef.taskId = null;
    });
    const p0 = prev.get(1)!, p1 = prev.get(2)!;
    const n0 = key(chefs[0].x, chefs[0].y);
    const n1 = key(chefs[1].x, chefs[1].y);
    assert.ok(!(n0 === p1 && n1 === p0), "出现位置互换，厨师互相穿过了！");
    assert.notEqual(n0, n1, "两位厨师挤进了同一格");
    prev.set(1, n0);
    prev.set(2, n1);
  }
  assert.equal(tasks.length, 0, "存在永久等待（死锁）");
});

test("出口被封：校验返回断点并拒绝开餐条件", () => {
  const g = createGame();
  // 横墙有门(4,3)和两端绕行口(1,3)(8,3)，全部封住后上下两区断开
  g.grid.cells[3][4].type = "wall";
  assert.equal(validateLayout(g.grid).length, 0, "只封门时两端仍可绕行");
  g.grid.cells[3][1].type = "wall";
  g.grid.cells[3][8].type = "wall";
  const issues = validateLayout(g.grid);
  assert.ok(issues.length > 0, "全部封死后应出现断点");
  assert.ok(issues.every((i) => /^\d+,\d+$/.test(i.cell)), "断点必须标出格子坐标");
});

test("完整搬运链：备料→下锅→起锅→到传菜口，全程不瞬移", () => {
  const g = createGame();
  g.running = true;
  g.layoutIssues = [];
  enqueuePrepare(g, "steak");
  for (let i = 0; i < 400 && g.portions.filter((p) => p.loc === "prep").length === 0; i++) tickFlow(g);
  assert.equal(g.portions.length, 1);
  const portion = g.portions[0];
  assert.equal(portion.loc, "prep");

  enqueueCook(g, portion.id, 1);
  for (let i = 0; i < 600 && !g.stoves[0].portion; i++) tickFlow(g);
  assert.ok(g.stoves[0].portion, "食材没有到达灶台");
  assert.equal(g.portions.length, 0, "下锅后备料台应清空该份");

  g.time += g.stoves[0].started + 12 - g.time; // 直接到最佳火候
  enqueueLift(g, 1);
  for (let i = 0; i < 600 && !g.dishes.some((d) => d.loc === "counter"); i++) tickFlow(g);
  const dish = g.dishes[0];
  assert.ok(dish, "没有产出菜品");
  assert.equal(dish.loc, "counter");
  assert.equal(dish.quality, 100, "最佳火候应得 100 品质");
  assert.equal(g.tasks.length, 0, "任务链应全部完成");
});

test("手持唯一：同一份备料不能重复下锅", () => {
  const g = createGame();
  g.running = true;
  g.layoutIssues = [];
  enqueuePrepare(g, "steak");
  for (let i = 0; i < 400 && g.portions.length === 0; i++) tickFlow(g);
  const id = g.portions[0].id;
  enqueueCook(g, id, 1);
  // 立即再派一次（此时可能已被取走或预留）
  enqueueCook(g, id, 2);
  const cookChains = g.tasks.filter((t) => t.type.startsWith("cook"));
  const chains = new Set(cookChains.map((t) => t.chain));
  assert.ok(chains.size <= 1, "同一份食材出现了两条搬运链，归属不唯一");
});

test("BFS 可达性与封路一致", () => {
  const g = createGame();
  const before = bfs(g.grid, "1,5", "8,1");
  assert.ok(before.length > 0);
  // 封门但留两端：仍可达，路径不会变短
  g.grid.cells[3][4].type = "wall";
  const after = bfs(g.grid, "1,5", "8,1");
  assert.ok(after.length > 0 && after.length >= before.length);
  // 三个口全封：不可达
  g.grid.cells[3][1].type = "wall";
  g.grid.cells[3][8].type = "wall";
  const none = bfs(g.grid, "1,5", "8,1");
  assert.equal(none.length, 0);
});

test("取消在途搬运：手持食材回到备料台，不消失不瞬移", () => {
  const g = createGame();
  g.running = true;
  g.layoutIssues = [];
  enqueuePrepare(g, "steak");
  for (let i = 0; i < 400 && g.portions.length === 0; i++) tickFlow(g);
  const id = g.portions[0].id;
  enqueueCook(g, id, 1);
  // 逐拍推进，一旦食材进入手持状态立刻取消该任务链
  let cancelled = false;
  for (let i = 0; i < 400 && !cancelled; i++) {
    tickFlow(g);
    if (g.portions.some((p) => p.id === id && p.loc === "carried")) {
      const taskId = g.tasks.find((t) => t.refId === id)!.id;
      cancelTask(g, taskId);
      cancelled = true;
    }
  }
  assert.ok(cancelled, "应能在搬运途中取消");
  const p = g.portions.find((x) => x.id === id);
  assert.ok(p, "取消后食材不能消失");
  assert.equal(p!.loc, "prep");
  assert.equal(p!.carrier, undefined);
  assert.equal(g.chefs.every((c) => c.taskId === null), true);
});
