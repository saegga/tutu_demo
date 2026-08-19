import type {
  AgentEvent,
  Preferences,
  ProposalStatus,
  TripCore,
  TripDraft,
  TripPhase,
  TripState,
} from '~shared'

// ─── In-memory хранилище для демо без Supabase ─────────────────────────

export interface MockTripRow {
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

export interface MockMessageRow {
  id: string
  trip_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  tool_calls: Record<string, unknown> | null
  agent_state: string | null
  created_at: string
}

export interface MockProposalRow {
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

export interface MockEventRow {
  id: string
  trip_id: string
  event: AgentEvent
  created_at: string
}

const trips = new Map<string, MockTripRow>()
const messages = new Map<string, MockMessageRow[]>()
const proposals = new Map<string, MockProposalRow[]>()
const events = new Map<string, MockEventRow[]>()
const prefs = new Map<string, Record<string, unknown>>()

let seq = 1
const id = () => `mock-${seq++}`
const now = () => new Date().toISOString()

export async function createTrip(
  input: { title?: string; draft?: TripDraft; userId?: string } = {},
): Promise<MockTripRow> {
  const trip: MockTripRow = {
    id: id(),
    user_id: input.userId ?? 'mock-user',
    title: input.title ?? null,
    draft: input.draft ?? null,
    core: null,
    preferences: null,
    state: null,
    phase: 'collecting',
    created_at: now(),
    updated_at: now(),
  }
  trips.set(trip.id, trip)
  messages.set(trip.id, [])
  proposals.set(trip.id, [])
  events.set(trip.id, [])
  return trip
}

export async function getTrip(tripId: string): Promise<MockTripRow | null> {
  return trips.get(tripId) ?? null
}

export async function updateTrip(
  tripId: string,
  patch: Partial<Pick<MockTripRow, 'draft' | 'core' | 'preferences' | 'state' | 'phase' | 'title'>>,
): Promise<MockTripRow | null> {
  const trip = trips.get(tripId)
  if (!trip) return null
  Object.assign(trip, patch, { updated_at: now() })
  return trip
}

export async function addMessage(
  tripId: string,
  msg: Pick<MockMessageRow, 'role' | 'content' | 'tool_calls' | 'agent_state'>,
): Promise<MockMessageRow> {
  const row: MockMessageRow = {
    id: id(),
    trip_id: tripId,
    role: msg.role,
    content: msg.content,
    tool_calls: msg.tool_calls ?? null,
    agent_state: msg.agent_state ?? null,
    created_at: now(),
  }
  const list = messages.get(tripId) ?? []
  list.push(row)
  messages.set(tripId, list)
  return row
}

export async function listMessages(tripId: string): Promise<MockMessageRow[]> {
  return messages.get(tripId) ?? []
}

export async function getUserPreferences(_userId: string): Promise<Record<string, unknown>> {
  return prefs.get(_userId) ?? {}
}

export async function addEvent(tripId: string, event: AgentEvent): Promise<MockEventRow> {
  const row: MockEventRow = { id: id(), trip_id: tripId, event, created_at: now() }
  const list = events.get(tripId) ?? []
  list.push(row)
  events.set(tripId, list)
  return row
}

export async function listEvents(tripId: string): Promise<MockEventRow[]> {
  return events.get(tripId) ?? []
}

export async function listProposals(tripId: string): Promise<MockProposalRow[]> {
  return proposals.get(tripId) ?? []
}

export async function setProposalStatus(
  tripId: string,
  proposalId: string,
  status: ProposalStatus,
): Promise<MockProposalRow | null> {
  const list = proposals.get(tripId) ?? []
  const row = list.find((p) => p.id === proposalId) ?? null
  if (row) {
    row.status = status
    row.decided_at = now()
  }
  return row
}

// Экспорт только для тестов
export function _resetMockStore(): void {
  trips.clear()
  messages.clear()
  proposals.clear()
  events.clear()
  prefs.clear()
  seq = 1
}

export function _seedMockPreference(userId: string, data: Record<string, unknown>): void {
  prefs.set(userId, data)
}

export function _countMockTrips(): number {
  return trips.size
}