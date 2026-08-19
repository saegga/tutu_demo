import type { Client } from '@modelcontextprotocol/sdk/client/index.js'

import { getMcpClient } from '../utils/mcp'

export type McpResult = Record<string, unknown>

// ─── Общие хелперы ─────────────────────────────────────────────────────

export async function callMcpTool<T extends McpResult = McpResult>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { client, transport } = await getMcpClient()

  try {
    const result = await client.callTool({ name, arguments: args })
    const text = extractMcpText(result)
    if (!text) throw new Error(`MCP tool ${name}: пустой ответ`)

    return JSON.parse(text) as T
  } finally {
    await transport.close()
  }
}

function extractMcpText(
  result: { content?: { type?: string; text?: string }[] },
): string | null {
  const content = result.content ?? []
  for (const item of content) {
    if (item.type === 'text' && typeof item.text === 'string') {
      return item.text
    }
  }
  return null
}

// ─── Типизированные обёртки инструментов Tutu MCP ──────────────────────

export interface SearchHotelsArgs {
  city_name?: string | null
  geo_id?: string | null
  check_in?: string | null
  check_out?: string | null
  adults?: number
  children_ages?: number[] | null
  page?: number
  page_size?: number
  price_max?: number
  stars?: number[]
  meals?: string[]
  hotel_types?: string[]
  min_rating?: number
  free_cancellation?: boolean
  breakfast_included?: boolean
  hotel_amenities?: string[]
  room_amenities?: string[]
  view?: 'compact' | 'full'
}

export async function searchHotels(args: SearchHotelsArgs): Promise<McpResult> {
  return callMcpTool('search_hotels', args as Record<string, unknown>)
}

export type TransportToolName =
  | 'search_avia'
  | 'search_rail'
  | 'search_bus'
  | 'search_etrain'
  | 'search_multitransport'

export interface SearchTransportArgs {
  origin?: string | null
  destination?: string | null
  departure_date?: string | null
  return_date?: string | null
  adults?: number
  children?: number
  infants?: number
  passengers?: number
  service_class?: string
  page?: number
  page_size?: number
  sort?: string
  price_max?: number
  direct_only?: boolean
  carriers?: string[]
  flight_numbers?: string[]
  train_numbers?: string[]
  seat_categories?: string[]
  view?: 'compact' | 'full'
}

export async function searchTransport(
  tool: TransportToolName,
  args: SearchTransportArgs,
): Promise<McpResult> {
  return callMcpTool(tool, args as Record<string, unknown>)
}

export async function getOfferDetails(
  args: Record<string, unknown>,
): Promise<McpResult> {
  return callMcpTool('get_offer_details', args)
}

export async function getRailSeatmap(
  args: Record<string, unknown>,
): Promise<McpResult> {
  return callMcpTool('get_rail_seatmap', args)
}

export async function createCheckoutLink(
  checkoutRef: Record<string, unknown>,
): Promise<McpResult> {
  return callMcpTool('create_checkout_link', { checkout_ref: checkoutRef })
}

export async function fetchResource(uri: string): Promise<unknown> {
  const { client, transport } = await getMcpClient()

  try {
    const result = await client.readResource({ uri })
    const text = extractMcpText(result as { content?: { type?: string; text?: string }[] })
    if (!text) throw new Error(`MCP resource ${uri}: пустой ответ`)

    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  } finally {
    await transport.close()
  }
}

// ─── Utils MCP ─────────────────────────────────────────────────────────

export async function listMcpTools(): Promise<unknown[]> {
  const { client, transport } = await getMcpClient()

  try {
    const result = await client.listTools()
    return result.tools
  } finally {
    await transport.close()
  }
}

export type { Client }