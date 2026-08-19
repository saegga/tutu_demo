import { describe, expect, it } from 'vitest'

import { isCountryName, resolveSearchCity } from './country-cities'

describe('resolveSearchCity', () => {
  it('maps country to major city', () => {
    expect(resolveSearchCity('Таиланд')).toBe('Бангкок')
    expect(resolveSearchCity('тайланд')).toBe('Бангкок')
    expect(resolveSearchCity('ТУРЦИЯ')).toBe('Стамбул')
  })

  it('returns null for cities', () => {
    expect(resolveSearchCity('Бангкок')).toBeNull()
    expect(resolveSearchCity('Москва')).toBeNull()
    expect(resolveSearchCity('Благовещенск')).toBeNull()
  })

  it('does not substitute city-states', () => {
    expect(resolveSearchCity('Сингапур')).toBeNull()
  })

  it('trims whitespace', () => {
    expect(resolveSearchCity('  египет ')).toBe('Каир')
  })
})

describe('isCountryName', () => {
  it('flags countries', () => {
    expect(isCountryName({ name: 'Таиланд', country: 'Таиланд' })).toBe(true)
    expect(isCountryName({ name: 'Куба', country: 'Куба' })).toBe(true)
  })

  it('does not flag cities', () => {
    expect(isCountryName({ name: 'Бангкок', country: 'Таиланд' })).toBe(false)
    expect(isCountryName({ name: 'Москва', country: 'Россия' })).toBe(false)
  })

  it('does not flag city-states', () => {
    expect(isCountryName({ name: 'Сингапур', country: 'Сингапур' })).toBe(false)
  })
})