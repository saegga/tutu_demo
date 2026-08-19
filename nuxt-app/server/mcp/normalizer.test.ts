import { describe, expect, it } from 'vitest'

import {
  normalizeActivity,
  normalizeHotel,
  normalizeSearchResult,
  normalizeTransportLeg,
} from './normalizer'

const hotelPayload = {
  success: true,
  meta: { resolved_geo: { geo_type: 'locality', hotels_count: 12 } },
  offers: [
    {
      name: 'Moscow Marriott Grand Hotel',
      stars: 5,
      rating: 9.2,
      address: 'Тверская, 26',
      hotel_id: 100500,
      hotel_geo_id: 2657260,
      review_summary: 'Шумновато, но центр',
      photos: [{ url: 'https://x/1.jpg' }],
      best_offer: {
        price: { amount: 24_000, currency: 'RUB' },
        offerpack_hash: 'abc123',
        checkout_url: 'https://hotel.tutu.ru/offers/details?...',
        breakfast_included: true,
        free_cancellation: true,
        pay_at_hotel: false,
        pay_online: true,
      },
    },
  ],
}

const aviaPayload = {
  success: true,
  meta: { total_matched_exact: true },
  offers: [
    {
      price: 32_500,
      currency: 'RUB',
      legs: [
        {
          segments: [
            {
              voyage_no: 'SU 6176',
              origin: 'Москва',
              destination: 'Пхукет',
              departure_at: '2026-09-02T08:40:00+03:00',
              arrival_at: '2026-09-02T21:15:00+07:00',
              duration: '9ч 35мин',
            },
          ],
        },
      ],
      checkout_ref: {
        offer_hash: 'xyz',
        passengers_full: 1,
        passengers_child: 0,
        is_round_trip: false,
      },
    },
  ],
}

describe('normalizer.hotel', () => {
  it('maps best_offer into HotelOption with per-night price', () => {
    const [option] = normalizeSearchResult(hotelPayload, {
      tool: 'search_hotels',
      placeId: 'moscow',
      checkIn: '2026-08-20',
      checkOut: '2026-08-22',
    }).options

    expect(option.kind).toBe('hotel')
    expect(option.confidence).toBe(0.9)
    const hotel = option.normalized
    expect(hotel).toMatchObject({
      id: '2657260',
      place_id: 'moscow',
      name: 'Moscow Marriott Grand Hotel',
      rating: 9.2,
      price_per_night: 12_000,
      currency: 'RUB',
      check_in: '2026-08-20',
      check_out: '2026-08-22',
      source: 'mcp',
    })
    expect(hotel.booking_url).toContain('hotel.tutu.ru')
    expect(hotel.image_url).toBe('https://x/1.jpg')
  })

  it('falls back to whole-stay price when nights are unknown', () => {
    const raw = hotelPayload.offers[0]
    const option = normalizeHotel(raw, { placeId: 'moscow' })
    const hotel = option.normalized
    expect(hotel).toMatchObject({ id: '2657260', price_per_night: 24_000 })
  })
})

describe('normalizer.transport', () => {
  it('maps avia offer into a flight leg', () => {
    const [option] = normalizeSearchResult(aviaPayload, {
      tool: 'search_avia',
      placeId: 'moscow',
      toPlaceId: 'phuket',
    }).options

    expect(option.kind).toBe('flight')
    const leg = option.normalized
    expect(leg).toMatchObject({
      from_place_id: 'moscow',
      to_place_id: 'phuket',
      mode: 'flight',
      departure: '2026-09-02T08:40:00+03:00',
      arrival: '2026-09-02T21:15:00+07:00',
      price: 32_500,
      duration_min: 575,
      source: 'mcp',
    })
    expect(option.confidence).toBe(0.9)
  })

  it('uses search_results_url as booking link when no checkout_url', () => {
    const offer = {
      ...aviaPayload.offers[0],
      checkout_url: undefined,
      search_results_url: 'https://avia.tutu.ru/f/Moskva/Phuket/',
    }
    const option = normalizeTransportLeg(offer, {
      tool: 'search_avia',
      fromPlaceId: 'moscow',
      toPlaceId: 'phuket',
    })
    const leg = option.normalized
    expect(leg.booking_url).toBe('https://avia.tutu.ru/f/Moskva/Phuket/')
  })

  it('detects rail mode and station fields', () => {
    const rail = {
      price: 4_500,
      legs: [
        {
          segments: [
            {
              departure_station: 'Москва Ленинградский вокзал',
              arrival_station: 'Санкт-Петербург Московский вокзал',
              departure_at: '2026-09-01T08:00:00+03:00',
              arrival_at: '2026-09-01T11:35:00+03:00',
              duration: '3ч 35мин',
            },
          ],
        },
      ],
    }
    const option = normalizeTransportLeg(rail, {
      tool: 'search_rail',
      fromPlaceId: 'moscow',
      toPlaceId: 'spb',
    })
    const leg = option.normalized
    expect(option.kind).toBe('train')
    expect(leg).toMatchObject({ mode: 'train', price: 4_500, duration_min: 215 })
  })
})

describe('normalizer.activity', () => {
  it('maps an activity entry', () => {
    const option = normalizeActivity(
      { id: 'act-1', name: 'Снорклинг', category: 'beach', price: 1500 },
      { stopPlaceId: 'phuket' },
    )
    const activity = option.normalized
    expect(option.kind).toBe('activity')
    expect(activity).toMatchObject({
      id: 'act-1',
      stop_place_id: 'phuket',
      category: 'beach',
      price: 1500,
      source: 'mcp',
    })
  })
})