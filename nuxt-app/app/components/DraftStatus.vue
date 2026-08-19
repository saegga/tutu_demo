<template>
  <div class="flex flex-col gap-1 text-xs">
    <div
      v-for="field in fields"
      :key="field.label"
      class="flex items-start gap-1.5"
      :class="field.value ? 'text-slate-700' : 'text-slate-400'"
    >
      <span class="shrink-0 font-medium">{{ field.label }}:</span>
      <span class="whitespace-pre-wrap">{{ field.value || '—' }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TripDraft } from '~shared'

const props = defineProps<{ draft: TripDraft }>()

const fields = computed(() => {
  const d = props.draft
  const dates = d.dates.start && d.dates.end
    ? `${d.dates.start} → ${d.dates.end}`
    : d.dates.duration_days
      ? `на ${d.dates.duration_days} дней`
      : ''
  const travelers = d.travelers
    ? `${d.travelers.adults} взросл.${d.travelers.children ? `, ${d.travelers.children} детей` : ''}`
    : ''

  return [
    { label: 'Откуда', value: d.origin?.name ?? '' },
    { label: 'Куда', value: d.destinations.map((p) => p.name).join(', ') },
    { label: 'Даты', value: dates },
    { label: 'Кто едет', value: travelers },
    { label: 'Пожелания', value: d.needs.join(', ') },
  ]
})
</script>