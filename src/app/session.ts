import { reactive, onUnmounted } from "vue";
import { createGame } from "../shared/initial";
import { expire, arrive } from "../features/orders";
import { closeShift, saveBest, readBest } from "../features/ledger";
import { tickFlow } from "../features/flow/model/engine";
import { validateLayout } from "../features/flow/lib/grid";
export function useSession() {
  const game = reactive(createGame(readBest()));
  let last = performance.now(),
    carry = 0;
  const timer = setInterval(() => {
    const now = performance.now(),
      dt = Math.min(0.5, (now - last) / 1000);
    last = now;
    if (!game.running) return;
    carry += dt;
    while (carry >= 0.1 && game.running) {
      carry -= 0.1;
      game.time = Math.min(
        game.duration,
        Math.round((game.time + 0.1) * 10) / 10,
      );
      tickFlow(game);
      expire(game);
      if (Math.round(game.time * 10) % 180 === 0) arrive(game);
      if (game.time >= game.duration) {
        closeShift(game);
        saveBest(game);
      }
    }
  }, 50);
  onUnmounted(() => clearInterval(timer));
  function toggle() {
    if (game.ended) return;
    if (!game.running) {
      game.layoutIssues = validateLayout(game.grid);
      if (game.layoutIssues.length) {
        const first = game.layoutIssues[0];
        game.notice = `无法开餐：${first.label}（${first.cell}）${first.reason}，断点已在布局台标红`;
        return;
      }
    }
    carry = 0;
    last = performance.now();
    game.running = !game.running;
    game.notice = game.running
      ? "营业中，厨师走路也在消耗营业时间。"
      : "已暂停，所有厨房计时冻结，可调整布局。";
  }
  function restart() {
    Object.assign(game, createGame(game.best));
    carry = 0;
    last = performance.now();
  }
  return { game, toggle, restart };
}
