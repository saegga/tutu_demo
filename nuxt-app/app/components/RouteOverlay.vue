<template>
  <div class="relative h-full w-full overflow-hidden">
    <TripMap :state="state" :active="true" class="absolute inset-0" />

    <!-- Основная панель: прогресс сбора поездки (по умолчанию) -->
    <div
      v-if="!mapOpen"
      class="absolute inset-0 z-[800] overflow-y-auto bg-white"
    >
      <ProgressPanel :draft="draft" :generated="Boolean(state)" />
    </div>

    <!-- Выезжающая панель маршрута (перелёты/отели) -->
    <aside
      class="absolute inset-0 z-[900] bg-white shadow-xl transition-transform duration-300"
      :class="open ? 'translate-x-0' : 'translate-x-full'"
    >
      <TripPanel :state="state" :issues="issues" />
    </aside>

    <!-- Кнопки: карта и маршрут -->
    <div class="absolute right-3 top-3 z-[1000] flex gap-2">
      <button
        class="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-xs font-medium text-slate-700 shadow-lg transition hover:bg-slate-50"
        @click="toggleMap"
      >
        {{ mapOpen ? 'Скрыть карту' : 'Карта' }}
      </button>
      <button
        class="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-xs font-medium text-slate-700 shadow-lg transition hover:bg-slate-50"
        @click="toggleRoute"
      >
        <svg
          class="h-3.5 w-3.5 transition-transform"
          :class="open ? 'rotate-180' : ''"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
        <span>{{ open ? 'Скрыть' : 'Маршрут' }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TripDraft, TripState, ValidatorIssue } from '~shared'

const props = defineProps<{ state: TripState | null; issues: ValidatorIssue[]; draft: TripDraft }>()

const open = ref(false)
const mapOpen = ref(false)

// Автооткрытие панели маршрута, когда маршрут сгенерирован/обновлён
watch(
  () => props.state,
  (val) => {
    if (val && !mapOpen.value) open.value = true
  },
)

function toggleMap() {
  mapOpen.value = !mapOpen.value
  if (mapOpen.value) open.value = false
}

function toggleRoute() {
  open.value = !open.value
  if (open.value) mapOpen.value = false
}
</script>