import type {
  Activity,
  HotelOption,
  TransportLeg,
  TransportMode,
  TravelOption,
} from '~shared'

import type { McpResult } from './client'

// ─── Безопасные аксессоры ──────────────────────────────────────────────

function asArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null)
}

// photos из search_hotels — массив строк-URL (в старых ответах — объекты с url)
function imageUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((v): string | null => {
      if (typeof v === 'string') return v
      if (v && typeof v === 'object' && 'url' in v) {
        const url = (v as Record<string, unknown>).url
        return typeof url === 'string' ? url : null
      }
      return null
    })
    .filter((v): v is string => v !== null && v.startsWith('http'))
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseFloat(value.replace(/\s/g, ''))
    return Number.isFinite(parsed) ? parsed : null
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return num(obj.amount ?? obj.value ?? obj.total)
  }
  return null
}

function str(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return null
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime()
  return Math.max(0, Math.round(ms / 86_400_000))
}

// ─── Нормализация отелей (search_hotels) ───────────────────────────────

interface HotelNormalizeContext {
  placeId: string
  checkIn?: string | null
  checkOut?: string | null
}

export function normalizeHotel(raw: Record<string, unknown>, ctx: HotelNormalizeContext): TravelOption {
  const best = (raw.best_offer ?? {}) as Record<string, unknown>
  const priceRaw = best.price
  const priceObj = (priceRaw && typeof priceRaw === 'object'
    ? priceRaw
    : { amount: priceRaw }) as Record<string, unknown>

  const wholeStay = num(priceObj.amount ?? priceObj.price)
  const currency = str(priceObj.currency) ?? 'RUB'
  const nights = ctx.checkIn && ctx.checkOut
    ? daysBetween(ctx.checkIn, ctx.checkOut)
    : 1

  const id = str(raw.hotel_geo_id)
    ?? str(raw.hotel_id)
    ?? str(raw.tutu_offer_id)
    ?? `hotel-${ctx.placeId}-${imageUrls(raw.photos).length}`

  const hotel: HotelOption = {
    id,
    place_id: ctx.placeId,
    name: str(raw.name) ?? 'Отель без названия',
    rating: num(raw.rating) ?? num(raw.stars) ?? null,
    price_per_night: wholeStay !== null ? Math.round(wholeStay / Math.max(1, nights)) : null,
    currency,
    check_in: ctx.checkIn ?? null,
    check_out: ctx.checkOut ?? null,
    booking_url: str(best.checkout_url) ?? str(raw.checkout_url) ?? null,
    image_url: imageUrls(raw.photos)[0] ?? null,
    source: 'mcp',
  }

  const mapped = [hotel.name, hotel.price_per_night].filter((v) => v != null).length
  return {
    kind: 'hotel',
    raw,
    normalized: hotel,
    confidence: mapped >= 2 ? 0.9 : mapped === 1 ? 0.6 : 0.3,
  }
}

// ─── Нормализация транспорта (search_avia / rail / bus / etrain) ──────

function detectMode(tool: string | undefined, raw: Record<string, unknown>): TransportMode {
  if (tool === 'search_avia') return 'flight'
  if (tool === 'search_rail' || tool === 'search_etrain') return 'train'
  if (tool === 'search_bus') return 'bus'
  const vehicle = str(raw.vehicle_meta?.name ?? raw.transport_type)
  if (vehicle) {
    if (/авиа|flight|plane/.test(vehicle)) return 'flight'
    if (/автобус|bus/.test(vehicle)) return 'bus'
    if (/поезд|train|электрич/.test(vehicle)) return 'train'
  }
  return 'train'
}

function legPlaces(raw: Record<string, unknown>): { from?: string; to?: string } {
  const firstSeg = firstSegment(raw)
  const lastSeg = lastSegment(raw)
  return {
    from: str(firstSeg?.origin ?? firstSeg?.from ?? firstSeg?.departure_station),
    to: str(lastSeg?.destination ?? lastSeg?.to ?? lastSeg?.arrival_station),
  }
}

function firstSegment(raw: Record<string, unknown>): Record<string, unknown> | null {
  const legs = asArray(raw.legs)
  const segs = asArray(legs[0]?.segments)
  return segs[0] ?? legs[0] ?? null
}

function lastSegment(raw: Record<string, unknown>): Record<string, unknown> | null {
  const legs = asArray(raw.legs)
  const lastLeg = legs[legs.length - 1]
  const segs = asArray(lastLeg?.segments)
  return segs[segs.length - 1] ?? lastLeg ?? null
}

export function normalizeTransportLeg(raw: Record<string, unknown>, ctx: {
  tool?: string
  fromPlaceId: string
  toPlaceId: string
}): TravelOption {
  const mode = detectMode(ctx.tool, raw)
  const price = num(raw.price)
  const currency = str(raw.currency) ?? 'RUB'
  const first = firstSegment(raw)
  const last = lastSegment(raw)

  const departure = str(first?.departure_at ?? first?.departure ?? first?.departure_time)
  const arrival = str(last?.arrival_at ?? last?.arrival ?? last?.arrival_time)
  const durationMin = durationToMinutes(str(first?.duration ?? last?.duration ?? raw.duration))
  const places = legPlaces(raw)

  const id = str(raw.offer_id ?? raw.id)
    ?? `leg-${ctx.fromPlaceId}-${ctx.toPlaceId}-${departure ?? '?'}-${mode}`

  const leg: TransportLeg = {
    id,
    from_place_id: ctx.fromPlaceId,
    to_place_id: ctx.toPlaceId,
    mode,
    departure,
    arrival,
    price,
    currency,
    duration_min: durationMin,
    booking_url: str(raw.checkout_url) ?? str(raw.search_results_url) ?? null,
    source: 'mcp',
  }

  const mapped = [places.from, places.to, price, departure].filter((v) => v != null).length
  return {
    kind: mode === 'flight' ? 'flight' : mode === 'train' ? 'train' : 'bus',
    raw,
    normalized: leg,
    confidence: mapped >= 3 ? 0.9 : mapped >= 1 ? 0.6 : 0.3,
  }
}

function durationToMinutes(duration: string | null): number | null {
  if (!duration) return null
  const h = duration.match(/(\d+)\s*ч/)
  const m = duration.match(/(\d+)\s*мин/)
  const total = (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0)
  return total > 0 ? total : null
}

// ─── Нормализация активностей (search_hotels → ничего, кроме LLM) ──────

export function normalizeActivity(raw: Record<string, unknown>, ctx: {
  stopPlaceId: string | null
}): TravelOption {
  const id = str(raw.id) ?? `act-${ctx.stopPlaceId ?? '?'}-${asArray(raw.photos ?? []).length}`

  const activity: Activity = {
    id,
    stop_place_id: ctx.stopPlaceId,
    name: str(raw.name) ?? 'Активность',
    category: str(raw.category) ?? 'other',
    price: num(raw.price),
    duration_min: num(raw.duration_min ?? raw.duration),
    booking_url: str(raw.booking_url) ?? null,
    source: 'mcp',
  }

  return {
    kind: 'activity',
    raw,
    normalized: activity,
    confidence: activity.name ? 0.9 : 0.3,
  }
}

// ─── Точка входа: пакетная нормализация результата поиска ─────────────

export interface NormalizeSearchContext {
  tool?: string
  placeId?: string
  toPlaceId?: string
  checkIn?: string | null
  checkOut?: string | null
}

export interface NormalizedSearchResult {
  options: TravelOption[]
  rawOffers: Record<string, unknown>[]
}

export function normalizeSearchResult(
  payload: McpResult,
  ctx: NormalizeSearchContext,
): NormalizedSearchResult {
  const items = asArray(payload.offers ?? payload.hotels ?? [])
  const options: TravelOption[] = []

  for (const raw of items) {
    if (raw.best_offer) {
      options.push(normalizeHotel(raw, {
        placeId: ctx.placeId ?? 'unknown',
        checkIn: ctx.checkIn,
        checkOut: ctx.checkOut,
      }))
    } else if (raw.legs || raw.segments || raw.checkout_ref || raw.checkout_url) {
      options.push(normalizeTransportLeg(raw, {
        tool: ctx.tool,
        fromPlaceId: ctx.placeId ?? 'origin',
        toPlaceId: ctx.toPlaceId ?? 'destination',
      }))
    } else if (raw.name || raw.title) {
      options.push(normalizeActivity(raw, { stopPlaceId: ctx.placeId ?? null }))
    }
  }

  return { options, rawOffers: items }
}