import type {
  TripState,
  ValidatorIssue,
  ValidatorResult,
} from '~shared'

export function validateTrip(state: TripState): ValidatorResult {
  const issues: ValidatorIssue[] = []

  const stops = [...state.stops].sort((a, b) => a.order - b.order)
  const nights = daysBetween(state.trip.start, state.trip.end)

  // Дни в стопах = ночам поездки
  const totalDays = stops.reduce((sum, s) => sum + s.days, 0)
  if (nights > 0 && Math.abs(totalDays - nights) > 1) {
    issues.push({
      severity: 'error',
      code: 'days_mismatch',
      message: `Дней в стопах (${totalDays}) ≠ ночей поездки (${nights})`,
      path: 'trip',
    })
  }

  for (const stop of stops) {
    if (stop.days < 1) {
      issues.push({
        severity: 'error',
        code: 'zero_days',
        message: `Стоп «${stop.place_id}» без дней`,
        path: `stops[${stop.order}]`,
      })
    }

    const place = state.places.find((p) => p.id === stop.place_id)
    if (!place) {
      issues.push({
        severity: 'error',
        code: 'missing_place',
        message: `Место «${stop.place_id}» не в справочнике places`,
        path: `stops[${stop.order}]`,
      })
    } else if (!place.lat || !place.lng) {
      issues.push({
        severity: 'error',
        code: 'missing_coords',
        message: `Нет координат у места «${place.name}»`,
        path: `stops[${stop.order}]`,
      })
    }
  }

  // Связность транспорта
  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i].place_id
    const to = stops[i + 1].place_id
    const hasLeg = state.transport.some(
      (l) => l.from_place_id === from && l.to_place_id === to,
    )
    if (!hasLeg) {
      issues.push({
        severity: 'warning',
        code: 'missing_transport',
        message: `Нет транспорта «${from} → ${to}»`,
        path: `transport[${i}]`,
      })
    }
  }

  // Бюджет
  if (state.preferences.budget != null) {
    const spent = totalKnownCost(state)
    if (spent > state.preferences.budget) {
      issues.push({
        severity: 'error',
        code: 'budget_exceeded',
        message: `Бюджет ${state.preferences.budget} ${state.preferences.currency} превышен на ${spent - state.preferences.budget}`,
        path: 'preferences',
      })
    }
  }

  // Запрет ночных переездов
  if (state.constraints.some((c) => c.kind === 'no_night_transfer')) {
    for (const leg of state.transport) {
      if (leg.departure && leg.arrival && isOvernight(leg.departure, leg.arrival)) {
        issues.push({
          severity: 'error',
          code: 'night_transfer',
          message: `Ночной переезд «${leg.from_place_id} → ${leg.to_place_id}»`,
          path: `transport.${leg.id}`,
        })
      }
    }
  }

  return {
    ok: issues.filter((i) => i.severity === 'error').length === 0,
    issues,
  }
}

export function daysBetween(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime()
  return Math.round(ms / 86_400_000)
}

export function totalKnownCost(state: TripState): number {
  const stopsByPlace = new Map<string, number>()
  for (const stop of state.stops) stopsByPlace.set(stop.place_id, stop.days)

  const hotels = state.hotels.reduce((sum, h) => {
    const nights = stopsByPlace.get(h.place_id) ?? 0
    return sum + (h.price_per_night ?? 0) * nights
  }, 0)

  const transport = state.transport.reduce((sum, l) => sum + (l.price ?? 0), 0)
  const activities = state.activities.reduce((sum, a) => sum + (a.price ?? 0), 0)

  return hotels + transport + activities
}

function isOvernight(departure: string, arrival: string): boolean {
  const dep = new Date(departure)
  const arr = new Date(arrival)
  if (arr.getTime() < dep.getTime()) return true
  return dep.getDate() !== arr.getDate()
    || dep.getMonth() !== arr.getMonth()
    || dep.getFullYear() !== arr.getFullYear()
}