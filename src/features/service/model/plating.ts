import type { Game } from "../../../shared/types";
import { enqueueDiscard, enqueuePlate } from "../../flow/model/tasks";

/** 装盘：厨师走到传菜口操作，食品全程不离开台面或厨师手中 */
export function plate(g: Game, id: number) {
  const d = g.dishes.find((d) => d.id === id);
  if (!d || d.stage !== "counter" || d.loc === "carried") return;
  enqueuePlate(g, id);
}
export function discard(g: Game, id: number) {
  if (!g.dishes.some((d) => d.id === id)) return;
  enqueueDiscard(g, id);
}
