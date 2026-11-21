import type { Game } from "../../../shared/types";
import { enqueueCook, enqueueLift } from "../../flow/model/tasks";

/** 下锅：厨师到备料台取食材（归属唯一），再走到灶台放下，期间火候不受影响 */
export function cook(g: Game, portion: number, stove: number) {
  enqueueCook(g, portion, stove);
}

/** 起锅：厨师走到灶台取菜，再端到传菜口；加热在厨师赶路期间持续进行 */
export function lift(g: Game, id: number) {
  enqueueLift(g, id);
}
