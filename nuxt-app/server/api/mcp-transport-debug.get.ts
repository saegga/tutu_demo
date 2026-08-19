import { searchTransport } from '../mcp/client'

export default defineEventHandler(async () => {
  const out: Record<string, unknown> = {}

  for (const [tool, origin, destination] of [
    ['search_avia', 'Москва', 'Благовещенск'],
    ['search_rail', 'Благовещенск', 'Владивосток'],
  ] as const) {
    const base = {
      origin,
      destination,
      departure_date: '2026-09-10',
      page_size: 3,
      sort: 'price_asc',
      view: 'compact',
    }
    const args = tool === 'search_avia'
      ? { ...base, adults: 1 }
      : { ...base, passengers: 1 }

    try {
      const r = await searchTransport(tool, args)
      const s = JSON.stringify(r)
      out[tool] = { ok: true, len: s.length, sample: s.slice(0, 150) }
    } catch (e) {
      out[tool] = { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  return out
})