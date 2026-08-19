import { describe, expect, it } from 'vitest'

import {
  isDraftComplete,
  isDraftReadyToGenerate,
  emptyDraft,
  type Place,
  type Proposal,
  type TripDraft,
} from '~shared'

import { mergeDraft } from '../agent/nodes'
import { generateTripState } from '../agent/generate'
import { applyProposal } from '../core/apply'
import { optimizeTrip } from '../core/optimize'
import { daysBetween, validateTrip } from '../core/validate'

function place(id: string, name: string, country: string, lat = 0, lng = 0): Place {
  return { id, name, country, lat, lng }
}

const COORDS: Record<string, [number, number]> = {
  barcelona: [41.38, 2.17],
  madrid: [40.41, -3.7],
  moscow: [55.75, 37.61],
  paris: [48.85, 2.35],
}

const fakeGeocode = async (p: Place): Promise<Place> => {
  const [lat, lng] = COORDS[p.id] ?? [1, 1]
  return { ...p, lat: p.lat || lat, lng: p.lng || lng }
}

// Собираем draft так же, как это делает агент: патчами от LLM.
function collectFullDraft(): TripDraft {
  let draft = emptyDraft()

  draft = mergeDraft(draft, {
    origin: place('moscow', 'Москва', 'Россия'),
  })
  draft = mergeDraft(draft, {
    destinations: [place('barcelona', 'Барселона', 'Испания'), place('madrid', 'Мадрид', 'Испания')],
  })
  draft = mergeDraft(draft, {
    dates: { start: null, end: null, duration_days: 10 },
  })
  draft = mergeDraft(draft, {
    travelers: { adults: 2, children: 1, children_ages: [7] },
  })
  draft = mergeDraft(draft, {
    needs: ['пляж', 'бюджетно'],
  })

  return draft
}

describe('E2E: сбор draft → генерация → правка → approve → reoptimize → validate', () => {
  it('проходит весь сценарий «10 дней Испания с ребёнком»', async () => {
    const draft = collectFullDraft()

    expect(isDraftReadyToGenerate(draft)).toBe(true)
    expect(isDraftComplete(draft)).toBe(true)

    // Генерация
    const state = await generateTripState(draft, {}, fakeGeocode)
    const nights = daysBetween(state.trip.start, state.trip.end)
    const sumDays = state.stops.reduce((s, x) => s + x.days, 0)

    expect(nights).toBe(10)
    expect(sumDays).toBe(nights)
    expect(state.places.map((p) => p.id)).toEqual(['moscow', 'barcelona', 'madrid'])
    expect(state.places.every((p) => p.lat !== 0 && p.lng !== 0)).toBe(true)

    const initialValidation = validateTrip(state)
    expect(initialValidation.ok).toBe(true)
    expect(initialValidation.issues.every((i) => i.severity === 'warning')).toBe(true)

    // Правка «добавь Париж»
    const proposal: Proposal = {
      id: 'prop-1',
      reason: 'Ты просил добавить Париж',
      changes: [{ operation: 'add_stop', place_id: 'paris', days: 2, position: 1 }],
      impact: { budget_delta: null, travel_time_delta_min: null, days_delta: 2, summary: '+2 дня в Париже' },
      decision_level: 'proposal',
      status: 'pending',
      parent_proposal_id: null,
    }

    const paris = place('paris', 'Париж', 'Франция', 48.85, 2.35)
    const applied = applyProposal(state, proposal, [paris])
    expect(applied.stops.reduce((s, x) => s + x.days, 0)).toBe(12)

    // Approve → reoptimize → validate
    const optimized = optimizeTrip(applied)
    const finalDays = optimized.stops.reduce((s, x) => s + x.days, 0)
    expect(finalDays).toBe(nights)

    const finalValidation = validateTrip(optimized)
    expect(finalValidation.ok).toBe(true)
    expect(optimized.stops.every((s) => s.days >= 1)).toBe(true)
  })

  it('не генерирует, пока draft не готов', async () => {
    await expect(generateTripState(emptyDraft(), {}, fakeGeocode)).rejects.toThrow(
      'draft not ready for generation',
    )
  })

  it('обновляет уже введённые поля через mergeDraft', () => {
    let draft = collectFullDraft()
    draft = mergeDraft(draft, { destinations: [place('phuket', 'Пхукет', 'Таиланд')] })
    expect(draft.destinations.map((p) => p.id)).toEqual(['phuket'])

    draft = mergeDraft(draft, { dates: { start: '2026-11-01', end: '2026-11-08', duration_days: 7 } })
    expect(draft.dates.duration_days).toBe(7)
    expect(draft.dates.start).toBe('2026-11-01')
  })

  it('null-патчи (поле не упомянуто) не стирают введённые значения', () => {
    let draft = collectFullDraft()

    draft = mergeDraft(draft, {
      origin: null,
      destinations: null,
      dates: null,
      travelers: null,
      needs: null,
    })

    expect(draft.origin?.id).toBe('moscow')
    expect(draft.destinations.map((p) => p.id)).toEqual(['barcelona', 'madrid'])
    expect(draft.dates.duration_days).toBe(10)
    expect(draft.travelers?.adults).toBe(2)
    expect(draft.needs).toEqual(['пляж', 'бюджетно'])
  })
})