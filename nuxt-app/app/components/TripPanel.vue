<template>
  <div class="flex h-full flex-col p-4">
    <div class="mb-3 flex items-center gap-2 text-sm">
      <span class="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
        {{ state?.trip.start ?? '—' }} → {{ state?.trip.end ?? '—' }}
      </span>
      <span v-if="state" class="text-xs text-slate-400">
        {{ state.trip.travelers }} чел.
      </span>
      <button
        v-if="state && onSaveRoute"
        type="button"
        class="ml-auto shrink-0 cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium transition"
        :class="saved
          ? 'bg-emerald-50 text-emerald-600'
          : 'bg-blue-600 text-white hover:bg-blue-700'"
        @click="onSaveRoute"
      >
        {{ saved ? 'Сохранено ✓' : 'Сохранить' }}
      </button>
    </div>

    <!-- Бюджет -->
    <div
      v-if="state"
      class="mb-3 flex flex-col gap-1 rounded-xl border p-3"
      :class="budgetStatus === 'over' ? 'border-red-200 bg-red-50' : budgetStatus === 'ok' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'"
    >
      <div class="flex items-baseline justify-between text-sm">
        <span class="font-medium">Стоимость поездки</span>
        <span class="tabular-nums font-semibold">{{ fmt(spent) }} {{ currency }}</span>
      </div>
      <div v-if="state.preferences.budget != null" class="flex items-center justify-between text-xs">
        <span class="text-slate-500">Бюджет: {{ fmt(state.preferences.budget) }} {{ currency }}</span>
        <span
          class="font-medium"
          :class="budgetStatus === 'over' ? 'text-red-600' : 'text-emerald-600'"
        >
          {{
            budgetStatus === 'over'
              ? `превышен на ${fmt(spent - state.preferences.budget!)}`
              : `осталось ${fmt(state.preferences.budget - spent)}`
          }}
        </span>
      </div>
      <div class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white">
        <div
          class="h-full rounded-full transition-all"
          :class="budgetStatus === 'over' ? 'bg-red-500' : 'bg-emerald-500'"
          :style="{ width: budgetPct + '%' }"
        />
      </div>
      <p v-if="budgetStatus === 'over'" class="text-[11px] text-red-600">
        Выбранные варианты не влезают в бюджет — выбери более дешёвый билет или отель ниже.
      </p>
      <p v-else-if="state.preferences.budget == null && spent > 0" class="text-[11px] text-slate-400">
        Бюджет не указан — выбран самый дешёвый вариант. Напиши в чат «бюджет N», чтобы ограничить сумму.
      </p>
    </div>

    <!-- Транспорт -->
    <div v-if="state && legGroups.length" class="mb-3 flex flex-col gap-2">
      <p class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Перелёты</p>
      <div v-for="group in legGroups" :key="group.key" class="rounded-xl border p-2.5">
        <p class="mb-1.5 text-xs font-medium text-slate-600">
          {{ placeName(group.from) }} → {{ placeName(group.to) }}
        </p>
        <div class="flex flex-col gap-1">
          <button
            v-for="opt in group.options"
            :key="opt.id"
            type="button"
            class="flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition"
            :class="opt.id === selectedLegFor(group.key)?.id
              ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
              : overBudget(legCost(opt))
                ? 'border-red-200 bg-red-50/50 hover:bg-red-50'
                : 'border-slate-200 bg-slate-50 hover:bg-slate-100'"
            @click="onSelectTransport?.(opt)"
          >
            <span
              class="h-3.5 w-3.5 shrink-0 rounded-full border-2"
              :class="opt.id === selectedLegFor(group.key)?.id ? 'border-blue-600 bg-blue-500' : 'border-slate-300'"
            />
            <span class="min-w-0">
              <span class="block font-medium">{{ modeLabel(opt.mode) }}</span>
              <span v-if="opt.departure || opt.arrival" class="block text-slate-500">
                {{ datetime(opt.departure) }}{{ opt.arrival ? ' → ' + datetime(opt.arrival) : '' }}{{ opt.duration_min ? `, ${Math.round(opt.duration_min / 60)} ч` : '' }}
              </span>
            </span>
            <span class="ml-auto flex shrink-0 flex-col items-end gap-0.5">
              <span class="font-semibold tabular-nums">{{ fmt(opt.price) }} {{ opt.currency }}</span>
              <a
                v-if="opt.booking_url"
                :href="opt.booking_url"
                target="_blank"
                rel="noopener"
                class="cursor-pointer rounded-lg bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-blue-700"
                @click.stop
              >
                купить
              </a>
            </span>
          </button>
        </div>
      </div>
    </div>

    <!-- Отели -->
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
        <div v-if="hotelsFor(stop.place_id).length" class="mt-2 flex flex-col gap-1.5">
          <div
            v-for="hotel in hotelsFor(stop.place_id)"
            :key="hotel.id"
            class="rounded-lg border transition"
            :class="isHotelSelected(hotel)
              ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
              : overBudget(hotelCost(hotel))
                ? 'border-red-200 bg-red-50/50'
                : 'border-slate-200 bg-slate-50 hover:bg-slate-100'"
          >
            <button
              type="button"
              class="flex w-full cursor-pointer items-center gap-2.5 px-2.5 py-2 text-left"
              @click="onSelectHotel?.(hotel)"
            >
              <span
                class="h-3.5 w-3.5 shrink-0 rounded-full border-2"
                :class="isHotelSelected(hotel) ? 'border-blue-600 bg-blue-500' : 'border-slate-300'"
              />
              <img
                v-if="hotel.image_url"
                :src="hotel.image_url"
                :alt="hotel.name"
                class="h-16 w-16 shrink-0 rounded-lg object-cover"
                loading="lazy"
              >
              <span class="min-w-0">
                <span class="block truncate font-medium">{{ hotel.name }}</span>
                <span class="block text-slate-500">
                  {{ hotel.rating ? `★ ${hotel.rating} · ` : '' }}{{ fmt(hotel.price_per_night) }} {{ hotel.currency }}/ночь
                </span>
              </span>
              <a
                v-if="hotel.booking_url"
                :href="hotel.booking_url"
                target="_blank"
                rel="noopener"
                class="ml-auto shrink-0 cursor-pointer rounded-lg bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-blue-700"
                @click.stop
              >
                купить
              </a>
            </button>

            <!-- Выбор ночей прямо в карточке выбранного отеля -->
            <div v-if="stayFor(hotel)" class="flex items-center justify-between border-t border-blue-200 px-2.5 py-2">
              <span class="text-xs font-medium text-blue-700">Ночей в этом отеле</span>
              <span class="flex items-center gap-1">
                <button
                  type="button"
                  class="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md bg-white text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-100"
                  @click="onChangeNights?.(stayFor(hotel)!, -1)"
                >
                  −
                </button>
                <span class="w-14 text-center text-sm tabular-nums font-semibold text-slate-700">
                  {{ stayFor(hotel)?.nights }}
                </span>
                <button
                  type="button"
                  class="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md bg-white text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-100"
                  @click="onChangeNights?.(stayFor(hotel)!, 1)"
                >
                  +
                </button>
              </span>
            </div>
          </div>

          <p v-if="nightsTotal(stop.place_id) && nightsTotal(stop.place_id) !== stop.days" class="text-[11px] text-amber-600">
            Распределено {{ nightsTotal(stop.place_id) }} из {{ stop.days }} ноч. — свободно {{ stop.days - nightsTotal(stop.place_id) }}
          </p>
          <p v-else-if="nightsTotal(stop.place_id) === 0" class="text-[11px] text-slate-400">
            Выбери отель — ночи города распределятся автоматически
          </p>
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
import type { HotelOption, HotelStay, TransportLeg, TransportMode, TripState, ValidatorIssue } from '~shared'

const props = defineProps<{
  state: TripState | null
  issues: ValidatorIssue[]
  onSelectTransport?: (leg: TransportLeg) => void
  onSelectHotel?: (hotel: HotelOption) => void
  onChangeNights?: (stay: HotelStay, delta: number) => void
  onSaveRoute?: () => void
  saved?: boolean
}>()

const MODE_LABEL: Record<TransportMode, string> = {
  flight: 'Авиа',
  train: 'Поезд',
  bus: 'Автобус',
  car: 'Авто',
}

function modeLabel(mode: TransportMode): string {
  return MODE_LABEL[mode] ?? mode
}

function fmt(v: number | null | undefined): string {
  return v == null ? '—' : Math.round(v).toLocaleString('ru-RU')
}

function datetime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const date = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  return `${date} ${time}`
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

// ─── Выбранные отели (hotel_stays) ─────────────────────────────────────

function stays(): HotelStay[] {
  return props.state?.hotel_stays ?? []
}

function stayFor(hotel: HotelOption): HotelStay | null {
  return stays().find((s) => s.hotel_id === hotel.id) ?? null
}

function isHotelSelected(hotel: HotelOption): boolean {
  return Boolean(stayFor(hotel))
}

function selectedStaysFor(placeId: string): HotelStay[] {
  return stays().filter((s) => s.place_id === placeId)
}

function nightsTotal(placeId: string): number {
  return selectedStaysFor(placeId).reduce((sum, s) => sum + s.nights, 0)
}

function nightsFor(placeId: string): number {
  return props.state?.stops.find((s) => s.place_id === placeId)?.days ?? 0
}

// ─── Транспорт: группировка вариантов по паре from→to ──────────────────

interface LegGroup {
  key: string
  from: string
  to: string
  options: TransportLeg[]
}

const legGroups = computed<LegGroup[]>(() => {
  const state = props.state
  if (!state) return []
  const sources = state.transport_options?.length ? state.transport_options : state.transport
  const map = new Map<string, TransportLeg[]>()
  for (const leg of sources ?? []) {
    const key = `${leg.from_place_id}->${leg.to_place_id}`
    const list = map.get(key) ?? []
    if (!list.some((o) => o.id === leg.id)) list.push(leg)
    map.set(key, list)
  }
  return [...map.entries()].map(([key, options]) => {
    const [from, to] = key.split('->')
    return { key, from, to, options }
  })
})

function selectedLegFor(key: string): TransportLeg | null {
  const [from, to] = key.split('->')
  return props.state?.transport.find((l) => l.from_place_id === from && l.to_place_id === to) ?? null
}

// ─── Стоимость и бюджет ────────────────────────────────────────────────

function hotelCost(hotel: HotelOption): number {
  // Стоимость при выборе отеля на все свободные ночи города
  const nights = stayFor(hotel)?.nights ?? Math.max(1, nightsFor(hotel.place_id) - nightsUsedElsewhere(hotel.place_id))
  return (hotel.price_per_night ?? 0) * nights
}

function nightsUsedElsewhere(placeId: string): number {
  return selectedStaysFor(placeId).reduce((sum, s) => sum + s.nights, 0)
}

// Текущая стоимость по выбранным перегонам + отелям (hotel_stays)
function currentCost(): number {
  const state = props.state
  if (!state) return 0
  const transport = state.transport.reduce((s, l) => s + (l.price ?? 0), 0)
  const hotels = stays().reduce((s, stay) => {
    const h = state.hotels.find((x) => x.id === stay.hotel_id)
    return s + (h ? (h.price_per_night ?? 0) * stay.nights : 0)
  }, 0)
  return transport + hotels
}

// Стоимость, если выбрать конкретный перегон (для подсветки «в/вне бюджета»)
function legCost(leg: TransportLeg): number {
  const state = props.state
  if (!state) return leg.price ?? 0
  const transport = state.transport.reduce((s, l) => {
    if (l.from_place_id === leg.from_place_id && l.to_place_id === leg.to_place_id) return s
    return s + (l.price ?? 0)
  }, leg.price ?? 0)
  const hotels = stays().reduce((s, stay) => {
    const h = state.hotels.find((x) => x.id === stay.hotel_id)
    return s + (h ? (h.price_per_night ?? 0) * stay.nights : 0)
  }, 0)
  return transport + hotels
}

function overBudget(cost: number): boolean {
  const budget = props.state?.preferences.budget
  return budget != null && cost > budget
}

const currency = computed(() => props.state?.preferences.currency ?? 'RUB')

const spent = computed(() => currentCost())

const budgetStatus = computed<'ok' | 'over' | 'none'>(() => {
  const budget = props.state?.preferences.budget
  if (budget == null) return 'none'
  return spent.value > budget ? 'over' : 'ok'
})

const budgetPct = computed(() => {
  const budget = props.state?.preferences.budget
  if (budget == null || budget <= 0) return 0
  return Math.min(100, Math.round((spent.value / budget) * 100))
})
</script>
