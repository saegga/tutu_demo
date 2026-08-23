import { describe, expect, it, vi } from 'vitest'

import { searchHotels, searchTransport } from './client'
import { createHotelsTool, createTransportTool } from './tools'

vi.mock('./client', () => ({
  searchTransport: vi.fn(),
  searchHotels: vi.fn(),
}))

const trainOffers = () => ({
  offers: [
    {
      offer_id: 'off-train-1',
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

const flightOffers = () => ({
  offers: [
    {
      offer_id: 'off-flight-1',
      price: { amount: 9000, currency: 'RUB' },
      legs: [{ segments: [{ origin: 'А', departure: '2026-09-10T10:00:00', destination: 'Б', arrival: '2026-09-10T12:00:00', duration: '2 ч' }] }],
      checkout_url: 'https://buy.example/flight',
    },
  ],
})

const hotelOffers = () => ({
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

describe('createTransportTool', () => {
  it('вызывает search_rail с passengers и нормализует поезд', async () => {
    vi.mocked(searchTransport).mockResolvedValueOnce(trainOffers())

    const tool = createTransportTool()
    const output = await tool.invoke({
      tool: 'search_rail',
      from_place_id: 'blagoveshchensk',
      to_place_id: 'vladivostok',
      origin: 'Благовещенск',
      destination: 'Владивосток',
      departure_date: '2026-09-10',
      travelers: 1,
    })

    expect(searchTransport).toHaveBeenCalledWith(
      'search_rail',
      expect.objectContaining({ passengers: 1 }),
    )

    const parsed = JSON.parse(output)
    expect(parsed.tool).toBe('search_rail')
    expect(parsed.options[0].mode).toBe('train')
    expect(parsed.options[0].from_place_id).toBe('blagoveshchensk')
    expect(parsed.options[0].price).toBe(2500)
  })

  it('падает на search_avia как фолбэк, если поиск поезда пустой', async () => {
    vi.mocked(searchTransport)
      .mockResolvedValueOnce({ offers: [] })
      .mockResolvedValueOnce(flightOffers())

    const tool = createTransportTool()
    const output = await tool.invoke({
      tool: 'search_rail',
      from_place_id: 'a',
      to_place_id: 'b',
      origin: 'А',
      destination: 'Б',
      departure_date: '2026-09-10',
      travelers: 2,
    })

    expect(searchTransport).toHaveBeenLastCalledWith(
      'search_avia',
      expect.objectContaining({ adults: 2 }),
    )
    const parsed = JSON.parse(output)
    expect(parsed.tool).toBe('search_avia')
    expect(parsed.options[0].mode).toBe('flight')
  })
})

describe('createHotelsTool', () => {
  it('вызывает search_hotels и возвращает отель с ценой за ночь', async () => {
    vi.mocked(searchHotels).mockResolvedValueOnce(hotelOffers())

    const tool = createHotelsTool()
    const output = await tool.invoke({
      place_id: 'vladivostok',
      city: 'Владивосток',
      check_in: '2026-09-10',
      check_out: '2026-09-17',
      adults: 1,
    })

    expect(searchHotels).toHaveBeenCalledWith(
      expect.objectContaining({ city_name: 'Владивосток', adults: 1 }),
    )

    const parsed = JSON.parse(output)
    expect(parsed.place_id).toBe('vladivostok')
    expect(parsed.options[0].name).toBe('Отель Владивосток')
    expect(parsed.options[0].price_per_night).toBe(1000) // 7000 / 7 ночей
    expect(parsed.options[0].place_id).toBe('vladivostok')
  })
})
