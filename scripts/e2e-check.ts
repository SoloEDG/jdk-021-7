/* 完整营业局仿真：接单→备料→下锅→起锅→装盘→上菜→收益，及挪设备守卫 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createGame } from "../src/shared/initial";
import { tickFlow } from "../src/features/flow/model/engine";
import { accept, expire } from "../src/features/orders/model/orders";
import {
  enqueuePrepare,
  enqueueCook,
  enqueueLift,
  enqueuePlate,
  enqueueServe,
  enqueueRestock,
} from "../src/features/flow/model/tasks";
import { applyEdit, loadPreset } from "../src/features/flow/model/editor";
import { passCell } from "../src/features/flow/lib/grid";
import { deliver } from "../src/features/service/model/delivery";

function runUntil(g: Game, cond: () => boolean, cap = 2000) {
  for (let i = 0; i < cap && !cond(); i++) {
    g.time = Math.round((g.time + 0.1) * 10) / 10;
    tickFlow(g);
    expire(g);
  }
  assert.ok(cond(), "条件在限定时间内未达成");
}

test("完整出餐链路并产生销售收入", () => {
  const g = createGame();
  g.running = true;
  g.layoutIssues = [];
  accept(g, 1); // 牛排
  g.selectedOrder = 1;

  enqueuePrepare(g, "steak");
  runUntil(g, () => g.portions.filter((p) => p.loc === "prep").length === 1);
  const portion = g.portions[0];

  enqueueCook(g, portion.id, 1);
  runUntil(g, () => !!g.stoves[0].portion);
  const start = g.stoves[0].started;

  // 厨师赶路期间火候持续：到点后厨师走过去起锅，路上加热不中断，
  // 因此品质允许因赶路略低于 100（验证“赶路不停火”）
  g.time = Math.round((start + 12) * 10) / 10;
  enqueueLift(g, 1);
  runUntil(g, () => g.dishes.some((d) => d.loc === "counter"));
  const dish = g.dishes[0];
  assert.ok(dish.quality >= 88 && dish.quality <= 100, `品质异常：${dish.quality}`);

  enqueuePlate(g, dish.id);
  runUntil(g, () => g.dishes.some((d) => d.stage === "plated"));
  g.selectedDish = g.dishes[0].id;

  const before = g.entries.filter((e) => e.kind === "sale").length;
  enqueueServe(g);
  runUntil(g, () => g.entries.filter((e) => e.kind === "sale").length === before + 1);
  assert.equal(g.served, 1);
  assert.equal(g.combo, 1);
  const sale = g.entries.find((e) => e.kind === "sale")!;
  assert.ok(sale.amount > 0);
  assert.equal(g.dishes.length, 0);
});

test("营业中挪设备：占用灶与在途任务被拦截/撤回，食材不瞬移", () => {
  const g = createGame();
  g.running = true;
  g.layoutIssues = [];
  // (2,2) 是可通行空地
  assert.equal(g.grid.cells[2][2].type, "floor");

  // 空设备可以直接挪：煎锅01 在 (3,5) → (2,2)
  applyEdit(g, "move", 2, 2, 3, 5);
  assert.equal(g.grid.cells[5][3].type, "floor");
  assert.equal(g.grid.cells[2][2].type, "stove");

  // 挪回去
  applyEdit(g, "move", 3, 5, 2, 2);
  assert.equal(g.grid.cells[5][3].type, "stove");

  // 灶上有菜：拒绝
  enqueuePrepare(g, "steak");
  runUntil(g, () => g.portions.length === 1);
  enqueueCook(g, g.portions[0].id, 1);
  runUntil(g, () => !!g.stoves[0].portion);
  applyEdit(g, "move", 2, 2, 3, 5);
  assert.ok(g.stoves[0].portion, "占用灶不应被移动");
  assert.equal(g.grid.cells[5][3].type, "stove");

  // 起锅后在途任务指向传菜口：挪传菜口会先撤回任务，菜不消失
  g.time = g.stoves[0].started + 12;
  enqueueLift(g, 1);
  const pass = passCell(g.grid);
  const freeFloor = g.grid.cells[2][2];
  assert.equal(freeFloor.type, "floor");
  const dishCountBefore = g.dishes.length;
  applyEdit(g, "move", 2, 2, pass.x, pass.y);
  for (const d of g.dishes) {
    assert.ok(d.loc === "counter", "手持菜必须放回台面，不能瞬移或消失");
  }
  assert.ok(g.dishes.length >= dishCountBefore || g.stoves[0].portion);
});

test("采购任务也由厨师走路完成并记账", () => {
  const g = createGame();
  g.running = true;
  g.layoutIssues = [];
  const beef0 = g.stock.beef;
  enqueueRestock(g, "beef");
  runUntil(g, () => g.stock.beef === Math.min(12, beef0 + 3));
  assert.ok(g.entries.some((e) => e.kind === "supply"));
  assert.equal(g.tasks.length, 0);
});

test("deliver 错配规则保持原样", () => {
  const g = createGame();
  g.running = true;
  g.layoutIssues = [];
  accept(g, 1); // 牛排订单
  g.selectedOrder = 1;
  // 造一份意面成品并装盘
  g.dishes.push({
    id: 99,
    recipe: "pasta",
    quality: 90,
    cookedAt: g.time,
    stage: "plated",
    loc: "counter",
  });
  g.selectedDish = 99;
  const dl = g.orders[0].deadline;
  deliver(g);
  assert.equal(g.orders[0].deadline, Math.max(g.time, dl - 10));
  assert.equal(g.combo, 0);
  assert.equal(g.dishes.length, 1, "错配的菜应留在传菜口");
});

test("营业中砌墙被拒绝，暂停时可砌墙并标出断点", () => {
  const g = createGame();
  g.running = true;
  g.layoutIssues = [];
  applyEdit(g, "wall", 2, 2);
  assert.equal(g.grid.cells[2][2].type, "floor", "营业中不能砌墙");
  g.running = false;
  applyEdit(g, "wall", 4, 3);
  applyEdit(g, "wall", 1, 3);
  applyEdit(g, "wall", 8, 3);
  assert.ok(g.layoutIssues.length > 0, "封死所有通道后必须出现断点");
});

test("营业中整体换布局被拒，厨师站位不可封死", () => {
  const g = createGame();
  g.running = true;
  g.layoutIssues = [];
  const pantryType = g.grid.cells[1][1].type;
  loadPreset(g, "B");
  assert.equal(g.grid.cells[1][1].type, pantryType, "营业中不能换布局");
  g.running = false;
  applyEdit(g, "wall", 1, 5);
  assert.notEqual(g.grid.cells[5][1].type, "wall", "出生站位不能封");
});

test("高负载：任务超出厨师数时排队，随后全部被领取完成", () => {
  const g = createGame();
  g.running = true;
  g.layoutIssues = [];
  g.stock = { beef: 12, noodle: 12, greens: 12 };
  // 一次派 5 个备料任务，两位厨师必然排队
  for (let i = 0; i < 5; i++) enqueuePrepare(g, "salad");
  const queued = g.tasks.filter((t) => t.chef === null).length;
  assert.ok(queued > 0, "应有任务进入待分配队列");
  runUntil(g, () => g.portions.filter((p) => p.loc === "prep").length === 5, 4000);
  assert.equal(g.tasks.length, 0, "所有排队任务最终都应完成");
  assert.equal(g.portions.length, 5);
});
