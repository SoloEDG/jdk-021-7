<script setup lang="ts">
import { computed } from "vue";
import type { Chef, Command, Game, RoutingMode } from "../../../shared/types";
import { recipes } from "../../../shared/catalog";

const props = defineProps<{ game: Game }>();
const emit = defineEmits<{ command: [cmd: Command] }>();

const modes: { id: RoutingMode; name: string; hint: string }[] = [
  { id: "auto", name: "自动避让", hint: "拥堵后自动后退/绕行" },
  { id: "detour", name: "绕远路", hint: "主动避开拥堵格" },
  { id: "hold", name: "等让行", hint: "原地等待，超时仍会绕行" },
];

const taskMap = computed(() => {
  const m = new Map<number, string>();
  for (const c of props.game.chefs) {
    const t = props.game.tasks.find((x) => x.id === c.taskId);
    if (t) m.set(c.id, t.note);
  }
  return m;
});

function carry(chef: Chef) {
  const p = props.game.portions.find(
    (x) => x.loc === "carried" && x.carrier === chef.id,
  );
  if (p) return `${recipes[p.recipe].icon} ${recipes[p.recipe].name}（备料）`;
  const d = props.game.dishes.find(
    (x) => x.loc === "carried" && x.carrier === chef.id,
  );
  if (d) return `${recipes[d.recipe].icon} ${recipes[d.recipe].name}（成品）`;
  return "空手";
}
function posText(c: Chef) {
  return `(${c.x}, ${c.y})`;
}
const modeText: Record<Chef["mode"], string> = {
  idle: "待命",
  move: "行进",
  wait: "等待",
  work: "操作中",
};
</script>

<template>
  <section class="panel chefs-panel">
    <div class="section-heading">
      <div>
        <span class="eyebrow">00b / THE BRIGADE</span>
        <h2>厨师调度 <span class="small">CREW</span></h2>
      </div>
    </div>
    <div class="chef-cards">
      <article v-for="c in game.chefs" :key="c.id" class="chef-card" :class="'chef-theme-' + c.id">
        <div class="chef-head">
          <b>{{ c.name }}</b>
          <span class="status-dot" :class="c.mode">{{ modeText[c.mode] }}</span>
        </div>
        <div class="chef-rows">
          <div><small>位置</small><span>{{ posText(c) }}</span></div>
          <div><small>手持食品</small><span :class="{ red: carry(c) === '空手' }">{{ carry(c) }}</span></div>
          <div><small>当前任务</small><span>{{ taskMap.get(c.id) || '—' }}</span></div>
          <div><small>等待原因</small><span class="warn">{{ c.waitReason || '—' }}</span></div>
          <div class="chef-stats">
            <span>绕行 {{ c.reroutes }}</span>
            <span>后退 {{ c.backtracks }}</span>
            <span>余 {{ c.path.length }} 步</span>
          </div>
        </div>
        <div class="routing-row">
          <button
            v-for="m in modes"
            :key="m.id"
            class="tiny"
            :class="{ active: c.routing === m.id }"
            :title="m.hint"
            @click="emit('command', { type: 'chef-routing', chef: c.id, routing: m.id })"
          >
            {{ m.name }}
          </button>
        </div>
      </article>
    </div>
    <p class="muted">
      窄道只能容纳一人；迎面相遇不会互穿，也不会永久等待——超时自动后退或重规划。
    </p>
  </section>
</template>
