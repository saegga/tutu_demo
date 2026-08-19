import { enrichTripStateWithTransport } from '../mcp/enrich'
import { getTrip } from '../services/store'
import { getSupabaseFromEvent } from '../utils/auth'

export default defineEventHandler(async (event) => {
  const supabase = getSupabaseFromEvent(event)
  const trip = await getTrip(supabase, 'sqlite-8-mt0c4d2p')
  if (!trip?.state) return { error: 'no state' }

  try {
    const out = await enrichTripStateWithTransport(trip.state, trip.draft?.needs ?? [])
    return {
      ok: true,
      legs: out.transport.map((l) => `${l.from_place_id}→${l.to_place_id}:${l.mode}`),
      needs: trip.draft?.needs,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : undefined }
  }
})