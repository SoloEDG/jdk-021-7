import type { Game, Command } from "../shared/types";
import { accept, expire } from "../features/orders";
import { prepare, restock } from "../features/pantry";
import { cook, lift } from "../features/kitchen";
import { plate, discard } from "../features/service";
import {
  enqueueServe,
  cancelTask,
  reassignTask,
  setChefRouting,
} from "../features/flow/model/tasks";
import { applyEdit, loadPreset } from "../features/flow/model/editor";
import { runBenchmark } from "../features/flow/model/benchmark";

/** 布局类操作在非营业时也允许；其余厨房操作必须在营业中 */
const EDIT_COMMANDS = new Set<Command["type"]>([
  "apply-edit",
  "load-preset",
  "run-bench",
  "chef-routing",
]);

export function dispatch(g: Game, c: Command) {
  if (!EDIT_COMMANDS.has(c.type) && (!g.running || g.ended)) {
    g.notice = "请先开始营业，暂停时不能操作厨房";
    return;
  }
  switch (c.type) {
    case "accept":
      accept(g, c.id);
      break;
    case "select-order":
      if (g.orders.some((o) => o.id === c.id && o.status === "accepted"))
        g.selectedOrder = c.id;
      break;
    case "prepare":
      prepare(g, c.recipe);
      break;
    case "restock":
      restock(g, c.ingredient);
      break;
    case "cook":
      cook(g, c.portion, c.stove);
      break;
    case "lift":
      lift(g, c.id);
      break;
    case "plate":
      plate(g, c.id);
      break;
    case "select-dish":
      if (g.dishes.some((d) => d.id === c.id && d.stage === "plated"))
        g.selectedDish = c.id;
      break;
    case "serve":
      enqueueServe(g);
      break;
    case "discard":
      discard(g, c.id);
      break;
    case "apply-edit":
      applyEdit(g, c.tool, c.x, c.y, c.sx, c.sy);
      break;
    case "load-preset":
      loadPreset(g, c.id);
      break;
    case "cancel-task":
      cancelTask(g, c.id);
      break;
    case "reassign-task":
      reassignTask(g, c.id, c.chef);
      break;
    case "chef-routing":
      setChefRouting(g, c.chef, c.routing);
      break;
    case "run-bench":
      g.bench = runBenchmark();
      g.notice = "基准对照已更新：查看近路拥堵与绕行的时间差";
      break;
  }
}
