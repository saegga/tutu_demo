import { describe, expect, it } from 'vitest'

import type { Place, TripState } from '~shared'

import { validateTrip } from './validate'
import { applyProposal } from './apply'
import { computeImpact } from './impact'
import { optimizeTrip } from './optimize'

function place(id: string, lat = 55.7558, lng = 37.6173): Place {
  return { id, name: id, country: 'RU', lat, lng }
}

function baseState(overrides: Partial<TripState> = {}): TripState {
  return {
    trip: { start: '2026-09-01', end: '2026-09-11', travelers: 2 },
    preferences: {
      budget: 5000,
      currency: 'RUB',
      pace: 'moderate',
      interests: {},
    },
    places: [place('moscow'), place('spb', 59.9343, 30.3351)],
    stops: [
      { place_id: 'moscow', days: 5, locked: false, order: 0 },
      { place_id: 'spb', days: 5, locked: false, order: 1 },
    ],
    activities: [],
    transport: [],
    transport_options: [],
    hotels: [],
    hotel_stays: [],
    constraints: [],
    pending_actions: [],
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('validateTrip', () => {
  it('valid trip passes', () => {
    const result = validateTrip(baseState())
    expect(result.ok).toBe(true)
    expect(result.issues.some((i) => i.severity === 'error')).toBe(false)
    // предупреждение о недостающем транспорте допустимо
    expect(result.issues.some((i) => i.code === 'missing_transport')).toBe(true)
  })

  it('days mismatch fails', () => {
    const state = baseState()
    state.stops[0].days = 3 // сумма 8, ночей 10
    const result = validateTrip(state)
    expect(result.ok).toBe(false)
    expect(result.issues.some((i) => i.code === 'days_mismatch')).toBe(true)
  })

  it('budget exceeded fails', () => {
    const state = baseState()
    state.hotels = [{
      id: 'h1',
      place_id: 'moscow',
      name: 'Grand',
      rating: 5,
      price_per_night: 1000,
      currency: 'RUB',
      check_in: null,
      check_out: null,
      booking_url: null,
      source: 'mcp',
    }]
    state.preferences.budget = 1000
    const result = validateTrip(state)
    expect(result.ok).toBe(false)
    expect(result.issues.some((i) => i.code === 'budget_exceeded')).toBe(true)
  })

  it('missing transport is a warning, not error', () => {
    const result = validateTrip(baseState())
    const warn = result.issues.find((i) => i.code === 'missing_transport')
    expect(warn?.severity).toBe('warning')
    expect(result.ok).toBe(true)
  })

  it('night transfer violates constraint', () => {
    const state = baseState()
    state.constraints = [{ id: 'c1', kind: 'no_night_transfer', text: 'без ночных переездов' }]
    state.transport = [{
      id: 't1',
      from_place_id: 'moscow',
      to_place_id: 'spb',
      mode: 'train',
      departure: '2026-09-05T23:00:00',
      arrival: '2026-09-06T07:00:00',
      price: 500,
      currency: 'RUB',
      duration_min: 480,
      booking_url: null,
      source: 'mcp',
    }]
    const result = validateTrip(state)
    expect(result.ok).toBe(false)
    expect(result.issues.some((i) => i.code === 'night_transfer')).toBe(true)
  })
})

describe('applyProposal', () => {
  it('adds a stop with position shift', () => {
    const state = baseState()
    const proposal = {
      id: 'p1',
      reason: 'добавить казан',
      changes: [{ operation: 'add_stop' as const, place_id: 'kazan', days: 2, position: 1 }],
      impact: { budget_delta: 0, travel_time_delta_min: 0, days_delta: 2, summary: '' },
      decision_level: 'proposal' as const,
      status: 'approved' as const,
      parent_proposal_id: null,
    }
    const next = applyProposal(state, proposal, [place('kazan', 55.7879, 49.1233)])
    expect(next.stops.map((s) => s.place_id)).toEqual(['moscow', 'kazan', 'spb'])
    expect(next.places.some((p) => p.id === 'kazan')).toBe(true)
  })

  it('change_duration updates days', () => {
    const state = baseState()
    const proposal = {
      id: 'p2',
      reason: '4 дня в питере',
      changes: [{ operation: 'change_duration' as const, place_id: 'spb', days: 4 }],
      impact: { budget_delta: 0, travel_time_delta_min: 0, days_delta: -1, summary: '' },
      decision_level: 'auto' as const,
      status: 'applied' as const,
      parent_proposal_id: null,
    }
    const next = applyProposal(state, proposal)
    expect(next.stops.find((s) => s.place_id === 'spb')?.days).toBe(4)
  })

  it('remove_stop cleans activities/hotels/transport', () => {
    const state = baseState()
    state.activities = [{ id: 'a1', stop_place_id: 'spb', name: 'эрмитаж', category: 'museum', price: 0, duration_min: 180, booking_url: null, source: 'llm' }]
    state.hotels = [{ id: 'h1', place_id: 'spb', name: 'X', rating: 3, price_per_night: 100, currency: 'RUB', check_in: null, check_out: null, booking_url: null, source: 'llm' }]
    state.transport = [{ id: 't1', from_place_id: 'moscow', to_place_id: 'spb', mode: 'train', departure: null, arrival: null, price: 300, currency: 'RUB', duration_min: 300, booking_url: null, source: 'llm' }]
    const proposal = {
      id: 'p3',
      reason: 'убрать питер',
      changes: [{ operation: 'remove_stop' as const, place_id: 'spb' }],
      impact: { budget_delta: 0, travel_time_delta_min: 0, days_delta: -5, summary: '' },
      decision_level: 'proposal' as const,
      status: 'approved' as const,
      parent_proposal_id: null,
    }
    const next = applyProposal(state, proposal)
    expect(next.stops.map((s) => s.place_id)).toEqual(['moscow'])
    expect(next.activities).toHaveLength(0)
    expect(next.hotels).toHaveLength(0)
    expect(next.transport).toHaveLength(0)
  })
})

describe('computeImpact', () => {
  it('computes budget and days deltas', () => {
    const before = baseState()
    const proposal = {
      id: 'p4',
      reason: 'добавить казан',
      changes: [{ operation: 'add_stop' as const, place_id: 'kazan', days: 2 }],
      impact: { budget_delta: 0, travel_time_delta_min: 0, days_delta: 2, summary: '' },
      decision_level: 'proposal' as const,
      status: 'approved' as const,
      parent_proposal_id: null,
    }
    const after = applyProposal(before, proposal, [place('kazan', 55.7879, 49.1233)])
    const impact = computeImpact(before, after, proposal.changes)
    expect(impact.days_delta).toBe(2)
    expect(impact.summary).toContain('kazan')
  })
})

describe('optimizeTrip', () => {
  it('rebalances days to match trip nights', () => {
    const state = baseState()
    state.stops = [
      { place_id: 'moscow', days: 5, locked: false, order: 0 },
      { place_id: 'spb', days: 2, locked: false, order: 1 },
    ]
    const next = optimizeTrip(state)
    const total = next.stops.reduce((sum, s) => sum + s.days, 0)
    expect(total).toBe(10)
  })

  it('does not touch locked stops when reducing days', () => {
    const state = baseState()
    state.stops = [
      { place_id: 'moscow', days: 8, locked: true, order: 0 },
      { place_id: 'spb', days: 4, locked: false, order: 1 },
    ]
    const next = optimizeTrip(state)
    expect(next.stops.find((s) => s.place_id === 'moscow')?.days).toBe(8)
  })
})