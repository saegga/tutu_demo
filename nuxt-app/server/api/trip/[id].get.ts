import { getSupabaseFromEvent } from '../../utils/auth'
import { getTrip } from '../../services/store'

export default defineEventHandler(async (event) => {
  const supabase = getSupabaseFromEvent(event)
  const tripId = getRouterParam(event, 'id')

  if (!tripId) {
    throw createError({ statusCode: 400, statusMessage: 'trip id required' })
  }

  const trip = await getTrip(supabase, tripId)

  if (!trip) {
    throw createError({ statusCode: 404, statusMessage: 'trip not found' })
  }

  return trip
})