import type { Game, Chef } from "./types";
import { buildGrid, PRESET_A, STARTS, validateLayout } from "../features/flow/lib/grid";

function createChefs(): Chef[] {
  return STARTS.map((s, i) => ({
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
    routing: "auto",
    avoid: [],
  }));
}

const initialStoves = [
  { id: 1, kind: "pan" as const, portion: null, started: 0 },
  { id: 2, kind: "pan" as const, portion: null, started: 0 },
  { id: 3, kind: "pot" as const, portion: null, started: 0 },
];

export function createGame(best = 0): Game {
  const stoves = initialStoves.map((s) => ({ ...s }));
  const grid = buildGrid(PRESET_A, stoves);
  return {
    time: 0,
    duration: 180,
    running: false,
    ended: false,
    nextId: 4,
    selectedOrder: null,
    selectedDish: null,
    orders: [
      {
        id: 1,
        recipe: "steak",
        guest: "林小姐",
        arrived: 0,
        deadline: 65,
        status: "waiting",
      },
      {
        id: 2,
        recipe: "pasta",
        guest: "周先生",
        arrived: 0,
        deadline: 75,
        status: "waiting",
      },
      {
        id: 3,
        recipe: "salad",
        guest: "小陈",
        arrived: 0,
        deadline: 55,
        status: "waiting",
      },
    ],
    stock: { beef: 5, noodle: 5, greens: 6 },
    portions: [],
    stoves,
    dishes: [],
    entries: [],
    combo: 0,
    served: 0,
    missed: 0,
    notice: "先在下方布局台规划厨房，确认通路后开始营业。",
    best,
    grid,
    chefs: createChefs(),
    tasks: [],
    layoutIssues: validateLayout(grid),
    bench: null,
  };
}
