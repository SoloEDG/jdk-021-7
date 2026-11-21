<script setup lang="ts">
import type { Game, Command } from "../../../shared/types";
import { recipeList, recipes } from "../../../shared/catalog";
import IngredientShelf from "./IngredientShelf.vue";
import { preparationIssue } from "../lib/availability";
defineProps<{ game: Game }>();
defineEmits<{ command: [cmd: Command] }>();
function chefName(game: Game, id?: number) {
  return game.chefs.find((c) => c.id === id)?.name ?? "";
}
</script>
<template>
  <section class="panel pantry-panel">
    <span class="eyebrow">02 / PREP STATION</span>
    <h2>食材准备 <span class="small">PREP</span></h2>
    <IngredientShelf
      :game="game"
      @restock="
        (ingredient) => $emit('command', { type: 'restock', ingredient })
      "
    />
    <div class="prep-actions">
      <button
        v-for="r in recipeList"
        :key="r.id"
        class="recipe-button"
        :disabled="!!preparationIssue(game, r.id)"
        @click="$emit('command', { type: 'prepare', recipe: r.id })"
      >
        <span>{{ r.icon }}</span
        ><b>{{ r.name }}</b
        ><small>派厨师备料 · 消耗1份</small>
      </button>
    </div>
    <div class="portion-list">
      <div v-for="p in game.portions" :key="p.id" class="portion-chip"
        :class="{ carried: p.loc === 'carried' }">
        <span>{{ recipes[p.recipe].icon }}</span>
        <b>#{{ p.id }}</b>
        <small>{{
          p.loc === "carried"
            ? `${chefName(game, p.carrier)}手持中`
            : p.reservedBy
              ? `${chefName(game, p.reservedBy)}已认领`
              : "备料台"
        }}</small>
      </div>
      <p v-if="!game.portions.length" class="muted">备料台暂无食材</p>
    </div>
    <p class="muted">
      台上 {{ game.portions.filter((p) => p.loc === 'prep').length }} / 6 份 ·
      手持 {{ game.portions.filter((p) => p.loc === 'carried').length }} 份
    </p>
  </section>
</template>
