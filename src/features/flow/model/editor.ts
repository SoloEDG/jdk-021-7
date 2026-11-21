import type { Cell, EditTool, Game } from "../../../shared/types";
import {
  GRID_H,
  GRID_W,
  PRESETS,
  buildGrid,
  cellAt,
  key,
  validateLayout,
} from "../lib/grid";

export function revalidate(g: Game) {
  g.layoutIssues = validateLayout(g.grid);
}

/**
 * 编辑布局：
 * - 开餐前：可自由砌墙、拆墙、挪设备
 * - 营业中：只能挪设备，且必须先处理占用与前往它的任务，食材绝不瞬移
 */
export function applyEdit(
  g: Game,
  tool: EditTool,
  x: number,
  y: number,
  sx?: number,
  sy?: number,
) {
  const target = cellAt(g.grid, x, y);
  if (!target) return;

  if (tool === "move") {
    if (sx === undefined || sy === undefined) return;
    const src = cellAt(g.grid, sx, sy);
    if (!src || (src.type !== "stove" && src.type !== "pantry" && src.type !== "prep" && src.type !== "pass"))
      return;
    if (target.type !== "floor") {
      g.notice = "目标格不是空地，无法移动设备";
      return;
    }
    // 厨师正站在目标格
    if (g.chefs.some((c) => c.x === x && c.y === y)) {
      g.notice = "厨师正站在那里，先让他们离开";
      return;
    }
    if (src.type === "stove") {
      const stove = g.stoves.find((s) => s.id === src.stoveId);
      if (stove?.portion) {
        g.notice = "灶上还有正在加热的菜，先起锅再挪设备（加热不会中断）";
        return;
      }
    }
    // 正在前往该设备的任务：先取消，避免食材送向已经不存在的位置
    const srcKey = key(sx, sy);
    const related = g.tasks.filter((t) => t.dest === srcKey);
    if (related.length) {
      const ids = new Set(related.map((t) => t.chain));
      g.tasks = g.tasks.filter((t) => !ids.has(t.chain));
      for (const c of g.chefs) {
        c.taskId = null;
        c.path = [];
        c.avoid = [];
        c.mode = "idle";
        c.waitReason = "";
      }
      // 手持食品回到台面，不瞬移
      for (const p of g.portions) {
        if (p.loc === "carried") {
          p.loc = "prep";
          p.carrier = undefined;
          p.reservedBy = undefined;
        }
      }
      for (const d of g.dishes) {
        if (d.loc === "carried") {
          d.loc = "counter";
          d.carrier = undefined;
        }
      }
      g.notice = "已先撤回前往该设备的任务，食品留在原台面后再移动";
    }
    // 交换格子内容（设备“搬走”，原格变空地）
    const moved: Cell = { ...target, type: src.type, stoveId: src.stoveId, stoveKind: src.stoveKind };
    Object.assign(target, moved);
    Object.assign(src, { type: "floor" as const, stoveId: undefined, stoveKind: undefined });
    // 厨师的路径与回避表失效，下拍重新规划
    for (const c of g.chefs) {
      c.path = [];
      c.avoid = [];
    }
    revalidate(g);
    if (g.layoutIssues.length) {
      g.notice = `设备已移动，但布局出现 ${g.layoutIssues.length} 处断点，已标出`;
    } else {
      g.notice = g.running
        ? "设备已搬至新位置，后续任务按新位置寻路，无食材瞬移"
        : "布局已更新，开餐前可继续自由调整";
    }
    return;
  }

  // 墙体工具仅在非营业时可用
  if (g.running) {
    g.notice = "营业中只能挪设备，砌墙/拆墙请先暂停";
    return;
  }
  if (x <= 0 || y <= 0 || x >= GRID_W - 1 || y >= GRID_H - 1) return;
  if (target.type === "stove" || target.type === "pantry" || target.type === "prep" || target.type === "pass") {
    g.notice = "功能设备格不能直接砌墙，请先把设备挪走";
    return;
  }
  if (g.chefs.some((c) => c.x === x && c.y === y) || g.grid.starts.some((s) => s.x === x && s.y === y)) {
    g.notice = "厨师站位不能封死";
    return;
  }
  if (tool === "wall") {
    if (target.type === "wall") return;
    target.type = "wall";
  } else {
    if (target.type !== "wall") return;
    target.type = "floor";
  }
  revalidate(g);
  g.notice = g.layoutIssues.length
    ? `存在 ${g.layoutIssues.length} 处不通的断点（已标红），修复前无法开餐`
    : "布局通路正常，可以开餐";
}

export function loadPreset(g: Game, id: "A" | "B" | "C") {
  if (g.running) {
    g.notice = "营业中不能整体更换布局，请暂停后操作";
    return;
  }
  if (g.portions.length || g.dishes.length || g.stoves.some((s) => s.portion)) {
    g.notice = "厨房里还有食材或菜品，不能重置布局";
    return;
  }
  g.grid = buildGrid(PRESETS[id], g.stoves);
  g.tasks = [];
  g.chefs.forEach((c, i) => {
    c.x = g.grid.starts[i].x;
    c.y = g.grid.starts[i].y;
    c.path = [];
    c.trail = [];
    c.taskId = null;
    c.mode = "idle";
    c.waitReason = "";
    c.blockedTicks = 0;
    c.reroutes = 0;
    c.backtracks = 0;
    c.avoid = [];
  });
  revalidate(g);
  g.bench = null;
  g.notice = `已载入布局「${PRESETS[id].name}」：${PRESETS[id].desc}`;
}
