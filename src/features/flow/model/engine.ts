import type { Game } from "../../../shared/types";
import { bfs, cellAt, key, neighbors4 } from "../lib/grid";
import { planPath, stepMovement } from "../lib/movement";
import { assignPending, handleArrive } from "./tasks";

/**
 * 完工让位：空闲厨师若站在功能格上，会让后来者无法使用该设备。
 * 让其走到最近的普通地板格待命（不穿墙、不与他人抢位）。
 */
function yieldIdleChefs(g: Game) {
  for (const chef of g.chefs) {
    if (chef.taskId !== null || chef.path.length > 0) continue;
    const cell = cellAt(g.grid, chef.x, chef.y);
    if (!cell || cell.type === "floor") continue;
    // 找最近的空闲地板格
    let best: string | null = null;
    for (const n of neighbors4(g.grid, key(chef.x, chef.y))) {
      const [nx, ny] = n.split(",").map(Number);
      const nc = cellAt(g.grid, nx, ny)!;
      const occupied = g.chefs.some((c) => c.id !== chef.id && c.x === nx && c.y === ny);
      if (nc.type === "floor" && !occupied) {
        best = n;
        break;
      }
    }
    if (!best) {
      // 邻接没有空地，退而求其次：任意可达地板
      for (let r = 2; r <= 6 && !best; r++) {
        outer: for (let y = 0; y < g.grid.h; y++) {
          for (let x = 0; x < g.grid.w; x++) {
            const c = g.grid.cells[y][x];
            if (c.type !== "floor") continue;
            if (g.chefs.some((ch) => ch.x === x && ch.y === y)) continue;
            const p = bfs(g.grid, key(chef.x, chef.y), key(x, y));
            if (p.length && p.length <= r) {
              best = key(x, y);
              break outer;
            }
          }
        }
      }
    }
    if (best) {
      // 用一个内部“让位移动”：借空闲厨师的 path 走过去，不产生任务
      chef.path = planPath(g.grid, chef, best);
      chef.mode = "move";
    }
  }
}

/** 每个 0.1 秒推进一次：寻路、避让、到站执行任务 */
export function tickFlow(g: Game) {
  assignPending(g);
  // 厨师任务可能已被取消/完成，清理悬空引用
  for (const chef of g.chefs) {
    if (chef.taskId && !g.tasks.some((t) => t.id === chef.taskId)) {
      chef.taskId = null;
      chef.path = [];
      chef.avoid = [];
      chef.mode = "idle";
      chef.waitReason = "";
      chef.blockedTicks = 0;
    }
  }
  // 完工的厨师让出功能格，避免后来者永久等待
  yieldIdleChefs(g);
  stepMovement(g, (chef, task) => {
    handleArrive(g, chef, task);
  });
  // handleArrive 可能接上下一条链腿
  for (const chef of g.chefs) {
    if (!chef.taskId) {
      const next = g.tasks.find((t) => t.chef === chef.id);
      if (next) chef.taskId = next.id;
    }
  }
}
