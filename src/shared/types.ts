export type RecipeId = "steak" | "pasta" | "salad";
export type Ingredient = "beef" | "noodle" | "greens";
export interface Recipe {
  id: RecipeId;
  name: string;
  icon: string;
  ingredient: Ingredient;
  station: "pan" | "pot";
  target: number;
  price: number;
}
export interface Order {
  id: number;
  recipe: RecipeId;
  guest: string;
  arrived: number;
  deadline: number;
  status: "waiting" | "accepted" | "served" | "left";
}
/** 备料：prep 在备料台上，carried 正被某位厨师手持（唯一归属） */
export interface Portion {
  id: number;
  recipe: RecipeId;
  preparedAt: number;
  loc: "prep" | "carried";
  carrier?: number;
  reservedBy?: number;
}
export interface Stove {
  id: number;
  kind: "pan" | "pot";
  portion: Portion | null;
  started: number;
}
/** 菜品：counter 在传菜口，carried 正被厨师端着 */
export interface Dish {
  id: number;
  recipe: RecipeId;
  quality: number;
  cookedAt: number;
  stage: "counter" | "plated";
  loc: "counter" | "carried";
  carrier?: number;
}
export interface Entry {
  id: number;
  time: number;
  label: string;
  amount: number;
  kind: "sale" | "waste" | "miss" | "supply";
}

/* ---------- 格子布局 ---------- */
export type CellType =
  | "floor"
  | "wall"
  | "pantry"
  | "prep"
  | "pass"
  | "stove";
export interface Cell {
  x: number;
  y: number;
  type: CellType;
  stoveId?: number;
  stoveKind?: "pan" | "pot";
}
export interface Grid {
  w: number;
  h: number;
  cells: Cell[][];
  starts: { x: number; y: number }[];
}
export interface LayoutIssue {
  cell: string;
  label: string;
  reason: string;
}

/* ---------- 厨师与搬运任务 ---------- */
export type CarryKind = "portion" | "dish";
export interface CarryRef {
  kind: CarryKind;
  id: number;
}
export type TaskType =
  | "restock"
  | "prepare"
  | "cook-pick"
  | "cook-drop"
  | "lift-pick"
  | "lift-drop"
  | "plate"
  | "serve"
  | "discard";
export interface Task {
  id: number;
  /** null 表示尚未分配，chain 后续腿会直接绑定厨师 */
  chef: number | null;
  type: TaskType;
  /** 目标格子 key（x,y） */
  dest: string;
  refId?: number;
  carry?: CarryRef;
  recipe?: RecipeId;
  ingredient?: Ingredient;
  chain: number;
  leg: number;
  note: string;
}
export type ChefMode = "idle" | "move" | "wait" | "work";
export type RoutingMode = "auto" | "detour" | "hold";
export interface Chef {
  id: number;
  name: string;
  x: number;
  y: number;
  /** 尚未走完的格子 key 序列 */
  path: string[];
  /** 已走过的格子，用于窄道会车时有序后退 */
  trail: string[];
  taskId: number | null;
  mode: ChefMode;
  waitReason: string;
  blockedTicks: number;
  reroutes: number;
  backtracks: number;
  /** 手动策略：auto 自动避让，detour 绕远路，hold 原地等通道（不会永久等待） */
  routing: RoutingMode;
  /** 绕行时刻意避开的格子 */
  avoid: string[];
}
export interface BenchStep {
  tick: number;
  event: string;
}
export interface BenchResult {
  mode: "shortest" | "detour";
  ticks: number;
  walks: number;
  waits: number;
  backtracks: number;
  reroutes: number;
  events: BenchStep[];
}

export interface Game {
  time: number;
  duration: number;
  running: boolean;
  ended: boolean;
  nextId: number;
  selectedOrder: number | null;
  selectedDish: number | null;
  orders: Order[];
  stock: Record<Ingredient, number>;
  portions: Portion[];
  stoves: Stove[];
  dishes: Dish[];
  entries: Entry[];
  combo: number;
  served: number;
  missed: number;
  notice: string;
  best: number;
  grid: Grid;
  chefs: Chef[];
  tasks: Task[];
  layoutIssues: LayoutIssue[];
  bench: { shortest: BenchResult; detour: BenchResult } | null;
}
export type EditTool = "move" | "wall" | "unwall";
export type Command =
  | { type: "accept"; id: number }
  | { type: "select-order"; id: number }
  | { type: "prepare"; recipe: RecipeId }
  | { type: "cook"; portion: number; stove: number }
  | { type: "lift"; id: number }
  | { type: "plate"; id: number }
  | { type: "select-dish"; id: number }
  | { type: "serve" }
  | { type: "discard"; id: number }
  | { type: "restock"; ingredient: Ingredient }
  | {
      type: "apply-edit";
      tool: EditTool;
      x: number;
      y: number;
      sx?: number;
      sy?: number;
    }
  | { type: "load-preset"; id: "A" | "B" | "C" }
  | { type: "cancel-task"; id: number }
  | { type: "reassign-task"; id: number; chef: number }
  | { type: "chef-routing"; chef: number; routing: RoutingMode }
  | { type: "run-bench" };
