import { describe, expect, it, vi } from 'vitest'
import { AIMessage } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'

import type { TripState } from '~shared'

import { searchHotels, searchTransport } from '../mcp/client'
import { createHotelsTool, createTransportTool } from '../mcp/tools'
import { runGenerationAgent } from './generate-agent'

vi.mock('../mcp/client', () => ({
  searchTransport: vi.fn(),
  searchHotels: vi.fn(),
}))

const state: TripState = {
  trip: { start: '2026-09-10', end: '2026-09-17', travelers: 1 },
  preferences: { budget: null, currency: 'RUB', pace: 'moderate', interests: {} },
  places: [
    { id: 'moscow', name: 'Москва', country: 'Россия', lat: 55.7558, lng: 37.6173 },
    { id: 'blagoveshchensk', name: 'Благовещенск', country: 'Россия', lat: 50.267, lng: 127.54 },
    { id: 'vladivostok', name: 'Владивосток', country: 'Россия', lat: 43.115, lng: 131.886 },
  ],
  stops: [
    { place_id: 'blagoveshchensk', days: 3, locked: false, order: 0 },
    { place_id: 'vladivostok', days: 4, locked: false, order: 1 },
  ],
  activities: [],
  transport: [],
  transport_options: [],
  hotels: [],
  hotel_stays: [],
  constraints: [],
  pending_actions: [],
  updated_at: '',
}

class FakeModel {
  calls = 0

  bindTools() {
    return this
  }

  async invoke() {
    this.calls += 1
    if (this.calls === 1) {
      return new AIMessage({
        content: '',
        tool_calls: [
          {
            name: 'search_transport',
            args: {
              tool: 'search_rail',
              from_place_id: 'blagoveshchensk',
              to_place_id: 'vladivostok',
              origin: 'Благовещенск',
              destination: 'Владивосток',
              departure_date: '2026-09-10',
              travelers: 1,
            },
            id: 'call-transport-1',
          },
          {
            name: 'search_hotels',
            args: {
              place_id: 'vladivostok',
              city: 'Владивосток',
              check_in: '2026-09-10',
              check_out: '2026-09-17',
              adults: 1,
            },
            id: 'call-hotels-1',
          },
        ],
      })
    }
    return new AIMessage({ content: 'готово' })
  }
}

describe('runGenerationAgent (гибрид: агент вызывает MCP-инструменты)', () => {
  it('агент вызывает search_transport и search_hotels, результаты собираются в state', async () => {
    vi.mocked(searchTransport).mockResolvedValueOnce({
      offers: [
        {
          offer_id: 'off-1',
          price: { amount: 2500, currency: 'RUB' },
          legs: [
            {
              segments: [
                {
                  origin: 'Благовещенск',
                  departure: '2026-09-10T08:00:00',
                  destination: 'Владивосток',
                  arrival: '2026-09-10T20:00:00',
                  duration: '12 ч',
                },
              ],
            },
          ],
          checkout_url: 'https://buy.example/train',
        },
      ],
    })
    vi.mocked(searchHotels).mockResolvedValueOnce({
      hotels: [
        {
          hotel_geo_id: 'hotel-1',
          name: 'Отель Владивосток',
          rating: 8.5,
          photos: ['https://img.example/h1.jpg'],
          best_offer: {
            price: { amount: 7000, currency: 'RUB' },
            checkout_url: 'https://buy.example/hotel',
          },
        },
      ],
    })

    const result = await runGenerationAgent(state, ['во Владивосток на ж/д'], {
      model: new FakeModel() as unknown as BaseChatModel,
      tools: [createTransportTool(), createHotelsTool()],
    })

    // Агент сам решил какие инструменты звать, но mode (ж/д) задан детерминированно планом.
    expect(searchTransport).toHaveBeenCalledWith('search_rail', expect.any(Object))
    expect(searchHotels).toHaveBeenCalledWith(expect.objectContaining({ city_name: 'Владивосток' }))

    expect(result.transport.length).toBe(1)
    expect(result.transport[0].mode).toBe('train')
    expect(result.transport[0].from_place_id).toBe('blagoveshchensk')
    expect(result.transport[0].to_place_id).toBe('vladivostok')

    expect(result.hotels.length).toBe(1)
    expect(result.hotels[0].place_id).toBe('vladivostok')
    expect(result.hotels[0].name).toBe('Отель Владивосток')
  })
})
