import { getSupabaseFromEvent } from '../../utils/auth'
import { updateTrip } from '../../services/store'
import type { Preferences, TripCore, TripDraft, TripPhase, TripState } from '~shared'

export default defineEventHandler(async (event) => {
  const supabase = getSupabaseFromEvent(event)
  const tripId = getRouterParam(event, 'id')

  if (!tripId) {
    throw createError({ statusCode: 400, statusMessage: 'trip id required' })
  }

  const body = await readBody<{
    title?: string
    draft?: TripDraft
    core?: TripCore
    preferences?: Preferences
    state?: TripState
    phase?: TripPhase
  }>(event)

  const patch = {
    ...(body.title !== undefined && { title: body.title }),
    ...(body.draft !== undefined && { draft: body.draft }),
    ...(body.core !== undefined && { core: body.core }),
    ...(body.preferences !== undefined && { preferences: body.preferences }),
    ...(body.state !== undefined && { state: body.state }),
    ...(body.phase !== undefined && { phase: body.phase }),
  }

  const trip = await updateTrip(supabase, tripId, patch)

  if (!trip) {
    throw createError({ statusCode: 404, statusMessage: 'trip not found' })
  }

  return trip
})