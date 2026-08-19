import { getSupabaseFromEvent } from '../../../../utils/auth'
import { setProposalStatus } from '../../../../services/store'
import type { ProposalStatus } from '~shared'

export default defineEventHandler(async (event) => {
  const supabase = getSupabaseFromEvent(event)
  const tripId = getRouterParam(event, 'id')
  const proposalId = getRouterParam(event, 'proposalId')

  if (!tripId || !proposalId) {
    throw createError({ statusCode: 400, statusMessage: 'trip id and proposal id required' })
  }

  const body = await readBody<{ status: ProposalStatus }>(event)

  if (!body.status) {
    throw createError({ statusCode: 400, statusMessage: 'status required' })
  }

  const proposal = await setProposalStatus(supabase, tripId, proposalId, body.status)

  if (!proposal) {
    throw createError({ statusCode: 404, statusMessage: 'proposal not found' })
  }

  return proposal
})