import type {
  BenchResult,
  BenchStep,
  Chef,
  Grid,
  Task,
} from "../../../shared/types";
import { PRESET_A, buildGrid } from "../lib/grid";
import { stepMovement } from "../lib/movement";
import type { MoveWorld } from "../lib/movement";

interface SimWorld extends MoveWorld {
  done: boolean;
  events: BenchStep[];
}

function makeChefs(grid: Grid, detour: boolean): Chef[] {
  return grid.starts.map((s, i) => ({
    id: i + 1,
    name: i === 0 ? "阿灶" : "小碗",
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
    routing: detour && i === 0 ? "detour" : "auto",
    avoid: [],
  }));
}

/**
 * 拥堵基准（只读模拟，不影响当前对局）：
 * 两位厨师分别从左下、右上出发，目标恰好在横墙单门两侧，
 * 都走最短路径必然在门口迎头相遇；绕行模式让一人提前避开门口。
 */
export function runBenchmark(): { shortest: BenchResult; detour: BenchResult } {
  const stoves = [
    { id: 1, kind: "pan" as const, portion: null, started: 0 },
    { id: 2, kind: "pan" as const, portion: null, started: 0 },
    { id: 3, kind: "pot" as const, portion: null, started: 0 },
  ];
  const grid = buildGrid(PRESET_A, stoves);
  const door = "4,3";
  // 两人从门两侧等距出发，最短路径在门口迎头相遇
  const dest1 = "4,1";
  const dest2 = "4,5";

  function simulate(mode: "shortest" | "detour"): BenchResult {
    const chefs = makeChefs(grid, mode === "detour");
    chefs[0].x = 4;
    chefs[0].y = 4;
    chefs[1].x = 4;
    chefs[1].y = 2;
    const tasks: Task[] = [
      {
        id: 1,
        chef: 1,
        type: "prepare",
        dest: dest1,
        chain: 1,
        leg: 0,
        note: "穿门任务·阿灶",
      },
      {
        id: 2,
        chef: 2,
        type: "prepare",
        dest: dest2,
        chain: 2,
        leg: 0,
        note: "穿门任务·小碗",
      },
    ];
    chefs[0].taskId = 1;
    chefs[1].taskId = 2;
    if (mode === "detour") chefs[0].avoid = [door];
    const events: BenchStep[] = [];
    const metrics = { walks: 0, waits: 0, backtracks: 0, reroutes: 0 };
    const world: SimWorld = { grid, chefs, tasks, done: false, events };

    let tick = 0;
    const cap = 400;
    while (tick < cap && world.tasks.length) {
      stepMovement(
        world,
        (chef) => {
          events.push({
            tick,
            event: `${chef.name} 抵达目标（共 ${tick} 个时间片）`,
          });
          const idx = world.tasks.findIndex((t) => t.id === chef.taskId);
          if (idx >= 0) world.tasks.splice(idx, 1);
          chef.taskId = null;
        },
        metrics,
      );
      const waiting = chefs.filter((c) => c.mode === "wait");
      if (waiting.length && tick % 4 === 0) {
        events.push({
          tick,
          event: waiting.map((c) => `${c.name}：${c.waitReason}`).join("；"),
        });
      }
      tick++;
    }
    return {
      mode,
      ticks: tick,
      walks: metrics.walks,
      waits: metrics.waits,
      backtracks: metrics.backtracks,
      reroutes: metrics.reroutes,
      events: events.slice(0, 14),
    };
  }

  return {
    shortest: simulate("shortest"),
    detour: simulate("detour"),
  };
}
