import type {
  CarryRef,
  Chef,
  Game,
  Ingredient,
  Portion,
  RecipeId,
  Task,
  TaskType,
} from "../../../shared/types";
import { ingredients, recipes } from "../../../shared/catalog";
import {
  bfs,
  key,
  pantryCell,
  passCell,
  prepCell,
  stoveCell,
} from "../lib/grid";
import { planPath } from "../lib/movement";
import { deliver } from "../../service/model/delivery";

/* ---------------- 派任务：每个业务动作变成一条厨师搬运链 ---------------- */

function chefDist(g: Game, chef: Chef, dest: string) {
  const p = bfs(g.grid, key(chef.x, chef.y), dest);
  return key(chef.x, chef.y) === dest ? 0 : p.length;
}

function isChefFree(g: Game, chefId: number, chainId: number) {
  if (g.tasks.some((t) => t.chef === chefId && t.chain === chainId)) return false;
  const chef = g.chefs.find((c) => c.id === chefId)!;
  // 手上有活动任务，或队列里已挂着未开始的任务，都算忙碌
  if (chef.taskId !== null) return false;
  if (g.tasks.some((t) => t.chef === chefId)) return false;
  return true;
}

/** 选最近的空闲厨师；都在忙则返回 null，任务进队列等待 assignPending 领取 */
function pickChef(g: Game, dest: string, chainId: number): number | null {
  const free = g.chefs.filter((c) => isChefFree(g, c.id, chainId));
  if (!free.length) return null;
  return free
    .map((c) => ({ id: c.id, d: chefDist(g, c, dest) }))
    .sort((a, b) => a.d - b.d)[0].id;
}

function addLeg(
  g: Game,
  chefId: number | null,
  type: TaskType,
  dest: string,
  chain: number,
  leg: number,
  note: string,
  extra: Partial<Task> = {},
) {
  g.tasks.push({
    id: g.nextId++,
    chef: chefId,
    type,
    dest,
    chain,
    leg,
    note,
    ...extra,
  });
}

export function enqueueRestock(g: Game, ingredient: Ingredient) {
  if (g.stock[ingredient] >= 12) {
    g.notice = "库存充足，上限12份";
    return;
  }
  const chain = g.nextId++;
  const dest = key(pantryCell(g.grid).x, pantryCell(g.grid).y);
  const chef = pickChef(g, dest, chain);
  addLeg(g, chef, "restock", dest, chain, 0, `采购${ingredients[ingredient].name}`, {
    ingredient,
  });
  g.notice = `已安排厨师前往食材库采购${ingredients[ingredient].name}，走路计入营业时间`;
}

export function enqueuePrepare(g: Game, recipe: RecipeId) {
  if (g.portions.filter((p) => p.loc === "prep").length >= 6) {
    g.notice = "备料台已满（6份）";
    return;
  }
  if (g.stock[recipes[recipe].ingredient] < 1) {
    g.notice = "食材不足，请先采购";
    return;
  }
  const chain = g.nextId++;
  const dest = key(prepCell(g.grid).x, prepCell(g.grid).y);
  const chef = pickChef(g, dest, chain);
  addLeg(g, chef, "prepare", dest, chain, 0, `备料：${recipes[recipe].name}`, {
    recipe,
  });
  g.notice = `厨师正前往备料台准备${recipes[recipe].name}`;
}

export function enqueueCook(g: Game, portionId: number, stoveId: number) {
  const p = g.portions.find((x) => x.id === portionId);
  const s = g.stoves.find((x) => x.id === stoveId);
  if (!p || !s || s.portion) return;
  if (p.loc === "carried") {
    g.notice = "这份食材正被厨师端着，归属唯一，不能再派给别人";
    return;
  }
  if (p.reservedBy) {
    g.notice = "这份食材已有厨师负责，归属唯一，不能重复派单";
    return;
  }
  if (recipes[p.recipe].station !== s.kind) {
    g.notice = "设备不匹配：意面用汤锅，牛排和沙拉用煎锅";
    return;
  }
  const chain = g.nextId++;
  const from = key(prepCell(g.grid).x, prepCell(g.grid).y);
  const to = key(stoveCell(g.grid, stoveId).x, stoveCell(g.grid, stoveId).y);
  const chef = pickChef(g, from, chain);
  const carry: CarryRef = { kind: "portion", id: p.id };
  if (chef !== null) p.reservedBy = chef;
  addLeg(g, chef, "cook-pick", from, chain, 0, `取${recipes[p.recipe].name}`, {
    refId: p.id,
    carry,
    recipe: p.recipe,
  });
  addLeg(g, chef, "cook-drop", to, chain, 1, `送上${s.kind === "pan" ? "煎锅" : "汤锅"}0${s.id}`, {
    refId: p.id,
    carry,
    recipe: p.recipe,
  });
  g.notice = `厨师先去备料台取食材，再送到${s.kind === "pan" ? "煎锅" : "汤锅"}0${stoveId}`;
}

export function enqueueLift(g: Game, stoveId: number) {
  const s = g.stoves.find((x) => x.id === stoveId);
  if (!s?.portion) return;
  if (g.dishes.filter((d) => d.loc === "counter").length >= 8) {
    g.notice = "传菜口已满，请先装盘或丢弃";
    return;
  }
  const chain = g.nextId++;
  const from = key(stoveCell(g.grid, stoveId).x, stoveCell(g.grid, stoveId).y);
  const to = key(passCell(g.grid).x, passCell(g.grid).y);
  const chef = pickChef(g, from, chain);
  const carry: CarryRef = { kind: "dish", id: s.portion.id };
  addLeg(g, chef, "lift-pick", from, chain, 0, `从${s.kind === "pan" ? "煎锅" : "汤锅"}0${s.id}起锅`, {
    refId: s.portion.id,
    recipe: s.portion.recipe,
  });
  addLeg(g, chef, "lift-drop", to, chain, 1, "端到传菜口", {
    refId: s.portion.id,
    carry,
    recipe: s.portion.recipe,
  });
  g.notice = "厨师正赶来起锅，锅中的加热不会中断";
}

export function enqueuePlate(g: Game, dishId: number) {
  const d = g.dishes.find((x) => x.id === dishId);
  if (!d || d.stage !== "counter" || d.loc === "carried") return;
  const chain = g.nextId++;
  const dest = key(passCell(g.grid).x, passCell(g.grid).y);
  const chef = pickChef(g, dest, chain);
  addLeg(g, chef, "plate", dest, chain, 0, "装盘", { refId: d.id });
}

export function enqueueDiscard(g: Game, dishId: number) {
  const d = g.dishes.find((x) => x.id === dishId);
  if (!d) return;
  const chain = g.nextId++;
  const dest = key(passCell(g.grid).x, passCell(g.grid).y);
  const chef = pickChef(g, dest, chain);
  addLeg(g, chef, "discard", dest, chain, 0, "丢弃菜品", { refId: d.id });
}

export function enqueueServe(g: Game) {
  const dish = g.dishes.find((d) => d.id === g.selectedDish);
  const order = g.orders.find(
    (o) => o.id === g.selectedOrder && o.status === "accepted",
  );
  if (!dish || dish.stage !== "plated" || !order) {
    g.notice = "请选择已装盘菜品和已接订单";
    return;
  }
  const chain = g.nextId++;
  const dest = key(passCell(g.grid).x, passCell(g.grid).y);
  const chef = pickChef(g, dest, chain);
  addLeg(g, chef, "serve", dest, chain, 0, `上菜给${order.guest}`, {
    refId: dish.id,
  });
}

/* ---------------- 任务取消与改派（食品归属唯一，不瞬移） ---------------- */

export function cancelTask(g: Game, id: number) {
  const t = g.tasks.find((x) => x.id === id);
  if (!t) return;
  const chain = t.chain;
  const removed = g.tasks.filter((x) => x.chain === chain);
  // 手持中的食品：按类型放回当前所在台面/设备，绝不瞬移
  for (const chef of g.chefs) {
    const active = removed.find((rt) => rt.id === chef.taskId);
    if (!active) continue;
    if (active.carry) returnCarry(g, active.carry, chef, active);
  }
  g.tasks = g.tasks.filter((x) => x.chain !== chain);
  for (const c of g.chefs) {
    if (c.taskId && removed.some((x) => x.id === c.taskId)) {
      c.taskId = null;
      c.path = [];
      c.avoid = [];
      c.mode = "idle";
      c.waitReason = "";
      c.blockedTicks = 0;
    }
  }
  // 释放已无任务引用的备料预留
  for (const p of g.portions) {
    if (p.reservedBy && g.tasks.every((x) => x.refId !== p.id))
      p.reservedBy = undefined;
  }
  g.notice = `已取消任务链 #${chain}，食品保留在原位置`;
}

/** 把厨师手持的食品放回它被拿起的地方（备料台 / 传菜口），不发生瞬移 */
function returnCarry(g: Game, carry: CarryRef, chef: Chef, active: Task) {
  if (carry.kind === "portion") {
    const p = g.portions.find((x) => x.id === carry.id);
    if (p && p.loc === "carried") {
      p.loc = "prep";
      p.carrier = undefined;
      p.reservedBy = undefined;
    }
  } else {
    const d = g.dishes.find((x) => x.id === carry.id);
    if (d && d.loc === "carried") {
      d.loc = "counter";
      d.carrier = undefined;
      // 若在起锅取菜的当口取消，菜尚未端离灶台区域，仍作为成品留在传菜口队列
      void active;
    }
  }
  void chef;
}

export function reassignTask(g: Game, id: number, chefId: number) {
  const t = g.tasks.find((x) => x.id === id);
  if (!t || t.chef === chefId) return;
  if (t.carry) {
    const holder = g.chefs.find((c) => c.taskId === id);
    if (holder) {
      g.notice = "食品正在厨师手上，归属唯一，须先完成或取消当前搬运";
      return;
    }
  }
  const chainTasks = g.tasks.filter((x) => x.chain === t.chain);
  // 整条未开始的链一起改派；已在执行中的腿不可抢
  if (chainTasks.some((x) => g.chefs.some((c) => c.taskId === x.id))) {
    g.notice = "该任务已在搬运途中，不能中途抢单";
    return;
  }
  for (const x of chainTasks) {
    x.chef = chefId;
    if (x.refId) {
      const p = g.portions.find((v) => v.id === x.refId);
      if (p) p.reservedBy = chefId;
    }
  }
  const chef = g.chefs.find((c) => c.id === chefId);
  if (chef) chef.avoid = [];
  g.notice = `已改派给${chef?.name ?? "厨师"}，食品归属随任务一并转移`;
}

/* ---------------- 厨师手动策略 ---------------- */

export function setChefRouting(g: Game, chefId: number, routing: Chef["routing"]) {
  const c = g.chefs.find((x) => x.id === chefId);
  if (!c) return;
  c.routing = routing;
  c.avoid = [];
  // 立即按新策略重算一次路径
  const task = g.tasks.find((t) => t.id === c.taskId);
  if (task) {
    const p = planPath(g.grid, c, task.dest);
    c.path = p;
    c.blockedTicks = 0;
  }
  g.notice =
    routing === "detour"
      ? `${c.name} 将优先绕远路避开拥堵`
      : routing === "hold"
        ? `${c.name} 将原地等待通道让行（超时仍会自动绕行，不会永久等待）`
        : `${c.name} 恢复自动避让`;
}

/* ---------------- 调度：空闲厨师领取待分配任务 ---------------- */

export function assignPending(g: Game) {
  for (const t of g.tasks) {
    if (t.chef !== null) continue;
    if (t.leg > 0) continue; // 链内后续腿在 onArrive 时绑定
    const chef = pickChef(g, t.dest, t.chain);
    if (chef === null) continue; // 两位厨师仍在忙，下一拍再领
    // 整条链一起绑定，保证后续腿与食品不换手
    for (const leg of g.tasks.filter((x) => x.chain === t.chain)) leg.chef = chef;
    if (t.refId) {
      const p = g.portions.find((v) => v.id === t.refId);
      if (p && p.loc === "prep") p.reservedBy = chef;
    }
  }
}

/* ---------------- 到达执行：把业务效果放在厨师站定的格子上 ---------------- */

export function handleArrive(g: Game, chef: Chef, t: Task) {
  const nextLeg = g.tasks.find((x) => x.chain === t.chain && x.leg === t.leg + 1);
  switch (t.type) {
    case "restock": {
      const ing = t.ingredient!;
      g.stock[ing] = Math.min(12, g.stock[ing] + 3);
      g.entries.push({
        id: g.nextId++,
        time: g.time,
        label: `采购${ingredients[ing].name} ×3`,
        amount: -ingredients[ing].cost * 3,
        kind: "supply",
      });
      g.notice = `${chef.name} 采购到位，费用计入账本`;
      break;
    }
    case "prepare": {
      const r = t.recipe!;
      g.stock[recipes[r].ingredient]--;
      const portion: Portion = {
        id: g.nextId++,
        recipe: r,
        preparedAt: g.time,
        loc: "prep",
      };
      g.portions.push(portion);
      g.notice = `${chef.name} 完成${recipes[r].name}备料，放在备料台`;
      break;
    }
    case "cook-pick": {
      const p = g.portions.find((x) => x.id === t.refId);
      // 食材可能已被其他链路取走或消失：作废本腿，避免空引用
      if (!p || p.loc !== "prep") {
        g.notice = "目标食材已不在备料台，该搬运单作废";
        break;
      }
      p.loc = "carried";
      p.carrier = chef.id;
      p.reservedBy = chef.id;
      break;
    }
    case "cook-drop": {
      const p = g.portions.find((x) => x.id === t.refId);
      if (!p) {
        g.notice = "手持食材已不存在，该搬运单作废";
        break;
      }
      const stove = g.stoves.find(
        (s) => s.id === g.grid.cells.flat().find((c) => c.x === chef.x && c.y === chef.y)?.stoveId,
      );
      if (!stove) {
        g.notice = "灶台已被移走，食材放回备料台";
        p.loc = "prep";
        p.carrier = undefined;
        break;
      }
      if (stove.portion) {
        g.notice = "灶台已被占用，食材带回备料台";
        p.loc = "prep";
        p.carrier = undefined;
        break;
      }
      g.portions = g.portions.filter((x) => x.id !== p.id);
      stove.portion = p;
      stove.started = g.time;
      p.loc = "prep";
      p.carrier = undefined;
      p.reservedBy = undefined;
      g.notice = `${chef.name} 已将${recipes[p.recipe].name}下锅，火候开始计时`;
      break;
    }
    case "lift-pick": {
      const cell = g.grid.cells.flat().find((c) => c.x === chef.x && c.y === chef.y)!;
      const stove = g.stoves.find((s) => s.id === cell.stoveId);
      if (!stove?.portion) break;
      const p = stove.portion;
      const q = qualityOf(p.recipe, g.time - stove.started);
      g.dishes.push({
        id: p.id,
        recipe: p.recipe,
        quality: q,
        cookedAt: g.time,
        stage: "counter",
        loc: "carried",
        carrier: chef.id,
      });
      stove.portion = null;
      g.notice = `${chef.name} 起锅，品质 ${q}`;
      break;
    }
    case "lift-drop": {
      const d = g.dishes.find((x) => x.id === t.refId);
      if (d && d.loc === "carried") {
        d.loc = "counter";
        d.carrier = undefined;
        g.notice = `${chef.name} 把菜端到了传菜口`;
      }
      break;
    }
    case "plate": {
      const d = g.dishes.find((x) => x.id === t.refId);
      if (d && d.loc === "counter") {
        d.stage = "plated";
        g.selectedDish = d.id;
        g.notice = `${chef.name} 装盘完成`;
      }
      break;
    }
    case "discard": {
      const d = g.dishes.find((x) => x.id === t.refId);
      if (d) {
        g.dishes = g.dishes.filter((x) => x.id !== d.id);
        if (g.selectedDish === d.id) g.selectedDish = null;
        g.entries.push({
          id: g.nextId++,
          time: g.time,
          label: "丢弃菜品",
          amount: -3,
          kind: "waste",
        });
        g.notice = `${chef.name} 已丢弃，浪费成本 ¥3`;
      }
      break;
    }
    case "serve": {
      // 结算规则完全沿用原 service 模块（价格、品质、连击、错配惩罚）
      deliver(g);
      break;
    }
  }

  // 清理当前腿并接上后续腿（绑定同一位厨师，食品不换手）
  g.tasks = g.tasks.filter((x) => x.id !== t.id);
  chef.taskId = null;
  if (nextLeg && g.tasks.some((x) => x.id === nextLeg.id)) {
    nextLeg.chef = chef.id;
    chef.taskId = nextLeg.id;
    chef.path = planPath(g.grid, chef, nextLeg.dest);
    chef.avoid = [];
  }
}

function qualityOf(recipe: RecipeId, elapsed: number) {
  const target = recipes[recipe].target;
  return Math.max(0, Math.round(100 - Math.abs(elapsed - target) * 12));
}
