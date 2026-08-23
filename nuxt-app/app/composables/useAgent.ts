import { createClient } from '@supabase/supabase-js'
import {
  emptyDraft,
  isDraftReadyToGenerate,
  type AgentStatus,
  type HotelOption,
  type HotelStay,
  type TransportLeg,
  type TripDraft,
  type TripState,
  type ValidatorIssue,
} from '~shared'

export interface UiMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
}

// Модульный синглтон: стейт общий для всех вызовов useAgent()
const tripId = ref<string | null>(null)
const draft = ref<TripDraft>(emptyDraft())
const messages = ref<UiMessage[]>([])
const status = ref<AgentStatus>('idle')
const tripState = ref<TripState | null>(null)
const issues = ref<ValidatorIssue[]>([])
const busy = ref(false)
const error = ref<string | null>(null)
const saved = ref(false)

const readyToGenerate = computed(() => isDraftReadyToGenerate(draft.value))

let supabase: ReturnType<typeof createClient> | null = null
let anonToken = ''

// В sqlite/mock-режиме (NUXT_PUBLIC_DB_MODE !== 'supabase') Supabase не используется
function needsSupabase(): boolean {
  return useRuntimeConfig().public.dbMode !== 'sqlite' && useRuntimeConfig().public.dbMode !== 'mock'
}

function getClient() {
  if (supabase) return supabase
  const config = useRuntimeConfig()
  supabase = createClient(
    config.public.supabaseUrl,
    config.public.supabasePublishableKey,
  )
  return supabase
}

async function ensureSession() {
  if (anonToken || !needsSupabase()) return
  try {
    const { data, error: signInError } = await getClient().auth.signInAnonymously()
    if (signInError) {
      error.value = `Ошибка входа: ${signInError.message}`
      return
    }
    anonToken = data.session?.access_token ?? ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

function headers() {
  return anonToken ? { 'x-supabase-auth': anonToken } : {}
}

async function init() {
  if (tripId.value) return
  await ensureSession()
  try {
    const trip = await $fetch('/api/trip', { method: 'POST', headers: headers() })
    tripId.value = trip.id
    if (trip.draft) draft.value = trip.draft
  } catch (e) {
    error.value = String(e)
  }
}

async function reset() {
  tripId.value = null
  draft.value = emptyDraft()
  messages.value = []
  tripState.value = null
  issues.value = []
  status.value = 'idle'
  error.value = null
  saved.value = false
  await init()
}

async function send(text: string) {
  if (!text.trim() || !tripId.value || busy.value) return

  const content = text.trim()
  messages.value.push({ id: Date.now(), role: 'user', content })
  busy.value = true
  error.value = null
  status.value = 'understanding'

  try {
    const result = await $fetch('/api/chat', {
      method: 'POST',
      headers: headers(),
      body: { tripId: tripId.value, message: content },
    })
    draft.value = result.draft
    status.value = result.status
    messages.value.push({ id: Date.now(), role: 'assistant', content: result.reply })
    if (result.regenerated && result.state) {
      tripState.value = result.state
      issues.value = result.issues ?? []
      status.value = 'ready'
    }
  } catch (e) {
    error.value = String(e)
  } finally {
    busy.value = false
  }
}

async function generate() {
  if (!readyToGenerate.value || !tripId.value || busy.value) return

  busy.value = true
  error.value = null
  status.value = 'generating'

  try {
    const result = await $fetch('/api/generate', {
      method: 'POST',
      headers: headers(),
      body: { tripId: tripId.value },
    })
    tripState.value = result.state
    issues.value = result.issues
    status.value = 'ready'
  } catch (e) {
    error.value = String(e)
  } finally {
    busy.value = false
  }
}

// ─── Выбор пользователя: билет/отель ───────────────────────────────────

async function persistState(state: TripState) {
  tripState.value = state
  if (!tripId.value) return
  try {
    await $fetch(`/api/trip/${tripId.value}`, {
      method: 'PATCH',
      headers: headers(),
      body: { state },
    })
  } catch {
    // локальный выбор остаётся в памяти — сервер подхватит при следующей генерации
  }
}

function selectTransport(leg: TransportLeg) {
  if (!tripState.value) return
  const others = tripState.value.transport.filter(
    (l) => !(l.from_place_id === leg.from_place_id && l.to_place_id === leg.to_place_id),
  )
  const transport = [...others, leg].sort(
    (a, b) => placeOrder(a.from_place_id) - placeOrder(b.from_place_id),
  )
  persistState({ ...tripState.value, transport })
}

// Выбор/снятие отеля в городе. Клик по отелю переключает его в hotel_stays:
// если отель уже выбран — снимаем; иначе добавляем на все оставшиеся ночи города.
function selectHotel(hotel: HotelOption) {
  const state = tripState.value
  if (!state) return
  const stays = [...(state.hotel_stays ?? [])]
  const existing = stays.find((s) => s.place_id === hotel.place_id && s.hotel_id === hotel.id)
  const nightsTotal = nightsForPlace(hotel.place_id)

  let next: HotelStay[]
  if (existing) {
    next = stays.filter((s) => !(s.place_id === hotel.place_id && s.hotel_id === hotel.id))
  } else {
    const placeStays = stays.filter((s) => s.place_id === hotel.place_id)
    const used = placeStays.reduce((sum, s) => sum + s.nights, 0)
    const free = Math.max(1, nightsTotal - used)
    next = [...stays, { hotel_id: hotel.id, place_id: hotel.place_id, nights: free }]
  }

  persistState({ ...state, hotel_stays: next })
}

// Изменить число ночей в выбранном отеле города.
function changeHotelNights(stay: HotelStay, delta: number) {
  const state = tripState.value
  if (!state) return
  const nightsTotal = nightsForPlace(stay.place_id)
  const stays = [...(state.hotel_stays ?? [])]
  const idx = stays.findIndex((s) => s.place_id === stay.place_id && s.hotel_id === stay.hotel_id)
  if (idx === -1) return
  const next = Math.min(nightsTotal, Math.max(1, (stays[idx]?.nights ?? 1) + delta))
  stays[idx] = { ...stays[idx]!, nights: next }
  persistState({ ...state, hotel_stays: stays })
}

function nightsForPlace(placeId: string): number {
  return tripState.value?.stops.find((s) => s.place_id === placeId)?.days ?? 1
}

function placeOrder(placeId: string): number {
  const stops = tripState.value?.stops ?? []
  const origin = tripState.value?.places[0]?.id
  if (placeId === origin) return -1
  const idx = stops.findIndex((s) => s.place_id === placeId)
  return idx === -1 ? 999 : idx
}

// ─── Сохранение маршрута ───────────────────────────────────────────────

function routeLabel(state: TripState | null): string {
  if (!state) return 'Маршрут'
  const names = state.places.map((p) => p.name)
  return names.length ? names.join(' → ') : 'Маршрут'
}

// «Москва → Питер · №2» — номер = порядок среди одинаковых маршрутов (по дате)
function computeTitle(
  allTrips: { id: string; title: string | null; updated_at: string; state: unknown }[],
  targetId: string | null,
  targetState: TripState | null,
): string {
  const label = routeLabel(targetState)
  const group = allTrips
    .filter((t) => t.state && routeLabel(t.state as TripState) === label)
    .sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime())

  const idx = group.findIndex((t) => t.id === targetId)
  const num = idx === -1 ? group.length + 1 : idx + 1
  return `${label} · №${num}`
}

async function saveTrip() {
  if (!tripId.value || !tripState.value) return
  const all = await fetchTrips()
  const title = computeTitle(all, tripId.value, tripState.value)
  try {
    await $fetch(`/api/trip/${tripId.value}`, {
      method: 'PATCH',
      headers: headers(),
      body: { state: tripState.value, phase: 'generated', title },
    })
    saved.value = true
  } catch {
    // не критично — state и так сохраняется при каждом изменении
  }
}

async function fetchTrips(): Promise<{ id: string; title: string | null; updated_at: string; state: unknown }[]> {
  try {
    return await $fetch('/api/trips', { headers: headers() }) as { id: string; title: string | null; updated_at: string; state: unknown }[]
  } catch {
    return []
  }
}

// Список сохранённых маршрутов с вычисленным названием (откуда → куда · №N)
async function listSavedTrips(): Promise<{ id: string; title: string | null; updated_at: string }[]> {
  const trips = (await fetchTrips()).filter((t) => t.state)
  return trips
    .map((t) => ({ id: t.id, title: computeTitle(trips, t.id, t.state as TripState), updated_at: t.updated_at }))
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
}

// Удалить сохранённый маршрут
async function deleteTrip(id: string) {
  try {
    await $fetch(`/api/trip/${id}`, { method: 'DELETE', headers: headers() })
  } catch {
    // не критично — список просто не обновится
  }
}

// Открыть сохранённый маршрут
async function loadTrip(id: string) {
  try {
    const [trip, msgs] = await Promise.all([
      $fetch(`/api/trip/${id}`, { headers: headers() }),
      $fetch(`/api/trip/${id}/messages`, { headers: headers() }),
    ])
    tripId.value = id
    draft.value = trip.draft ?? emptyDraft()
    tripState.value = trip.state ?? null
    issues.value = []
    saved.value = Boolean(trip.state)
    status.value = 'ready'
    messages.value = (msgs as { role: 'user' | 'assistant'; content: string }[])
      .filter((m) => m.role !== 'system')
      .map((m, i) => ({ id: Date.now() + i, role: m.role, content: m.content }))
  } catch {
    // не удалось загрузить — остаёмся на текущем
  }
}

export function useAgent() {
  return {
    tripId,
    draft,
    messages,
    status,
    tripState,
    issues,
    busy,
    error,
    saved,
    readyToGenerate,
    init,
    send,
    generate,
    selectTransport,
    selectHotel,
    changeHotelNights,
    saveTrip,
    listSavedTrips,
    loadTrip,
    deleteTrip,
    reset,
  }
}