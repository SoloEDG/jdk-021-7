<script setup lang="ts">
import type { Command, Game } from "../../../shared/types";
defineProps<{ game: Game }>();
defineEmits<{ command: [cmd: Command] }>();
</script>

<template>
  <section v-if="game.bench" class="panel bench-panel">
    <div class="section-heading">
      <div>
        <span class="eyebrow">00d / CONGESTION BENCHMARK</span>
        <h2>近路 vs 绕行 <span class="small">BENCH</span></h2>
      </div>
      <button class="tiny soft" @click="$emit('command', { type: 'run-bench' })">
        重新测算
      </button>
    </div>
    <div class="bench-grid">
      <article class="bench-card">
        <b>都走最短近路（单门）</b>
        <strong>{{ game.bench.shortest.ticks }} <small>×0.1s</small></strong>
        <div class="bench-stats">
          <span>等待 {{ game.bench.shortest.waits }}</span>
          <span>后退 {{ game.bench.shortest.backtracks }}</span>
          <span>绕行 {{ game.bench.shortest.reroutes }}</span>
        </div>
      </article>
      <article class="bench-card win">
        <b>一人主动绕远路</b>
        <strong>{{ game.bench.detour.ticks }} <small>×0.1s</small></strong>
        <div class="bench-stats">
          <span>等待 {{ game.bench.detour.waits }}</span>
          <span>后退 {{ game.bench.detour.backtracks }}</span>
          <span>绕行 {{ game.bench.detour.reroutes }}</span>
        </div>
      </article>
    </div>
    <p class="muted">
      同一布局、同一对穿门任务：近路虽短，迎头相遇反复让行；绕远路的总耗时
      <b>{{
        game.bench.detour.ticks < game.bench.shortest.ticks
          ? `少 ${game.bench.shortest.ticks - game.bench.detour.ticks} 个时间片`
          : "持平或略高（调整布局可拉开差距）"
      }}</b
      >。
    </p>
  </section>
</template>
