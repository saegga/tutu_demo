import type { HotelOption, TransportLeg, TransportMode, TripState } from '~shared'

import { legTransportMode } from '../agent/transport-mode'
import { searchHotels, searchTransport, type TransportToolName } from './client'
import { normalizeSearchResult } from './normalizer'

// Best-effort: тянет по 2 отеля на каждый стоп через search_hotels.
// Ошибки MCP/сети не роняют генерацию — стейт просто остаётся без отелей.
export async function enrichTripStateWithHotels(state: TripState): Promise<TripState> {
  const searchName = (id: string): string | null => {
    const p = state.places.find((pl) => pl.id === id)
    return p?.searchName ?? p?.name ?? null
  }

  const hotels: HotelOption[] = [...state.hotels]
  const seen = new Set<string>()

  for (const stop of state.stops) {
    if (hotels.some((h) => h.place_id === stop.place_id)) continue

    const name = searchName(stop.place_id)
    if (!name || seen.has(name)) continue
    seen.add(name)

    try {
      const result = await searchHotels({
        city_name: name,
        check_in: state.trip.start,
        check_out: state.trip.end,
        adults: state.trip.travelers,
        page_size: 3,
        view: 'compact',
      })

      const { options } = normalizeSearchResult(result, {
        tool: 'search_hotels',
        placeId: stop.place_id,
        checkIn: state.trip.start,
        checkOut: state.trip.end,
      })

      const top = options
        .filter((o): o is { kind: 'hotel'; normalized: HotelOption } => o.kind === 'hotel')
        .map((o) => o.normalized)
        .slice(0, 2)

      hotels.push(...top)
    } catch {
      // MCP недоступен или пустой ответ — пропускаем стоп
    }
  }

  return { ...state, hotels }
}

// Best-effort: перелёты/поезда/автобусы по маршруту origin → stops → origin.
// Вид транспорта — ПО ПЕРЕГОНУ: из пожеланий («до Владивостока на ж/д»,
// «обратно на самолёте») или общий, по умолчанию — самый дешёвый рейс.
// Если предпочитаемый вид по паре городов ничего не нашёл — пробуем авиа.
export async function enrichTripStateWithTransport(
  state: TripState,
  needs: string[],
): Promise<TripState> {
  const legs: TransportLeg[] = [...state.transport]
  const origin = state.places[0]
  if (!origin || state.stops.length === 0) return state

  const searchName = (id: string): string | null => {
    const p = state.places.find((pl) => pl.id === id)
    return p?.searchName ?? p?.name ?? null
  }

  const stops = [...state.stops].sort((a, b) => a.order - b.order)
  const route: { fromId: string; toId: string; date: string }[] = []

  route.push({ fromId: origin.id, toId: stops[0].place_id, date: state.trip.start })
  for (let i = 0; i < stops.length - 1; i++) {
    route.push({ fromId: stops[i].place_id, toId: stops[i + 1].place_id, date: state.trip.start })
  }
  route.push({ fromId: stops[stops.length - 1].place_id, toId: origin.id, date: state.trip.end })

  for (const seg of route) {
    if (legs.some((l) => l.from_place_id === seg.fromId && l.to_place_id === seg.toId)) continue

    const mode =
      legTransportMode(seg.fromId, seg.toId, needs, state.places)
      ?? state.preferences.transportMode
      ?? 'flight'
    const found = await searchLeg(modeTools(mode), modeKinds(mode), seg, state, searchName)
    if (found) legs.push(found)
  }

  return { ...state, transport: legs }
}

function modeTools(mode: TransportMode): TransportToolName[] {
  const primary: TransportToolName =
    mode === 'train' ? 'search_rail' : mode === 'bus' ? 'search_bus' : 'search_avia'
  return mode === 'flight' ? [primary] : [primary, 'search_avia']
}

function modeKinds(mode: TransportMode): string[] {
  return mode === 'flight' ? ['flight'] : mode === 'train' ? ['train', 'flight'] : ['bus', 'flight']
}

// MCP-сервер строго валидирует аргументы: у search_avia нет passengers,
// у search_rail нет adults. Собираем аргументы под конкретный инструмент.
function transportArgs(
  tool: TransportToolName,
  seg: { fromId: string; toId: string; date: string },
  travelers: number,
  searchName: (id: string) => string | null,
): Record<string, unknown> {
  const base = {
    origin: searchName(seg.fromId) ?? seg.fromId,
    destination: searchName(seg.toId) ?? seg.toId,
    departure_date: seg.date,
    page_size: 3,
    sort: 'price_asc',
    view: 'compact',
  }
  if (tool === 'search_avia' || tool === 'search_bus') return { ...base, adults: travelers }
  if (tool === 'search_rail') return { ...base, passengers: travelers }
  return base
}

async function searchLeg(
  tools: TransportToolName[],
  kinds: string[],
  seg: { fromId: string; toId: string; date: string },
  state: TripState,
  searchName: (id: string) => string | null,
): Promise<TransportLeg | null> {
  for (const tool of tools) {
    try {
      const result = await searchTransport(tool, transportArgs(tool, seg, state.trip.travelers, searchName))

      const { options } = normalizeSearchResult(result, {
        tool,
        placeId: seg.fromId,
        toPlaceId: seg.toId,
      })

      const match = options
        .filter((o): o is { kind: string; normalized: TransportLeg } => kinds.includes(o.kind))
        .map((o) => o.normalized)
        .sort((a, b) => (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY))[0]

      if (match) return match
    } catch {
      // MCP недоступен — пробуем следующий инструмент
    }
  }
  return null
}