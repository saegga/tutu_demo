import {
  isDraftReadyToGenerate,
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
    hotels: [],
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

  const hotelsBefore = state.hotels.length
  state = await enrichTripStateWithHotels(state).catch((e) => {
    console.error('[MCP] hotels enrich failed:', e)
    warn('Не удалось подобрать отели (MCP недоступен).')
    return state
  })
  if (state.stops.length > 0 && state.hotels.length === hotelsBefore) {
    warn('Отели не найдены — попробуй указать город точнее или конкретные даты.')
  }

  const transportBefore = state.transport.length
  state = await enrichTripStateWithTransport(state, draft.needs).catch((e) => {
    console.error('[MCP] transport enrich failed:', e)
    warn('Не удалось подобрать перелёты (MCP недоступен).')
    return state
  })
  if (state.transport.length === transportBefore && state.stops.length > 0) {
    warn('Перелёты по маршруту не найдены — уточни города отправления/назначения.')
  }

  return { state, issues }
}