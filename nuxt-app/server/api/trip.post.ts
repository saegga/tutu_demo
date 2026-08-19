import { getSupabaseFromEvent, getUserId } from '../utils/auth'
import { createTrip } from '../services/store'
import { isSupabase } from '../utils/db-mode'
import type { TripDraft } from '~shared'

export default defineEventHandler(async (event) => {
  const supabase = getSupabaseFromEvent(event)
  const body = (await readBody<{ title?: string; draft?: TripDraft }>(event)) ?? {}

  try {
    const userId = isSupabase() ? await getUserId(supabase) : 'local-user'
    if (isSupabase() && !userId) {
      throw new Error(
        'Нет авторизации. Включи Anonymous sign-in в Supabase (Authentication → Providers → Anonymous)',
      )
    }

    const trip = await createTrip(supabase, {
      title: body.title,
      draft: body.draft,
      userId: userId ?? undefined,
    })

    return trip
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[trip.post]', message)
    throw createError({ statusCode: 500, message })
  }
})