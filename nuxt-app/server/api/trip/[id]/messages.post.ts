import { getSupabaseFromEvent } from '../../../utils/auth'
import { addMessage } from '../../../services/store'

export default defineEventHandler(async (event) => {
  const supabase = getSupabaseFromEvent(event)
  const tripId = getRouterParam(event, 'id')

  if (!tripId) {
    throw createError({ statusCode: 400, statusMessage: 'trip id required' })
  }

  const body = await readBody<{
    role: 'user' | 'assistant' | 'system'
    content: string
    tool_calls?: Record<string, unknown> | null
    agent_state?: string | null
  }>(event)

  if (!body.role || typeof body.content !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'role and content required' })
  }

  const message = await addMessage(supabase, tripId, {
    role: body.role,
    content: body.content,
    tool_calls: body.tool_calls ?? null,
    agent_state: body.agent_state ?? null,
  })

  return message
})