import { getSupabaseFromEvent } from '../../utils/auth'
import { deleteTrip } from '../../services/store'

export default defineEventHandler(async (event) => {
  const supabase = getSupabaseFromEvent(event)
  const tripId = getRouterParam(event, 'id')

  if (!tripId) {
    throw createError({ statusCode: 400, statusMessage: 'trip id required' })
  }

  await deleteTrip(supabase, tripId)
  return { ok: true }
})
