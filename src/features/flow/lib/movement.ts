import type { Chef, Grid, Task } from "../../../shared/types";
import { bfs, key, parseKey } from "./grid";

export interface MoveWorld {
  grid: Grid;
  chefs: Chef[];
  tasks: Task[];
}

export const WAIT = {
  headOn: "窄道迎面相遇，等待让行",
  occupied: "目标格被占用，等待同伴离开",
  noPath: "当前路线走不通，正在绕行",
  hold: "手动等待通道让行中",
};

/** 依据厨师策略与回避表规划路径（任何模式下重规划都会绕开已记录的拥堵格） */
export function planPath(
  grid: Grid,
  chef: Chef,
  dest: string,
): string[] {
  const from = key(chef.x, chef.y);
  if (chef.avoid.length) {
    const alt = bfs(grid, from, dest, chef.avoid);
    if (alt.length) return alt;
  }
  return bfs(grid, from, dest);
}

function currentTask(world: MoveWorld, chef: Chef): Task | undefined {
  return world.tasks.find((t) => t.id === chef.taskId);
}

/**
 * 每个 0.1 秒推进一格的协作移动。
 * 规则：一格只容一人；不允许位置互换（不能互相穿过）；
 * 任何厨师都有后退/重规划兜底，因此永远不会死锁。
 */
export interface MoveMetrics {
  walks: number;
  waits: number;
  backtracks: number;
  reroutes: number;
}
const ZERO_METRICS: MoveMetrics = {
  walks: 0,
  waits: 0,
  backtracks: 0,
  reroutes: 0,
};

export function stepMovement(
  world: MoveWorld,
  onArrive: (chef: Chef, task: Task) => void,
  metrics: MoveMetrics = { ...ZERO_METRICS },
) {
  const { grid, chefs } = world;

  // 1. 先处理已站在目标格上的厨师（任务刚派到脚下）
  for (const chef of chefs) {
    const task = currentTask(world, chef);
    if (!task) {
      // 无任务但带有让位路径的厨师保持 move，由第 5 步执行
      if (chef.path.length === 0) {
        chef.mode = "idle";
        chef.waitReason = "";
      }
      continue;
    }
    if (key(chef.x, chef.y) === task.dest && chef.path.length === 0) {
      chef.mode = "work";
      onArrive(chef, task);
    }
  }

  // 2. 为有任务但没路线的厨师规划
  for (const chef of chefs) {
    const task = currentTask(world, chef);
    if (!task) continue;
    if (chef.path.length === 0 && key(chef.x, chef.y) !== task.dest) {
      const p = planPath(grid, chef, task.dest);
      if (p.length === 0) {
        chef.mode = "wait";
        chef.waitReason = WAIT.noPath;
        chef.blockedTicks++;
      } else {
        chef.path = p;
      }
    }
  }

  // 3. 计算每位厨师的期望下一步（含无任务的让位移动）
  const pos = new Map<number, string>();
  for (const c of chefs) pos.set(c.id, key(c.x, c.y));
  const want = new Map<number, string>();
  for (const chef of chefs) {
    if (chef.path.length === 0) continue;
    want.set(chef.id, chef.path[0]);
  }

  const blocked = new Map<number, string>(); // chefId -> 等待原因
  const yielding = new Set<number>(); // 本拍主动后退让行的厨师（其“互换”是合法让行）
  const targetOwners = new Map<string, number>();
  for (const [id, target] of want) {
    if (!targetOwners.has(target)) {
      targetOwners.set(target, id);
    } else {
      // 两人争抢同一格：等得久的优先，否则工号小的优先
      const a = chefs.find((c) => c.id === id)!;
      const b = chefs.find((c) => c.id === targetOwners.get(target)!)!;
      const loser = a.blockedTicks > b.blockedTicks ? b : a;
      blocked.set(loser.id, WAIT.occupied);
    }
  }

  for (const [id, target] of want) {
    if (blocked.has(id)) continue;
    const from = pos.get(id)!;
    // 位置互换 = 迎面穿过，严格禁止（主动后退让行者除外）
    const other = chefs.find((c) => want.get(c.id) === from && pos.get(c.id) === target);
    if (other && !yielding.has(id) && !yielding.has(other.id)) {
      blocked.set(id, WAIT.headOn);
      blocked.set(other.id, WAIT.headOn);
      continue;
    }
    // 目标格现在有人，且对方本拍不挪窝
    const occupant = chefs.find((c) => pos.get(c.id) === target);
    if (occupant && !want.has(occupant.id)) {
      blocked.set(id, WAIT.occupied);
    } else if (occupant && blocked.has(occupant.id)) {
      blocked.set(id, WAIT.occupied);
    }
  }

  // 4. 被堵厨师的策略：绕行重规划 / 窄道后退 / 手动等待（带兜底）
  for (const chef of chefs) {
    if (!blocked.has(chef.id)) continue;
    chef.blockedTicks++;
    metrics.waits++;
    const reason = blocked.get(chef.id)!;
    const target = want.get(chef.id)!;
    const detourEarly = chef.routing === "detour";
    const rerouteAt = detourEarly ? 3 : 8;
    const backtrackAt = chef.routing === "hold" ? 12 : reason === WAIT.headOn ? 2 : 5;
    // 全局兜底：任何策略等待超过 15 拍都强制重规划，杜绝永久等待
    const forceReroute = chef.blockedTicks >= 15;
    const shouldReroute =
      (chef.routing !== "hold" && chef.blockedTicks >= rerouteAt) ||
      (chef.routing === "hold" && forceReroute);

    // 4a. 绕行：把阻挡格记入回避表，重新找一条绕开它的路
    if (shouldReroute) {
      const task = currentTask(world, chef);
      // 无任务的让位移动以当前路径终点为目标
      const dest = task ? task.dest : chef.path[chef.path.length - 1];
      const avoid = chef.avoid.includes(target)
        ? chef.avoid
        : [...chef.avoid, target];
      const next = bfs(grid, key(chef.x, chef.y), dest, avoid);
      if (next.length) {
        chef.avoid = avoid;
        chef.path = next;
        chef.reroutes++;
        chef.blockedTicks = 0;
        blocked.delete(chef.id);
        metrics.reroutes++;
        continue;
      }
    }

    // 4b. 后退：沿来路退回一格，把窄道让出来
    if (chef.blockedTicks >= backtrackAt && chef.trail.length) {
      const back = chef.trail[chef.trail.length - 1];
      const occupiedNow = chefs.some(
        (c) => c.id !== chef.id && pos.get(c.id) === back,
      );
      const targeted = [...want.entries()].some(
        ([oid, t]) => oid !== chef.id && t === back && !blocked.has(oid),
      );
      if (!occupiedNow && !targeted) {
        chef.trail.pop();
        // 后退后原路线作废，下拍重新规划（并记住阻挡格）
        if (!chef.avoid.includes(target)) chef.avoid.push(target);
        chef.path = [];
        chef.blockedTicks = 0;
        chef.backtracks++;
        blocked.delete(chef.id);
        yielding.add(chef.id);
        want.set(chef.id, back);
        pos.set(chef.id, back);
        metrics.backtracks++;
        continue;
      }
    }
    chef.mode = "wait";
    chef.waitReason =
      chef.routing === "hold" && !forceReroute ? WAIT.hold : reason;
  }

  // 4c. 让行决定后复核：若互换双方有一方是主动后退，则视为合法让行，
  // 解除另一方的 head-on 阻挡（后退本身不是“互相穿过”）
  for (const [id] of blocked) {
    if (blocked.get(id) !== WAIT.headOn) continue;
    const target = want.get(id);
    if (!target) continue;
    const other = chefs.find(
      (c) => c.id !== id && want.get(c.id) === pos.get(id) && pos.get(c.id) === target,
    );
    if (other && (yielding.has(id) || yielding.has(other.id))) {
      if (!yielding.has(id)) blocked.delete(id);
      if (!yielding.has(other.id)) blocked.delete(other.id);
    }
  }

  // 5. 同时执行移动（真实互换已在第 3 步禁止，让行互换已在 4c 豁免）
  for (const chef of chefs) {
    const target = want.get(chef.id);
    if (!target || blocked.has(chef.id)) {
      const task = currentTask(world, chef);
      if (task && chef.path.length && blocked.has(chef.id)) {
        chef.mode = "wait";
      } else if (!task) {
        chef.mode = "idle";
        chef.waitReason = "";
      }
      continue;
    }
    const { x, y } = parseKey(target);
    if (!yielding.has(chef.id)) chef.trail.push(key(chef.x, chef.y));
    if (chef.trail.length > 8) chef.trail.shift();
    chef.x = x;
    chef.y = y;
    if (!yielding.has(chef.id)) chef.path.shift();
    chef.blockedTicks = 0;
    chef.mode = "move";
    chef.waitReason = "";
    metrics.walks++;
  }

  // 6. 到达目标 → 执行任务动作（由业务层注入）；无任务的让位走到终点后转待命
  for (const chef of chefs) {
    const task = currentTask(world, chef);
    if (!task) {
      if (chef.path.length === 0 && !blocked.has(chef.id)) {
        chef.mode = "idle";
        chef.waitReason = "";
      }
      continue;
    }
    if (key(chef.x, chef.y) === task.dest && chef.path.length === 0) {
      chef.mode = "work";
      onArrive(chef, task);
    } else if (chef.mode !== "wait") {
      chef.mode = "move";
    }
  }
}
