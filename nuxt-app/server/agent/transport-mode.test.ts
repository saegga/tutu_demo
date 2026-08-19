import { describe, expect, it } from 'vitest'

import type { Place } from '~shared'

import { legTransportMode, parseTransportMode } from './transport-mode'

const moscow: Place = { id: 'moscow', name: 'Москва', country: 'Россия', lat: 0, lng: 0 }
const blagoveshchensk: Place = { id: 'blagoveshchensk', name: 'Благовещенск', country: 'Россия', lat: 0, lng: 0 }
const vladivostok: Place = { id: 'vladivostok', name: 'Владивосток', country: 'Россия', lat: 0, lng: 0 }
const places = [moscow, blagoveshchensk, vladivostok]

describe('parseTransportMode', () => {
  it('detects modes', () => {
    expect(parseTransportMode('на ж/д поезде')).toBe('train')
    expect(parseTransportMode('во Владивосток на ж/д')).toBe('train')
    expect(parseTransportMode('на автобусе')).toBe('bus')
    expect(parseTransportMode('обратно на самолёте')).toBe('flight')
    expect(parseTransportMode('музеи и пляж')).toBeNull()
  })
})

describe('legTransportMode', () => {
  const needs = ['ж/д поезд (до Владивостока)', 'обратно на самолёте']

  it('assigns default flight when no need matches', () => {
    expect(legTransportMode('moscow', 'blagoveshchensk', needs, places)).toBeNull()
  })

  it('uses rail for the leg ending at Vladivostok', () => {
    expect(legTransportMode('blagoveshchensk', 'vladivostok', needs, places)).toBe('train')
  })

  it('uses flight for the return leg home', () => {
    expect(legTransportMode('vladivostok', 'moscow', needs, places)).toBe('flight')
  })

  it('applies general mode to all legs', () => {
    expect(legTransportMode('moscow', 'blagoveshchensk', ['везде поездом'], places)).toBe('train')
    expect(legTransportMode('blagoveshchensk', 'vladivostok', ['везде поездом'], places)).toBe('train')
  })
})