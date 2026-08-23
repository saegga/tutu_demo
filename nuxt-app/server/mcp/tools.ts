import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'

import type { HotelOption, TransportLeg } from '~shared'

import { searchHotels, searchTransport, type TransportToolName } from './client'
import { normalizeSearchResult } from './normalizer'

// LangChain-инструменты поверх Tutu MCP. Их вызывает агент (bindTools),
// а не хардкод в generate.ts: LLM решает, какие перегоны/города искать.

const TRANSPORT_TOOLS = ['search_avia', 'search_rail', 'search_bus'] as const
export type TransportToolChoice = (typeof TRANSPORT_TOOLS)[number]

export interface TransportToolOutput {
  tool: TransportToolName
  from_place_id: string
  to_place_id: string
  options: TransportLeg[]
}

export interface HotelsToolOutput {
  place_id: string
  options: HotelOption[]
}

export interface TransportToolArgs {
  tool: TransportToolChoice
  from_place_id: string
  to_place_id: string
  origin: string
  destination: string
  departure_date: string
  travelers: number
}

export interface HotelsToolArgs {
  place_id: string
  city: string
  check_in: string
  check_out: string
  adults: number
}

function transportCallArgs(
  tool: TransportToolName,
  base: Record<string, unknown>,
  travelers: number,
): Record<string, unknown> {
  // MCP-сервер строго валидирует аргументы: у search_rail нет adults, у avia/bus нет passengers.
  if (tool === 'search_rail') return { ...base, passengers: travelers }
  return { ...base, adults: travelers }
}

export async function searchTransportWithTool(
  args: TransportToolArgs,
): Promise<TransportToolOutput> {
  // Предпочитаемый вид → если пусто, пробуем авиа (как в enrich-фолбэке).
  const tools: TransportToolName[] =
    args.tool === 'search_avia' ? ['search_avia'] : [args.tool, 'search_avia']

  for (const tool of tools) {
    try {
      const base = {
        origin: args.origin,
        destination: args.destination,
        departure_date: args.departure_date,
        page_size: 3,
        sort: 'price_asc',
        view: 'compact',
      }
      const raw = await searchTransport(tool, transportCallArgs(tool, base, args.travelers))
      const { options } = normalizeSearchResult(raw, {
        tool,
        placeId: args.from_place_id,
        toPlaceId: args.to_place_id,
      })
      const legs = options
        .filter(
          (o): o is { kind: string; normalized: TransportLeg } =>
            typeof o.normalized === 'object'
            && o.normalized !== null
            && 'from_place_id' in o.normalized,
        )
        .map((o) => o.normalized)
        .sort((a, b) => (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY))

      if (legs.length > 0) {
        return { tool, from_place_id: args.from_place_id, to_place_id: args.to_place_id, options: legs }
      }
    } catch {
      // MCP недоступен — пробуем следующий инструмент
    }
  }

  return { tool: args.tool, from_place_id: args.from_place_id, to_place_id: args.to_place_id, options: [] }
}

export async function searchHotelsWithTool(args: HotelsToolArgs): Promise<HotelsToolOutput> {
  try {
    const raw = await searchHotels({
      city_name: args.city,
      check_in: args.check_in,
      check_out: args.check_out,
      adults: args.adults,
      page_size: 10,
      view: 'compact',
    })
    const { options } = normalizeSearchResult(raw, {
      tool: 'search_hotels',
      placeId: args.place_id,
      checkIn: args.check_in,
      checkOut: args.check_out,
    })
    const hotels = options
      .filter((o): o is { kind: 'hotel'; normalized: HotelOption } => o.kind === 'hotel')
      .map((o) => o.normalized)

    return { place_id: args.place_id, options: hotels }
  } catch {
    return { place_id: args.place_id, options: [] }
  }
}

export function createTransportTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'search_transport',
    description:
      'Поиск билетов на один перегон: самолёт (tool=search_avia), поезд (tool=search_rail), '
      + 'автобус (tool=search_bus). Возвращает до 3 вариантов с ценой, временем отправления '
      + 'и ссылкой на покупку. from_place_id/to_place_id бери из плана как есть.',
    schema: z.object({
      tool: z.enum(TRANSPORT_TOOLS).describe('Какой вид транспорта искать'),
      from_place_id: z.string().describe('Внутренний id города отправления (из плана)'),
      to_place_id: z.string().describe('Внутренний id города назначения (из плана)'),
      origin: z.string().describe('Название города отправления для поиска'),
      destination: z.string().describe('Название города назначения для поиска'),
      departure_date: z.string().describe('Дата отправления в формате YYYY-MM-DD'),
      travelers: z.number().int().min(1).describe('Количество путешественников'),
    }),
    func: async (args) => JSON.stringify(await searchTransportWithTool(args as TransportToolArgs)),
  })
}

export function createHotelsTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'search_hotels',
    description:
      'Поиск отелей в одном городе. Возвращает до 10 вариантов с ценой за ночь, рейтингом '
      + 'и ссылкой на бронирование. place_id бери из плана как есть.',
    schema: z.object({
      place_id: z.string().describe('Внутренний id города (из плана)'),
      city: z.string().describe('Название города для поиска отелей'),
      check_in: z.string().describe('Дата заезда YYYY-MM-DD'),
      check_out: z.string().describe('Дата выезда YYYY-MM-DD'),
      adults: z.number().int().min(1).describe('Количество взрослых'),
    }),
    func: async (args) => JSON.stringify(await searchHotelsWithTool(args as HotelsToolArgs)),
  })
}
