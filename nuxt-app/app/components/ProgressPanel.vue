<template>
  <div class="flex h-full flex-col gap-6 p-6">
    <div>
      <h2 class="text-lg font-semibold text-slate-800">Сбор поездки</h2>
      <p class="text-sm text-slate-500">
        {{
          generated
            ? 'Маршрут построен — открывай «Маршрут» или «Карту»'
            : 'Ответь на пару вопросов в чате — соберу поездку'
        }}
      </p>
    </div>

    <!-- Круговая диаграмма: сколько из 5 шагов заполнено -->
    <div class="flex items-center gap-5">
      <svg viewBox="0 0 120 120" class="h-36 w-36 -rotate-90">
        <circle cx="60" cy="60" r="52" fill="none" stroke="#e2e8f0" stroke-width="13" />
        <circle
          cx="60" cy="60" r="52"
          fill="none"
          stroke="#3b82f6"
          stroke-width="13"
          stroke-linecap="round"
          :stroke-dasharray="`${CIRCUMFERENCE * fraction} ${CIRCUMFERENCE}`"
        />
      </svg>
      <div class="flex flex-col">
        <span class="text-3xl font-bold text-slate-800">{{ filledCount }}/5</span>
        <span class="text-sm text-slate-500">шагов заполнено</span>
        <span v-if="filledCount === 5" class="mt-1 text-xs font-semibold text-green-600">Всё готово!</span>
      </div>
    </div>

    <!-- Список полей: что заполнено, что нет -->
    <div class="flex flex-col gap-2">
      <div
        v-for="row in rows"
        :key="row.label"
        class="flex items-center gap-3 rounded-xl border p-3"
        :class="row.filled ? 'border-green-200 bg-green-50/60' : 'border-slate-200 bg-white'"
      >
        <span
          class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
          :class="row.filled ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-400'"
        >
          {{ row.filled ? '✓' : '' }}
        </span>
        <div class="min-w-0">
          <p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">{{ row.label }}</p>
          <p class="truncate text-sm font-medium" :class="row.filled ? 'text-slate-700' : 'text-slate-400'">
            {{ row.filled ? row.value : 'не заполнено' }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Travelers, TripDates, TripDraft } from '~shared'

const props = defineProps<{ draft: TripDraft; generated: boolean }>()

const CIRCUMFERENCE = 2 * Math.PI * 52

function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return forms[2]
  if (last > 1 && last < 5) return forms[1]
  if (last === 1) return forms[0]
  return forms[2]
}

function formatTravelers(t: Travelers | null): string | null {
  if (!t) return null
  const base = `${t.adults} ${plural(t.adults, ['взрослый', 'взрослых', 'взрослых'])}`
  if (t.children > 0) {
    return `${base}, ${t.children} ${plural(t.children, ['ребёнок', 'ребёнка', 'детей'])} (${t.children_ages.join(', ')})`
  }
  return base
}

function formatDates(d: TripDates): string | null {
  if (d.start && d.end) return `${d.start} → ${d.end}`
  if (d.duration_days) return `${d.duration_days} дн.`
  return null
}

const fields = computed(() => {
  const d = props.draft
  return [
    { label: 'Откуда', value: d.origin?.name ?? null },
    { label: 'Куда', value: d.destinations.length ? d.destinations.map((p) => p.name).join(', ') : null },
    { label: 'Даты', value: formatDates(d.dates) },
    { label: 'Кто едет', value: formatTravelers(d.travelers) },
    { label: 'Пожелания', value: d.needs.length ? d.needs.join(', ') : null },
  ]
})

const filledCount = computed(() => fields.value.filter((f) => f.value).length)
const fraction = computed(() => filledCount.value / fields.value.length)
const rows = computed(() => fields.value.map((f) => ({ ...f, filled: Boolean(f.value) })))
</script>