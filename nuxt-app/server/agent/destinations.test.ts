import { describe, expect, it } from 'vitest'

import type { Place } from '~shared'

import { classifyAddReplaceAnswer, detectDestinationIntent, mergeDestinations } from './destinations'

const bangkok: Place = { id: 'bangkok', name: 'Бангкок', country: 'Таиланд', lat: 0, lng: 0 }
const phuket: Place = { id: 'phuket', name: 'Пхукет', country: 'Таиланд', lat: 0, lng: 0 }

describe('detectDestinationIntent', () => {
  it('returns replace when no existing destinations', () => {
    expect(detectDestinationIntent([], [bangkok], 'хочу в Бангкок')).toBe('replace')
  })

  it('returns replace when no new places', () => {
    expect(detectDestinationIntent([bangkok], [bangkok], 'Бангкок')).toBe('replace')
  })

  it('returns add on explicit add words', () => {
    expect(detectDestinationIntent([bangkok], [phuket], 'а ещё добавь Пхукет')).toBe('add')
    expect(detectDestinationIntent([bangkok], [phuket], 'добавь Пхукет')).toBe('add')
  })

  it('returns replace on explicit replace words', () => {
    expect(detectDestinationIntent([bangkok], [phuket], 'вместо этого Пхукет')).toBe('replace')
    expect(detectDestinationIntent([bangkok], [phuket], 'замени на Пхукет')).toBe('replace')
  })

  it('returns ask when ambiguous', () => {
    expect(detectDestinationIntent([bangkok], [phuket], 'хочу ещё и Пхукет посмотреть')).toBe('ask')
    expect(detectDestinationIntent([bangkok], [phuket], 'Пхукет тоже неплохо бы')).toBe('ask')
  })
})

describe('mergeDestinations', () => {
  it('appends new places and dedups on add', () => {
    const out = mergeDestinations([bangkok], [phuket, bangkok], 'add')
    expect(out.map((p) => p.name)).toEqual(['Бангкок', 'Пхукет'])
  })

  it('keeps only incoming on replace', () => {
    const out = mergeDestinations([bangkok], [phuket], 'replace')
    expect(out.map((p) => p.name)).toEqual(['Пхукет'])
  })
})

describe('classifyAddReplaceAnswer', () => {
  const pending = [bangkok, phuket]

  it('maps confirmation words to add', () => {
    expect(classifyAddReplaceAnswer('сложный', pending)).toBe('add')
    expect(classifyAddReplaceAnswer('да', pending)).toBe('add')
    expect(classifyAddReplaceAnswer('Всё верно', pending)).toBe('add')
    expect(classifyAddReplaceAnswer('добавь', pending)).toBe('add')
  })

  it('maps replace words to replace', () => {
    expect(classifyAddReplaceAnswer('замени', pending)).toBe('replace')
    expect(classifyAddReplaceAnswer('вместо этого', pending)).toBe('replace')
  })

  it('treats mention of pending city as add', () => {
    expect(classifyAddReplaceAnswer('во Владивосток', [{ id: 'vladivostok', name: 'Владивосток', country: 'Россия', lat: 0, lng: 0 }])).toBe('add')
  })

  it('returns ask on unrelated text', () => {
    expect(classifyAddReplaceAnswer('посчитай бюджет', pending)).toBe('ask')
  })
})