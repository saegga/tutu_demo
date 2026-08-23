import { describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { readFileSync } from 'node:fs'

import type { TripState } from '~shared'

const mcpUrl = (() => {
  try {
    const env = readFileSync('.env', 'utf8')
    const m = env.match(/^NUXT_MCP_URL=(.+)$/m)
    if (m) return m[1].trim()
  } catch { /* ignore */ }
  return 'https://mcp.tutu.ru/mcp'
})()

vi.mock('../utils/mcp', () => ({
  async getMcpClient() {
    const client = new Client({ name: 'probe', version: '1.0.0' })
    const transport = new StreamableHTTPClientTransport(new URL(mcpUrl))
    await client.connect(transport)
    return { client, transport }
  },
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

describe('enrich transport end-to-end', () => {
  it('finds legs with train to Vladivostok', async () => {
    const { enrichTripStateWithTransport } = await import('./enrich')
    const out = await enrichTripStateWithTransport(state, ['во Владивосток на ж/д'])
    console.log('LEGS', out.transport.map((l) => `${l.from_place_id}->${l.to_place_id}:${l.mode}`).join(' | '))
    const bv = out.transport.find((l) => l.to_place_id === 'vladivostok')
    expect(out.transport.length).toBeGreaterThan(0)
    expect(bv?.mode).toBe('train')
  })
})