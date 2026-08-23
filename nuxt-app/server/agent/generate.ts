import {
  isDraftReadyToGenerate,
  type HotelStay,
  type Pace,
  type Place,
  type Preferences,
  type Stop,
  type TransportMode,
  type TripDraft,
  type TripState,
  type ValidatorIssue,
} from '~shared'

import { optimizeTrip } from '../core/optimize'
import { daysBetween, validateTrip } from '../core/validate'
import { enrichTripStateWithHotels, enrichTripStateWithTransport } from '../mcp/enrich'
import { runGenerationAgent } from './generate-agent'
import { geocode } from '../utils/geocode'
import { resolveSearchCity } from './country-cities'
import { parseTransportMode } from './transport-mode'

// ─── Вспомогательные ───────────────────────────────────────────────────

// Длительность по умолчанию, когда даты/срок не указаны
const DEFAULT_NIGHTS = 7

function nearestStartDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 21)
  return d.toISOString().slice(0, 10)
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

// Дата из draft может оказаться в прошлом (модель могла поставить не тот год).
// Сдвигаем на целые годы вперёд до ближайшего будущего.
function shiftToFuture(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  const today = new Date(`${todayIso()}T00:00:00Z`)
  while (d.getTime() < today.getTime()) {
    d.setUTCFullYear(d.getUTCFullYear() + 1)
  }
  return d.toISOString().slice(0, 10)
}

function totalTravelers(travelers: TripDraft['travelers']): number {
  return (travelers?.adults ?? 1) + (travelers?.children ?? 0)
}

function parseBudget(text: string): number | null {
  if (/люкс|премиум|дорог|бутик/.test(text)) return 300_000
  if (/бюджет|эконом|дешёв|дешев|хостел|экономно/.test(text)) return 60_000
  if (/средн|комфорт|нормальн/.test(text)) return 120_000
  return null
}

function parsePace(text: string): Pace {
  if (/спокойн|релакс|медленн|без спеш/.test(text)) return 'relaxed'
  if (/насыщен|активн|много успеть|интенсив/.test(text)) return 'fast'
  return 'moderate'
}

function buildPreferences(needs: string[], prefs: Record<string, unknown>): Preferences {
  const joined = needs.join(' ').toLowerCase()
  const interests = (prefs.interests as Record<string, number> | undefined) ?? {}

  return {
    budget: parseBudget(joined) ?? (prefs.budget as number | null | undefined) ?? null,
    currency: (prefs.currency as string | undefined) ?? 'RUB',
    pace: parsePace(joined),
    interests,
    transportMode:
      parseTransportMode(joined)
      ?? (prefs.transportMode as TransportMode | undefined),
  }
}

async function resolvePlace(place: Place): Promise<Place> {
  const searchName = resolveSearchCity(place.name)
  const query = searchName ?? place.name

  let coords = place.lat !== 0 && place.lng !== 0 ? { lat: place.lat, lng: place.lng } : null
  if (!coords) coords = await geocode(query)
  if (!coords) return place

  return { ...place, searchName: searchName ?? undefined, ...coords }
}

function distributeDays(destinations: Place[], nights: number): Stop[] {
  const n = destinations.length
  if (n === 0) return []

  const base = Math.max(1, Math.floor(nights / n))
  const remainder = nights - base * n

  return destinations.map((p, i) => ({
    place_id: p.id,
    days: base + (i < remainder ? 1 : 0),
    locked: false,
    order: i,
  }))
}

// ─── Генерация TripState из draft ──────────────────────────────────────

export async function generateTripState(
  draft: TripDraft,
  prefs: Record<string, unknown>,
  resolve?: (place: Place) => Promise<Place>,
): Promise<TripState> {
  if (!isDraftReadyToGenerate(draft) || !draft.origin || !draft.travelers) {
    throw new Error('draft not ready for generation')
  }

  const hasExactDates = Boolean(draft.dates.start && draft.dates.end)
  const nights = draft.dates.duration_days
    ?? (hasExactDates ? daysBetween(draft.dates.start!, draft.dates.end!) : DEFAULT_NIGHTS)

  let start = draft.dates.start ?? nearestStartDate()
  if (start < todayIso()) start = shiftToFuture(start)

  const end = hasExactDates
    ? addDays(start, daysBetween(draft.dates.start!, draft.dates.end!))
    : addDays(start, nights)

  const resolvePlaceFn = resolve ?? resolvePlace
  const places = await Promise.all(
    [draft.origin, ...draft.destinations].map((p) => resolvePlaceFn(p)),
  )

  const stops = distributeDays(draft.destinations, nights)

  const state: TripState = {
    trip: {
      start,
      end,
      travelers: totalTravelers(draft.travelers),
    },
    preferences: buildPreferences(draft.needs, prefs),
    places,
    stops,
    activities: [],
    transport: [],
    transport_options: [],
    hotels: [],
    hotel_stays: [],
    constraints: (prefs.constraints as unknown[] | undefined)?.map((c, i) => ({
      id: `pc-${i}`,
      kind: 'custom' as const,
      text: String(c),
    })) ?? [],
    pending_actions: [],
    updated_at: new Date().toISOString(),
  }

  return optimizeTrip(state)
}

// ─── Полный билд состояния: generate → validate → enrich ──────────────
// Используется и кнопкой «Сгенерировать маршрут», и авто-перегенерацией в чате.

export interface GeneratedResult {
  state: TripState
  issues: ValidatorIssue[]
}

export async function buildGeneratedState(
  draft: TripDraft,
  prefs: Record<string, unknown>,
): Promise<GeneratedResult> {
  let state = await generateTripState(draft, prefs)
  const validation = validateTrip(state)
  const issues = [...validation.issues]

  const warn = (message: string) => {
    issues.push({ code: 'enrich_warning', severity: 'warning', message })
  }

  // MCP через агента (тулинг): LLM вызывает search_transport / search_hotels.
  // Детерминированную логику (виды транспорта по перегонам) агент получает в промпте.
  try {
    const agent = await runGenerationAgent(state, draft.needs)
    if (agent.transport.length > 0) state = { ...state, transport: agent.transport }
    if (agent.transport_options.length > 0) state = { ...state, transport_options: agent.transport_options }
    if (agent.hotels.length > 0) state = { ...state, hotels: agent.hotels }
  } catch (e) {
    console.error('[agent] MCP-тулинг не сработал, переключаюсь на фолбэк:', e)
  }

  // Фолбэк: если агент не нашёл ничего (LLM/инструменты) — детерминированный enrich.
  if (state.stops.length > 0 && state.transport.length === 0) {
    state = await enrichTripStateWithTransport(state, draft.needs).catch((e) => {
      console.error('[MCP] transport enrich failed:', e)
      warn('Не удалось подобрать перелёты (MCP недоступен).')
      return state
    })
  }
  if (state.stops.length > 0 && state.transport.length === 0) {
    warn('Перелёты по маршруту не найдены — уточни города отправления/назначения.')
  }

  if (state.stops.length > 0 && state.hotels.length === 0) {
    state = await enrichTripStateWithHotels(state).catch((e) => {
      console.error('[MCP] hotels enrich failed:', e)
      warn('Не удалось подобрать отели (MCP недоступен).')
      return state
    })
  }
  if (state.stops.length > 0 && state.hotels.length === 0) {
    warn('Отели не найдены — попробуй указать город точнее или конкретные даты.')
  }

  // Дефолтный выбор: в рамках бюджета, если он указан; иначе — минимальные суммы.
  state = applyDefaultSelection(state)

  return { state, issues }
}

// ─── Дефолтный выбор вариантов ─────────────────────────────────────────
// Транспорт: по каждому перегону берём самый дешёвый вариант из transport_options,
// который влезает в бюджет (если бюджет указан). Если ничего не влезает — самый дешёвый.
// Отели: по каждому городу — самый дешёвый отель, который влезает в бюджет; иначе самый дешёвый.
export function applyDefaultSelection(state: TripState): TripState {
  const budget = state.preferences.budget

  // Транспорт: перегон уже может быть выбран (из агента/фолбэка). Если выбранного нет —
  // выбираем самый дешёвый из вариантов в рамках бюджета.
  const spentTransport = state.transport.reduce((sum, l) => sum + (l.price ?? 0), 0)
  const transport = pickLegs(state, budget != null ? budget - spentTransport : null)
    .map((l) => l ?? null)
    .filter((l): l is NonNullable<typeof l> => l !== null)

  // Отели: по городу — самый дешёвый в рамках бюджета (с учётом уже выбранного транспорта).
  const stays: HotelStay[] = []
  let remaining = budget != null ? budget - transport.reduce((s, l) => s + (l.price ?? 0), 0) : null

  const stops = [...state.stops].sort((a, b) => a.order - b.order)
  for (const stop of stops) {
    const candidates = (state.hotels ?? []).filter((h) => h.place_id === stop.place_id)
    if (candidates.length === 0) continue
    const nights = Math.max(1, stop.days)

    const affordable = budget == null || remaining == null
      ? candidates
      : candidates.filter((h) => (h.price_per_night ?? 0) * nights <= remaining + 0.5)
    const chosen = [...(affordable.length ? affordable : candidates)]
      .sort((a, b) => (a.price_per_night ?? Number.POSITIVE_INFINITY) - (b.price_per_night ?? Number.POSITIVE_INFINITY))[0]

    stays.push({ hotel_id: chosen.id, place_id: stop.place_id, nights })
    if (remaining != null && chosen.price_per_night != null) {
      remaining -= chosen.price_per_night * nights
    }
  }

  return { ...state, transport, hotel_stays: stays }
}

// Выбор перегонов: по паре from→to берём самый дешёвый из transport_options,
// который влезает в оставшийся бюджет. Если такого нет — самый дешёвый вообще.
function pickLegs(state: TripState, remainingBudget: number | null): Array<TransportLeg | null> {
  const byPair = new Map<string, TransportLeg[]>()
  for (const opt of state.transport_options ?? []) {
    const key = `${opt.from_place_id}->${opt.to_place_id}`
    const list = byPair.get(key) ?? []
    if (!list.some((o) => o.id === opt.id)) list.push(opt)
    byPair.set(key, list)
  }

  const pairs = new Map<string, string>()
  const stops = [...state.stops].sort((a, b) => a.order - b.order)
  const origin = state.places[0]
  if (origin) pairs.set(`${origin.id}->${stops[0]?.place_id}`, '')
  for (let i = 0; i < stops.length - 1; i++) {
    pairs.set(`${stops[i].place_id}->${stops[i + 1].place_id}`, '')
  }
  if (stops.length > 0 && origin) pairs.set(`${stops[stops.length - 1].place_id}->${origin.id}`, '')

  const result: Array<TransportLeg | null> = []
  let remaining = remainingBudget
  for (const key of pairs.keys()) {
    const options = byPair.get(key)
    if (!options || options.length === 0) {
      result.push(null)
      continue
    }
    const sorted = [...options].sort(
      (a, b) => (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY),
    )
    const chosen = remaining == null
      ? sorted[0]
      : (sorted.find((o) => (o.price ?? 0) <= remaining + 0.5) ?? sorted[0])
    if (remaining != null && chosen.price != null) remaining -= chosen.price
    result.push(chosen)
  }
  return result
}