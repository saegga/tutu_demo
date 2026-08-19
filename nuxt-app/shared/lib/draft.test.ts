import { describe, expect, it } from 'vitest'

import {
  emptyDraft,
  hasDuration,
  isDraftComplete,
  isDraftReadyToGenerate,
  mergeDraftUpdate,
} from '~shared'

function place(id: string) {
  return { id, name: id, country: 'RU', lat: 1, lng: 1 }
}

describe('draft completeness', () => {
  it('empty draft: not ready, not complete', () => {
    const d = emptyDraft()
    expect(isDraftReadyToGenerate(d)).toBe(false)
    expect(isDraftComplete(d)).toBe(false)
  })

  it('ready when origin + destinations + duration + travelers', () => {
    const d = {
      origin: place('moscow'),
      destinations: [place('phuket')],
      dates: { start: null, end: null, duration_days: 10 },
      travelers: { adults: 1, children: 0, children_ages: [] },
      needs: [],
    }
    expect(isDraftReadyToGenerate(d)).toBe(true)
    expect(isDraftComplete(d)).toBe(false)
  })

  it('complete when all 5 fields are filled', () => {
    const d = {
      origin: place('moscow'),
      destinations: [place('phuket')],
      dates: { start: '2026-09-01', end: '2026-09-11', duration_days: 10 },
      travelers: { adults: 2, children: 1, children_ages: [6] },
      needs: ['пляж', 'бюджетно'],
    }
    expect(isDraftReadyToGenerate(d)).toBe(true)
    expect(isDraftComplete(d)).toBe(true)
  })

  it('duration via exact dates counts as hasDuration', () => {
    const d = {
      ...emptyDraft(),
      dates: { start: '2026-09-01', end: '2026-09-11', duration_days: null },
    }
    expect(hasDuration(d)).toBe(true)
  })

  it('ready even without dates (ближайшие даты по умолчанию)', () => {
    const d = {
      origin: place('moscow'),
      destinations: [place('phuket')],
      dates: { start: null, end: null, duration_days: null },
      travelers: { adults: 1, children: 0, children_ages: [] },
      needs: [],
    }
    expect(isDraftReadyToGenerate(d)).toBe(true)
    expect(isDraftComplete(d)).toBe(false)
  })
})

describe('mergeDraftUpdate', () => {
  it('merges partial update without losing existing fields', () => {
    const base = emptyDraft()
    const next = mergeDraftUpdate(base, {
      origin: place('moscow'),
      dates: { start: null, end: null, duration_days: 7 },
    })
    expect(next.origin?.id).toBe('moscow')
    expect(next.dates.duration_days).toBe(7)
    expect(next.destinations).toEqual([])
  })

  it('replaces destinations with the full list', () => {
    const base = emptyDraft()
    base.destinations = [place('phuket')]
    const next = mergeDraftUpdate(base, { destinations: [place('phuket'), place('bangkok')] })
    expect(next.destinations.map((p) => p.id)).toEqual(['phuket', 'bangkok'])
  })

  it('replaces needs with the full list', () => {
    const base = emptyDraft()
    base.needs = ['пляж']
    const next = mergeDraftUpdate(base, { needs: ['пляж', 'музеи'] })
    expect(next.needs).toEqual(['пляж', 'музеи'])
  })
})