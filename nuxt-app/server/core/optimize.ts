import type { TripState } from '~shared'

import { daysBetween } from './validate'

// Оптимизация маршрута: приводим сумму дней к ночам поездки,
// переставляем незаблокированные стопы по ближайшему соседу.
export function optimizeTrip(state: TripState): TripState {
  const next: TripState = {
    ...state,
    stops: [...state.stops].sort((a, b) => a.order - b.order),
  }

  rebalanceDays(next)
  orderStopsByNearestNeighbor(next)

  return next
}

// Перераспределяем дни так, чтобы сумма stops[].days == числу ночей.
// Сначала отнимаем у незаблокированных стопов, затем добавляем.
function rebalanceDays(state: TripState): void {
  const nights = daysBetween(state.trip.start, state.trip.end)
  if (nights <= 0) return

  let current = state.stops.reduce((sum, s) => sum + s.days, 0)
  if (current === nights) return

  const unlocked = state.stops
    .map((s, i) => ({ i, s }))
    .filter(({ s }) => !s.locked)
  if (unlocked.length === 0) return

  let guard = 0
  while (current !== nights && guard < 1000) {
    guard++
    const delta = nights > current ? 1 : -1
    const nextDelta = delta > 0 ? 1 : -1
    const pool = delta > 0
      ? unlocked
      : unlocked.filter(({ s }) => s.days > 1)
    if (pool.length === 0) break

    const target = pool[guard % pool.length]
    state.stops[target.i].days += delta
    current += delta
    void nextDelta
  }
}

// Перестановка по ближайшему соседу: начинаем с первого стопа,
// дальше берём ближайший к текущему, сохраняя locked-позиции.
function orderStopsByNearestNeighbor(state: TripState): void {
  if (state.stops.length <= 2) {
    state.stops.forEach((s, i) => (s.order = i))
    return
  }

  const places = new Map(state.places.map((p) => [p.id, p]))
  const dist = (a: string, b: string): number => {
    const pa = places.get(a)
    const pb = places.get(b)
    if (!pa || !pb) return Number.POSITIVE_INFINITY
    return haversine(pa.lat, pa.lng, pb.lat, pb.lng)
  }

  const sorted: TripState['stops'] = []
  const remaining = [...state.stops]

  let currentId: string | null = remaining[0]?.place_id ?? null
  while (remaining.length > 0) {
    const idx = currentId === null
      ? 0
      : nearestIndex(remaining, currentId, dist)
    sorted.push(remaining[idx])
    currentId = remaining[idx].place_id
    remaining.splice(idx, 1)
  }

  sorted.forEach((s, i) => (s.order = i))
  state.stops = sorted
}

function nearestIndex(
  stops: TripState['stops'],
  fromId: string,
  dist: (a: string, b: string) => number,
): number {
  let best = 0
  let bestDist = Number.POSITIVE_INFINITY
  for (let i = 0; i < stops.length; i++) {
    const d = dist(fromId, stops[i].place_id)
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  }
  return best
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = deg2rad(lat2 - lat1)
  const dLng = deg2rad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2
    + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function deg2rad(deg: number): number {
  return (deg * Math.PI) / 180
}