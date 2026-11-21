<script setup lang="ts">
import { computed } from "vue";
import type { Command, Game, Task } from "../../../shared/types";

const props = defineProps<{ game: Game }>();
const emit = defineEmits<{ command: [cmd: Command] }>();

const chains = computed<Task[][]>(() => {
  const map = new Map<number, Task[]>();
  for (const t of props.game.tasks) {
    const arr = map.get(t.chain) ?? [];
    arr.push(t);
    map.set(t.chain, arr);
  }
  return [...map.values()].map((arr) => arr.sort((a, b) => a.leg - b.leg));
});

function chefName(id: number | null) {
  if (id === null) return "待分配";
  return props.game.chefs.find((c) => c.id === id)?.name ?? `厨师${id}`;
}
function carried(t: Task) {
  if (!t.carry) return false;
  if (t.carry.kind === "portion") {
    const p = props.game.portions.find((x) => x.id === t.carry!.id);
    return p?.loc === "carried";
  }
  const d = props.game.dishes.find((x) => x.id === t.carry!.id);
  return d?.loc === "carried";
}
</script>

<template>
  <section class="panel task-panel">
    <div class="section-heading">
      <div>
        <span class="eyebrow">00c / TASK QUEUE</span>
        <h2>搬运任务 <span class="small">QUEUE</span></h2>
      </div>
      <span class="pill">{{ game.tasks.length }} 条腿</span>
    </div>
    <div v-if="!chains.length" class="empty">
      暂无搬运任务，从备料、灶台、传菜口派发即可。
    </div>
    <div class="task-chains">
      <article v-for="chain in chains" :key="chain[0].chain" class="task-chain">
        <header>
          <b>链 #{{ chain[0].chain }}</b>
          <span>{{ chefName(chain[0].chef) }}</span>
        </header>
        <ol>
          <li v-for="t in chain" :key="t.id" :class="{ running: game.chefs.some((c) => c.taskId === t.id) }">
            <span class="task-note">{{ t.note }}</span>
            <small>→ {{ t.dest }}</small>
            <em v-if="carried(t)" class="carried-tag">手持中·归属唯一</em>
          </li>
        </ol>
        <footer>
          <button
            class="tiny soft"
            @click="emit('command', { type: 'cancel-task', id: chain[0].id })"
          >
            取消
          </button>
          <button
            v-for="c in game.chefs"
            :key="c.id"
            class="tiny"
            :disabled="chain[0].chef === c.id || chain.some((t) => carried(t))"
            :title="chain.some((t) => carried(t)) ? '食品在厨师手上，不能改派' : `改派给${c.name}`"
            @click="emit('command', { type: 'reassign-task', id: chain[0].id, chef: c.id })"
          >
            → {{ c.name }}
          </button>
        </footer>
      </article>
    </div>
  </section>
</template>
