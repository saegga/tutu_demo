<template>
  <div class="flex h-full flex-col p-4">
    <div class="mb-3 flex items-center gap-2 text-sm">
      <span class="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
        {{ state?.trip.start ?? '—' }} → {{ state?.trip.end ?? '—' }}
      </span>
      <span v-if="state" class="text-xs text-slate-400">
        {{ state.trip.travelers }} чел.
      </span>
    </div>

    <div v-if="state && state.transport.length" class="mb-3 flex flex-col gap-1">
      <p class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Перелёты</p>
      <div
        v-for="leg in state.transport"
        :key="leg.id"
        class="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs"
      >
        <span class="font-medium">{{ modeLabel(leg.mode) }}</span>
        <span>{{ placeName(leg.from_place_id) }} → {{ placeName(leg.to_place_id) }}</span>
        <span v-if="leg.price" class="text-slate-500">{{ leg.price }} {{ leg.currency }}</span>
        <span v-if="leg.duration_min" class="text-slate-400">{{ Math.round(leg.duration_min / 60) }} ч</span>
        <a
          v-if="leg.booking_url"
          :href="leg.booking_url"
          target="_blank"
          rel="noopener"
          class="ml-auto text-blue-600 hover:underline"
        >
          купить
        </a>
      </div>
    </div>

    <div v-if="state && state.stops.length" class="flex flex-col gap-2 overflow-y-auto">
      <div
        v-for="stop in orderedStops"
        :key="stop.place_id"
        class="rounded-xl border p-3"
      >
        <div class="flex items-baseline justify-between">
          <span class="font-medium">{{ placeName(stop.place_id) }}</span>
          <span class="text-xs text-slate-500">{{ stop.days }} ноч.</span>
        </div>
        <div v-if="hotelsFor(stop.place_id).length" class="mt-2 flex flex-col gap-1">
          <a
            v-for="hotel in hotelsFor(stop.place_id)"
            :key="hotel.id"
            :href="hotel.booking_url ?? undefined"
            target="_blank"
            rel="noopener"
            class="flex items-center gap-2.5 rounded-lg bg-slate-50 px-2.5 py-2 hover:bg-slate-100"
          >
            <img
              v-if="hotel.image_url"
              :src="hotel.image_url"
              :alt="hotel.name"
              class="h-10 w-10 shrink-0 rounded-md object-cover"
              loading="lazy"
            >
            <span class="min-w-0">
              <span class="block truncate font-medium">{{ hotel.name }}</span>
              <span v-if="hotel.price_per_night" class="block text-slate-500">
                {{ hotel.price_per_night }} {{ hotel.currency }}/ночь
              </span>
            </span>
          </a>
        </div>
      </div>
    </div>

    <div v-else class="flex flex-1 items-center justify-center text-sm text-slate-400">
      Сгенерируй маршрут — детали появятся здесь
    </div>

    <div v-if="issues.length" class="mt-3 flex flex-col gap-1">
      <p
        v-for="issue in issues"
        :key="issue.code"
        class="rounded-lg px-2.5 py-1 text-[11px]"
        :class="issue.severity === 'error' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'"
      >
        {{ issue.message }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { HotelOption, TransportMode, TripState, ValidatorIssue } from '~shared'

const props = defineProps<{ state: TripState | null; issues: ValidatorIssue[] }>()

const MODE_LABEL: Record<TransportMode, string> = {
  flight: 'Авиа',
  train: 'Поезд',
  bus: 'Автобус',
  car: 'Авто',
}

function modeLabel(mode: TransportMode): string {
  return MODE_LABEL[mode] ?? mode
}

const orderedStops = computed(() =>
  [...(props.state?.stops ?? [])].sort((a, b) => a.order - b.order),
)

function placeName(id: string): string {
  return props.state?.places.find((p) => p.id === id)?.name ?? id
}

function hotelsFor(placeId: string): HotelOption[] {
  return (props.state?.hotels ?? []).filter((h) => h.place_id === placeId)
}
</script>