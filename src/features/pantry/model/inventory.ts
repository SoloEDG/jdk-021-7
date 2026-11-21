import type { Game, RecipeId, Ingredient } from "../../../shared/types";
import { preparationIssue } from "../lib/availability";
import { enqueuePrepare, enqueueRestock } from "../../flow/model/tasks";

/** 备料改为派任务：厨师走到备料台才消耗库存并产出备料 */
export function prepare(g: Game, r: RecipeId) {
  const issue = preparationIssue(g, r);
  if (issue) {
    g.notice = issue;
    return;
  }
  enqueuePrepare(g, r);
}
export function restock(g: Game, i: Ingredient) {
  if (g.stock[i] >= 12) {
    g.notice = "库存充足，上限12份";
    return;
  }
  enqueueRestock(g, i);
}
