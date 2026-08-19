import { describe, expect, it } from 'vitest'

import { parseLooseJson } from './loose-json'

describe('parseLooseJson', () => {
  it('parses normal JSON', () => {
    const out = parseLooseJson<{ a: string }>('{"a": "привет"}')
    expect(out.a).toBe('привет')
  })

  it('extracts JSON from text with surrounding noise', () => {
    const out = parseLooseJson<{ a: number }>('Вот результат:\n{"a": 5}\nГотово!')
    expect(out.a).toBe(5)
  })

  it('repairs unquoted string value with commas (DeepSeek bug)', () => {
    const bad = `{"draft_patch": {"origin": {"id": "moscow", "name": "Москва", "country": "Россия", "lat": 0, "lng": 0}}, "question": Отлично, Таиланд — это уже жара и море! А что ещё?, "summary": "Маршрут: Москва → Таиланд"}`
    const out = parseLooseJson<{ question: string; summary: string }>(bad)
    expect(out.question).toBe('Отлично, Таиланд — это уже жара и море! А что ещё?')
    expect(out.summary).toContain('Москва → Таиланд')
  })

  it('repairs unquoted short string values', () => {
    const bad = '{"name": Москва, "country": Россия, "lat": 55.7}'
    const out = parseLooseJson<{ name: string; country: string; lat: number }>(bad)
    expect(out.name).toBe('Москва')
    expect(out.country).toBe('Россия')
    expect(out.lat).toBe(55.7)
  })

  it('falls back to jsonrepair for unquoted keys / trailing commas', () => {
    const bad = "{a: 'x', b: [1, 2,],}"
    const out = parseLooseJson<{ a: string; b: number[] }>(bad)
    expect(out.a).toBe('x')
    expect(out.b).toEqual([1, 2])
  })

  it('throws when no JSON object present', () => {
    expect(() => parseLooseJson('просто текст без JSON')).toThrow(/JSON-объект не найден/)
  })
})