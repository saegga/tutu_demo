import { emptyDraft, isDraftReadyToGenerate } from '~shared'

import { buildGeneratedState } from '../agent/generate'
import { addEvent, getTrip, getUserPreferences, updateTrip } from '../services/store'
import { getSupabaseFromEvent } from '../utils/auth'

export default defineEventHandler(async (event) => {
  const supabase = getSupabaseFromEvent(event)
  const body = (await readBody<{ tripId: string }>(event)) ?? {}

  if (!body.tripId) {
    throw createError({ statusCode: 400, statusMessage: 'tripId required' })
  }

  const trip = await getTrip(supabase, body.tripId)
  if (!trip) throw createError({ statusCode: 404, statusMessage: 'trip not found' })

  const draft = trip.draft ?? emptyDraft()
  if (!isDraftReadyToGenerate(draft)) {
    throw createError({ statusCode: 400, statusMessage: 'draft not ready to generate' })
  }

  const prefs = await getUserPreferences(supabase, trip.user_id)
  const { state, issues } = await buildGeneratedState(draft, prefs)

  await updateTrip(supabase, body.tripId, {
    state,
    core: state.trip,
    preferences: state.preferences,
    phase: 'generated',
  })
  await addEvent(supabase, body.tripId, {
    type: 'state_update',
    trip_state: state,
  })

  return { state, issues }
})