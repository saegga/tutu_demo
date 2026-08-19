import { describe, expect, it } from 'vitest'

import { rateLimit } from './rate-limit'

describe('rate-limit', () => {
  it('пропускает запросы до лимита и блокирует дальше', () => {
    const key = `test-${Date.now()}`
    for (let i = 0; i < 3; i++) expect(rateLimit(key, 3, 1000)).toBe(true)
    expect(rateLimit(key, 3, 1000)).toBe(false)
  })

  it('независим для разных ключей', () => {
    const a = `a-${Date.now()}`
    const b = `b-${Date.now()}`
    expect(rateLimit(a, 1, 1000)).toBe(true)
    expect(rateLimit(b, 1, 1000)).toBe(true)
    expect(rateLimit(a, 1, 1000)).toBe(false)
  })
})