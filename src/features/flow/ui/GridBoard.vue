<script setup lang="ts">
import { computed, ref } from "vue";
import type { Cell, Command, EditTool, Game } from "../../../shared/types";
import { recipes } from "../../../shared/catalog";
import { key, PRESETS } from "../lib/grid";

const props = defineProps<{ game: Game }>();
const emit = defineEmits<{ command: [cmd: Command] }>();

const tool = ref<EditTool>("move");
const dragFrom = ref<{ x: number; y: number } | null>(null);

const issueMap = computed(() => {
  const m = new Map<string, string>();
  for (const i of props.game.layoutIssues) m.set(i.cell, i.reason);
  return m;
});
const pathMap = computed(() => {
  const m = new Map<string, number>();
  props.game.chefs.forEach((c) => {
    c.path.forEach((k) => {
      if (!m.has(k)) m.set(k, c.id);
    });
  });
  return m;
});

function icon(c: Cell): string {
  switch (c.type) {
    case "wall":
      return "🧱";
    case "pantry":
      return "🧺";
    case "prep":
      return "📋";
    case "pass":
      return "🛎️";
    case "stove":
      return c.stoveKind === "pan" ? "🍳" : "🍲";
    default:
      return "";
  }
}
function label(c: Cell): string {
  switch (c.type) {
    case "pantry":
      return "食材库";
    case "prep":
      return "备料台";
    case "pass":
      return "传菜口";
    case "stove":
      return `${c.stoveKind === "pan" ? "煎锅" : "汤锅"}0${c.stoveId}`;
    default:
      return "";
  }
}
function chefAt(x: number, y: number) {
  return props.game.chefs.find((c) => c.x === x && c.y === y);
}
function carryIcon(chefId: number): string {
  const p = props.game.portions.find((p) => p.loc === "carried" && p.carrier === chefId);
  if (p) return recipes[p.recipe].icon;
  const d = props.game.dishes.find((d) => d.loc === "carried" && d.carrier === chefId);
  if (d) return recipes[d.recipe].icon;
  return "";
}
function onCellDown(c: Cell) {
  if (tool.value !== "move") {
    emit("command", { type: "apply-edit", tool: tool.value, x: c.x, y: c.y });
    return;
  }
  if (c.type === "stove" || c.type === "pantry" || c.type === "prep" || c.type === "pass") {
    dragFrom.value = { x: c.x, y: c.y };
  }
}
function onCellUp(c: Cell) {
  if (tool.value !== "move" || !dragFrom.value) return;
  const s = dragFrom.value;
  dragFrom.value = null;
  if (s.x === c.x && s.y === c.y) return;
  emit("command", {
    type: "apply-edit",
    tool: "move",
    x: c.x,
    y: c.y,
    sx: s.x,
    sy: s.y,
  });
}
function onCellEnter(c: Cell) {
  // 墙刷支持按住拖动连续绘制
  if (!dragFrom.value && (tool.value === "wall" || tool.value === "unwall")) {
    emit("command", { type: "apply-edit", tool: tool.value, x: c.x, y: c.y });
  }
}
</script>

<template>
  <section class="panel grid-panel">
    <div class="section-heading">
      <div>
        <span class="eyebrow">00 / KITCHEN LAYOUT</span>
        <h2>厨房布局台 <span class="small">GRID</span></h2>
      </div>
      <span class="pill" :class="{ bad: game.layoutIssues.length }">
        {{ game.layoutIssues.length ? `${game.layoutIssues.length} 处断点` : "通路正常" }}
      </span>
    </div>

    <div class="edit-toolbar">
      <button
        v-for="t in (['move', 'wall', 'unwall'] as EditTool[])"
        :key="t"
        class="tiny"
        :class="{ active: tool === t }"
        @click="tool = t"
      >
        {{ t === "move" ? "↔ 挪设备" : t === "wall" ? "🧱 砌墙" : "▫ 拆墙" }}
      </button>
      <span class="muted small-note">
        {{ game.running ? "营业中仅可挪设备（先撤回相关任务）" : "开餐前可自由编辑" }}
      </span>
    </div>

    <div class="grid-wrap">
      <div
        class="grid-board"
        :style="{ gridTemplateColumns: `repeat(${game.grid.w}, 1fr)` }"
      >
        <template v-for="row in game.grid.cells" :key="row[0].y">
          <button
            v-for="c in row"
            :key="key(c.x, c.y)"
            class="grid-cell"
            :class="[
              't-' + c.type,
              {
                issue: issueMap.has(key(c.x, c.y)),
                'path-1': pathMap.get(key(c.x, c.y)) === 1,
                'path-2': pathMap.get(key(c.x, c.y)) === 2,
                start: game.grid.starts.some((s) => s.x === c.x && s.y === c.y),
              },
            ]"
            :title="issueMap.get(key(c.x, c.y)) || label(c)"
            @mousedown.prevent="onCellDown(c)"
            @mouseup="onCellUp(c)"
            @mouseenter="onCellEnter(c)"
          >
            <span class="cell-icon">{{ icon(c) }}</span>
            <span v-if="label(c)" class="cell-label">{{ label(c) }}</span>
            <span v-if="issueMap.has(key(c.x, c.y))" class="issue-flag">✕</span>
            <span v-if="chefAt(c.x, c.y)" class="chef-dot" :class="'chef-' + chefAt(c.x, c.y)!.id">
              <b>{{ chefAt(c.x, c.y)!.name[0] }}</b>
              <i v-if="carryIcon(chefAt(c.x, c.y)!.id)">{{ carryIcon(chefAt(c.x, c.y)!.id) }}</i>
            </span>
          </button>
        </template>
      </div>
    </div>

    <div class="preset-row">
      <button
        v-for="p in Object.values(PRESETS)"
        :key="p.id"
        class="tiny soft"
        @click="emit('command', { type: 'load-preset', id: p.id })"
      >
        布局{{ p.id }} · {{ p.name }}
      </button>
      <button class="tiny warm" @click="emit('command', { type: 'run-bench' })">
        ▶ 运行拥堵基准
      </button>
    </div>
    <p class="muted layout-hint">
      点击格子砌/拆墙；选择「挪设备」后把设备拖到空地。彩色描边是两位厨师当前规划路径，✕
      标出阻断开餐的断点。
    </p>
  </section>
</template>
