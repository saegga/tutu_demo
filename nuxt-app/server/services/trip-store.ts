import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  AgentEvent,
  Proposal,
  Preferences,
  ProposalStatus,
  TripCore,
  TripDraft,
  TripPhase,
  TripState,
} from '~shared'

export interface TripRow {
  id: string
  user_id: string
  title: string | null
  draft: TripDraft | null
  core: TripCore | null
  preferences: Preferences | null
  state: TripState | null
  phase: TripPhase
  created_at: string
  updated_at: string
}

export interface MessageRow {
  id: string
  trip_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  tool_calls: Record<string, unknown> | null
  agent_state: string | null
  created_at: string
}

export interface ProposalRow {
  id: string
  trip_id: string
  reason: string | null
  changes: Record<string, unknown>[]
  impact: Record<string, unknown> | null
  decision_level: 'auto' | 'proposal' | 'hitl'
  status: ProposalStatus
  parent_proposal_id: string | null
  created_at: string
  decided_at: string | null
}

export interface EventRow {
  id: string
  trip_id: string
  event: AgentEvent
  created_at: string
}

type TripPatch = Partial<
  Pick<TripRow, 'draft' | 'core' | 'preferences' | 'state' | 'phase' | 'title'>
>

// ─── Trips ─────────────────────────────────────────────────────────────

export async function createTrip(
  supabase: SupabaseClient,
  input: { title?: string; draft?: TripDraft; userId?: string } = {},
): Promise<TripRow> {
  const { data, error } = await supabase
    .from('trips')
    .insert({
      title: input.title ?? null,
      draft: input.draft ?? {},
      user_id: input.userId ?? null,
    })
    .select('*')
    .single()

  if (error) throw storeError('createTrip', error.message)
  return data as TripRow
}

export async function getTrip(
  supabase: SupabaseClient,
  tripId: string,
): Promise<TripRow | null> {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .eq('id', tripId)
    .maybeSingle()

  if (error) throw storeError('getTrip', error.message)
  return (data as TripRow) ?? null
}

export async function listTrips(supabase: SupabaseClient): Promise<TripRow[]> {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw storeError('listTrips', error.message)
  return (data as TripRow[]) ?? []
}

export async function deleteTrip(
  supabase: SupabaseClient,
  tripId: string,
): Promise<boolean> {
  const { error } = await supabase.from('trips').delete().eq('id', tripId)
  if (error) throw storeError('deleteTrip', error.message)
  return true
}

export async function updateTrip(
  supabase: SupabaseClient,
  tripId: string,
  patch: TripPatch,
): Promise<TripRow | null> {
  const { data, error } = await supabase
    .from('trips')
    .update(patch)
    .eq('id', tripId)
    .select('*')
    .maybeSingle()

  if (error) throw storeError('updateTrip', error.message)
  return (data as TripRow) ?? null
}

// ─── User preferences ──────────────────────────────────────────────────

export async function getUserPreferences(
  supabase: SupabaseClient,
  userId: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw storeError('getUserPreferences', error.message)
  return (data as Record<string, unknown>) ?? {}
}

// ─── Messages ──────────────────────────────────────────────────────────

export async function addMessage(
  supabase: SupabaseClient,
  tripId: string,
  msg: Pick<MessageRow, 'role' | 'content' | 'tool_calls' | 'agent_state'>,
): Promise<MessageRow> {
  const { data, error } = await supabase
    .from('messages')
    .insert({ trip_id: tripId, ...msg })
    .select('*')
    .single()

  if (error) throw storeError('addMessage', error.message)
  return data as MessageRow
}

export async function listMessages(
  supabase: SupabaseClient,
  tripId: string,
): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true })

  if (error) throw storeError('listMessages', error.message)
  return (data as MessageRow[]) ?? []
}

// ─── Proposals ─────────────────────────────────────────────────────────

export async function createProposal(
  supabase: SupabaseClient,
  tripId: string,
  proposal: Proposal,
): Promise<ProposalRow> {
  const { data, error } = await supabase
    .from('proposals')
    .insert({
      id: proposal.id,
      trip_id: tripId,
      reason: proposal.reason,
      changes: proposal.changes as unknown as Record<string, unknown>[],
      impact: proposal.impact as unknown as Record<string, unknown>,
      decision_level: proposal.decision_level,
      status: proposal.status,
      parent_proposal_id: proposal.parent_proposal_id,
    })
    .select('*')
    .single()

  if (error) throw storeError('createProposal', error.message)
  return data as ProposalRow
}

export async function listProposals(
  supabase: SupabaseClient,
  tripId: string,
): Promise<ProposalRow[]> {
  const { data, error } = await supabase
    .from('proposals')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false })

  if (error) throw storeError('listProposals', error.message)
  return (data as ProposalRow[]) ?? []
}

export async function setProposalStatus(
  supabase: SupabaseClient,
  tripId: string,
  proposalId: string,
  status: ProposalStatus,
): Promise<ProposalRow | null> {
  const { data, error } = await supabase
    .from('proposals')
    .update({ status, decided_at: new Date().toISOString() })
    .eq('id', proposalId)
    .eq('trip_id', tripId)
    .select('*')
    .maybeSingle()

  if (error) throw storeError('setProposalStatus', error.message)
  return (data as ProposalRow) ?? null
}

// ─── Agent events ──────────────────────────────────────────────────────

export async function addEvent(
  supabase: SupabaseClient,
  tripId: string,
  event: AgentEvent,
): Promise<EventRow> {
  const { data, error } = await supabase
    .from('agent_events')
    .insert({ trip_id: tripId, event })
    .select('*')
    .single()

  if (error) throw storeError('addEvent', error.message)
  return data as EventRow
}

export async function listEvents(
  supabase: SupabaseClient,
  tripId: string,
  limit = 100,
): Promise<EventRow[]> {
  const { data, error } = await supabase
    .from('agent_events')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) throw storeError('listEvents', error.message)
  return (data as EventRow[]) ?? []
}

function storeError(fn: string, message: string): Error {
  return new Error(`trip-store.${fn}: ${message}`)
}