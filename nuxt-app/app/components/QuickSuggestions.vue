<template>
  <div v-if="suggestions.length" class="mb-2 flex flex-wrap gap-1.5">
    <button
      v-for="s in suggestions"
      :key="s"
      class="cursor-pointer rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      :disabled="busy"
      @click="send(s)"
    >
      {{ s }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { useAgent } from '../composables/useAgent'

const { draft, tripState, busy, readyToGenerate, send } = useAgent()

const suggestions = computed(() => {
  const d = draft.value
  const out: string[] = []

  if (!d.origin && d.destinations.length === 0) {
    out.push('Москва → Благовещенск')
    out.push('Пхукет на неделю')
  } else if (d.origin && d.destinations.length === 0) {
    out.push('Благовещенск')
    out.push('Барселона и Мадрид')
  }

  const noDates = !d.dates.start && !d.dates.end && d.dates.duration_days === null
  if (d.origin && d.destinations.length && noDates) {
    out.push('на 7 дней')
    out.push('с 3 сентября на 10 дней')
  }

  if (!d.travelers) out.push('2 взрослых и ребёнок 7 лет')

  if (d.origin && d.destinations.length && d.travelers && d.needs.length === 0) {
    out.push('экономно, пляж')
  }

  if (readyToGenerate.value && tripState.value) out.push('Всё верно')

  return out.slice(0, 3)
})
</script>