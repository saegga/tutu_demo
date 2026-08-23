<template>
  <div class="relative h-full w-full overflow-hidden">
    <TripMap :state="state" :active="true" class="absolute inset-0" />

    <!-- Панель сбора поездки (чек-лист) — доступна и после генерации -->
    <aside
      class="absolute inset-0 z-[900] bg-white shadow-xl transition-transform duration-300"
      :class="collectOpen ? 'translate-x-0' : 'translate-x-full'"
    >
      <ProgressPanel :draft="draft" :generated="Boolean(state)" />
    </aside>

    <!-- Панель маршрута (перелёты/отели) -->
    <aside
      class="absolute inset-0 z-[950] bg-white shadow-xl transition-transform duration-300"
      :class="routeOpen ? 'translate-x-0' : 'translate-x-full'"
    >
      <TripPanel
        :state="state"
        :issues="issues"
        :on-select-transport="onSelectTransport"
        :on-select-hotel="onSelectHotel"
        :on-change-nights="onChangeNights"
        :on-save-route="onSaveRoute"
        :saved="saved"
      />
    </aside>

    <!-- Панель сохранённых маршрутов -->
    <aside
      class="absolute inset-0 z-[980] bg-white shadow-xl transition-transform duration-300"
      :class="savedOpen ? 'translate-x-0' : 'translate-x-full'"
    >
      <SavedTrips
        :trips="savedTrips"
        :loading="savedLoading"
        @close="savedOpen = false"
        @open="openSaved"
        @delete="deleteSaved"
      />
    </aside>

    <!-- Кнопки: сбор поездки, мои маршруты, карта и маршрут -->
    <div class="absolute right-3 top-3 z-[1000] flex gap-2">
      <button
        class="flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium shadow-lg transition"
        :class="collectOpen && !routeOpen
          ? 'bg-blue-600 text-white hover:bg-blue-700'
          : 'bg-white text-slate-700 hover:bg-slate-50'"
        @click="toggleCollect"
      >
        Сбор поездки
      </button>
      <button
        type="button"
        class="flex cursor-pointer items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-xs font-medium text-slate-700 shadow-lg transition hover:bg-slate-50"
        @click="toggleSaved"
      >
        Мои маршруты
      </button>
      <button
        class="flex cursor-pointer items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-xs font-medium text-slate-700 shadow-lg transition hover:bg-slate-50"
        @click="toggleMap"
      >
        {{ mapOpen ? 'Скрыть карту' : 'Карта' }}
      </button>
      <button
        class="flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium shadow-lg transition"
        :class="routeOpen && !collectOpen
          ? 'bg-blue-600 text-white hover:bg-blue-700'
          : 'bg-white text-slate-700 hover:bg-slate-50'"
        @click="toggleRoute"
      >
        <svg
          class="h-3.5 w-3.5 transition-transform"
          :class="routeOpen ? 'rotate-180' : ''"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
        <span>{{ routeOpen ? 'Скрыть' : 'Маршрут' }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { HotelOption, HotelStay, TransportLeg, TripDraft, TripState, ValidatorIssue } from '~shared'

const props = defineProps<{
  state: TripState | null
  issues: ValidatorIssue[]
  draft: TripDraft
  onSelectTransport?: (leg: TransportLeg) => void
  onSelectHotel?: (hotel: HotelOption) => void
  onChangeNights?: (stay: HotelStay, delta: number) => void
  onSaveRoute?: () => void
  saved?: boolean
  onListTrips?: () => Promise<{ id: string; title: string | null; updated_at: string }[]>
  onLoadTrip?: (id: string) => Promise<void>
  onDeleteTrip?: (id: string) => Promise<void>
}>()

const routeOpen = ref(false)
const collectOpen = ref(false)
const mapOpen = ref(false)
const savedOpen = ref(false)
const savedTrips = ref<{ id: string; title: string | null; updated_at: string }[]>([])
const savedLoading = ref(false)

// Автооткрытие панели маршрута, когда маршрут сгенерирован/обновлён
watch(
  () => props.state,
  (val) => {
    if (val && !mapOpen.value) {
      collectOpen.value = false
      routeOpen.value = true
    }
  },
)

// До генерации показываем сбор поездки по умолчанию
if (!props.state) collectOpen.value = true

async function toggleSaved() {
  if (!savedOpen.value) {
    savedLoading.value = true
    savedTrips.value = await props.onListTrips?.() ?? []
    savedLoading.value = false
  }
  savedOpen.value = !savedOpen.value
  if (savedOpen.value) {
    routeOpen.value = false
    collectOpen.value = false
    mapOpen.value = false
  }
}

function openSaved(id: string) {
  savedOpen.value = false
  props.onLoadTrip?.(id)
}

async function deleteSaved(id: string) {
  await props.onDeleteTrip?.(id)
  savedTrips.value = await props.onListTrips?.() ?? []
}

function toggleMap() {
  mapOpen.value = !mapOpen.value
  if (mapOpen.value) {
    routeOpen.value = false
    collectOpen.value = false
    savedOpen.value = false
  }
}

function toggleRoute() {
  routeOpen.value = !routeOpen.value
  collectOpen.value = false
  savedOpen.value = false
  if (routeOpen.value) mapOpen.value = false
}

function toggleCollect() {
  collectOpen.value = !collectOpen.value
  routeOpen.value = false
  savedOpen.value = false
  if (collectOpen.value) mapOpen.value = false
}
</script>