import { getSupabaseFromEvent } from '../utils/auth'
import { listTrips } from '../services/store'

export default defineEventHandler(async (event) => {
  const supabase = getSupabaseFromEvent(event)
  const trips = await listTrips(supabase)
  return trips
})
