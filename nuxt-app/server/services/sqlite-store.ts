import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import type {
  AgentEvent,
  Preferences,
  Proposal,
  ProposalStatus,
  TripCore,
  TripDraft,
  TripPhase,
  TripState,
} from '~shared'

// ─── SQLite-хранилище для демо без Supabase (node:sqlite, Node 22.5+) ──

export interface SqliteTripRow {
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

export interface SqliteMessageRow {
  id: string
  trip_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  tool_calls: Record<string, unknown> | null
  agent_state: string | null
  created_at: string
}

export interface SqliteProposalRow {
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

export interface SqliteEventRow {
  id: string
  trip_id: string
  event: AgentEvent
  created_at: string
}

const dbPath = process.env.NUXT_SQLITE_PATH
  ? resolve(process.env.NUXT_SQLITE_PATH)
  : resolve(process.cwd(), 'data', 'demo.db')

mkdirSync(dirname(dbPath), { recursive: true })

const db = new DatabaseSync(dbPath)

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS trips (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT,
    draft TEXT,
    core TEXT,
    preferences TEXT,
    state TEXT,
    phase TEXT NOT NULL DEFAULT 'collecting',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tool_calls TEXT,
    agent_state TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS proposals (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL,
    reason TEXT,
    changes TEXT,
    impact TEXT,
    decision_level TEXT NOT NULL,
    status TEXT NOT NULL,
    parent_proposal_id TEXT,
    created_at TEXT NOT NULL,
    decided_at TEXT
  );
  CREATE TABLE IF NOT EXISTS agent_events (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL,
    event TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS user_preferences (
    user_id TEXT PRIMARY KEY,
    data TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_messages_trip ON messages(trip_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_events_trip ON agent_events(trip_id, created_at);
`)

let seq = 1
const id = () => `sqlite-${seq++}-${Date.now().toString(36)}`
const now = () => new Date().toISOString()
const enc = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  // JSON-кодируем только объекты/массивы; скаляры (title, phase, role) храним как есть
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}
const dec = <T>(s: string | null | undefined): T | null => (s ? (JSON.parse(s) as T) : null)

// ─── Trips ─────────────────────────────────────────────────────────────

export async function createTrip(
  input: { title?: string; draft?: TripDraft; userId?: string } = {},
): Promise<SqliteTripRow> {
  const trip = {
    id: id(),
    user_id: input.userId ?? 'local-user',
    title: input.title ?? null,
    draft: input.draft ?? null,
    core: null,
    preferences: null,
    state: null,
    phase: 'collecting' as TripPhase,
    created_at: now(),
    updated_at: now(),
  }

  db.prepare(
    `INSERT INTO trips (id, user_id, title, draft, core, preferences, state, phase, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    trip.id,
    trip.user_id,
    trip.title,
    enc(trip.draft),
    enc(trip.core),
    enc(trip.preferences),
    enc(trip.state),
    trip.phase,
    trip.created_at,
    trip.updated_at,
  )

  return trip
}

export async function getTrip(tripId: string): Promise<SqliteTripRow | null> {
  const row = db.prepare('SELECT * FROM trips WHERE id = ?').get(tripId) as Record<string, unknown> | undefined
  if (!row) return null
  return mapTrip(row)
}

export async function updateTrip(
  tripId: string,
  patch: Partial<Pick<SqliteTripRow, 'draft' | 'core' | 'preferences' | 'state' | 'phase' | 'title'>>,
): Promise<SqliteTripRow | null> {
  const sets: string[] = []
  const args: unknown[] = []
  for (const [key, value] of Object.entries(patch)) {
    sets.push(`${key} = ?`)
    args.push(enc(value))
  }
  if (sets.length === 0) return getTrip(tripId)

  sets.push('updated_at = ?')
  args.push(now())
  args.push(tripId)

  db.prepare(`UPDATE trips SET ${sets.join(', ')} WHERE id = ?`).run(...args)
  return getTrip(tripId)
}

function mapTrip(row: Record<string, unknown>): SqliteTripRow {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    title: row.title as string | null,
    draft: dec<TripDraft>(row.draft as string | null),
    core: dec<TripCore>(row.core as string | null),
    preferences: dec<Preferences>(row.preferences as string | null),
    state: dec<TripState>(row.state as string | null),
    phase: (row.phase as TripPhase) ?? 'collecting',
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

// ─── Messages ──────────────────────────────────────────────────────────

export async function addMessage(
  tripId: string,
  msg: Pick<SqliteMessageRow, 'role' | 'content' | 'tool_calls' | 'agent_state'>,
): Promise<SqliteMessageRow> {
  const row: SqliteMessageRow = {
    id: id(),
    trip_id: tripId,
    role: msg.role,
    content: msg.content,
    tool_calls: msg.tool_calls ?? null,
    agent_state: msg.agent_state ?? null,
    created_at: now(),
  }

  db.prepare(
    `INSERT INTO messages (id, trip_id, role, content, tool_calls, agent_state, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(row.id, row.trip_id, row.role, row.content, enc(row.tool_calls), row.agent_state, row.created_at)

  return row
}

export async function listMessages(tripId: string): Promise<SqliteMessageRow[]> {
  const rows = db.prepare(
    'SELECT * FROM messages WHERE trip_id = ? ORDER BY created_at ASC',
  ).all(tripId) as Record<string, unknown>[]

  return rows.map((r) => ({
    id: r.id as string,
    trip_id: r.trip_id as string,
    role: r.role as SqliteMessageRow['role'],
    content: r.content as string,
    tool_calls: dec<Record<string, unknown>>(r.tool_calls as string | null),
    agent_state: r.agent_state as string | null,
    created_at: r.created_at as string,
  }))
}

// ─── User preferences ──────────────────────────────────────────────────

export async function getUserPreferences(userId: string): Promise<Record<string, unknown>> {
  const row = db.prepare('SELECT data FROM user_preferences WHERE user_id = ?').get(userId) as
    | Record<string, unknown>
    | undefined
  return row ? dec<Record<string, unknown>>(row.data as string) ?? {} : {}
}

// ─── Agent events ──────────────────────────────────────────────────────

export async function addEvent(tripId: string, event: AgentEvent): Promise<SqliteEventRow> {
  const row: SqliteEventRow = { id: id(), trip_id: tripId, event, created_at: now() }
  db.prepare('INSERT INTO agent_events (id, trip_id, event, created_at) VALUES (?, ?, ?, ?)').run(
    row.id,
    row.trip_id,
    enc(row.event),
    row.created_at,
  )
  return row
}

export async function listEvents(tripId: string): Promise<SqliteEventRow[]> {
  const rows = db.prepare(
    'SELECT * FROM agent_events WHERE trip_id = ? ORDER BY created_at ASC LIMIT 100',
  ).all(tripId) as Record<string, unknown>[]

  return rows.map((r) => ({
    id: r.id as string,
    trip_id: r.trip_id as string,
    event: dec<AgentEvent>(r.event as string)!,
    created_at: r.created_at as string,
  }))
}

// ─── Proposals ─────────────────────────────────────────────────────────

export async function createProposal(
  tripId: string,
  proposal: Proposal,
): Promise<SqliteProposalRow> {
  const row: SqliteProposalRow = {
    id: proposal.id,
    trip_id: tripId,
    reason: proposal.reason,
    changes: proposal.changes as unknown as Record<string, unknown>[],
    impact: proposal.impact as unknown as Record<string, unknown>,
    decision_level: proposal.decision_level,
    status: proposal.status,
    parent_proposal_id: proposal.parent_proposal_id,
    created_at: now(),
    decided_at: null,
  }

  db.prepare(
    `INSERT INTO proposals (id, trip_id, reason, changes, impact, decision_level, status, parent_proposal_id, created_at, decided_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.trip_id,
    row.reason,
    enc(row.changes),
    enc(row.impact),
    row.decision_level,
    row.status,
    row.parent_proposal_id,
    row.created_at,
    row.decided_at,
  )

  return row
}

export async function listProposals(tripId: string): Promise<SqliteProposalRow[]> {
  const rows = db.prepare(
    'SELECT * FROM proposals WHERE trip_id = ? ORDER BY created_at DESC',
  ).all(tripId) as Record<string, unknown>[]

  return rows.map((r) => ({
    id: r.id as string,
    trip_id: r.trip_id as string,
    reason: r.reason as string | null,
    changes: dec<Record<string, unknown>[]>(r.changes as string | null) ?? [],
    impact: dec<Record<string, unknown>>(r.impact as string | null),
    decision_level: r.decision_level as SqliteProposalRow['decision_level'],
    status: r.status as ProposalStatus,
    parent_proposal_id: r.parent_proposal_id as string | null,
    created_at: r.created_at as string,
    decided_at: r.decided_at as string | null,
  }))
}

export async function setProposalStatus(
  tripId: string,
  proposalId: string,
  status: ProposalStatus,
): Promise<SqliteProposalRow | null> {
  db.prepare('UPDATE proposals SET status = ?, decided_at = ? WHERE id = ? AND trip_id = ?').run(
    status,
    now(),
    proposalId,
    tripId,
  )
  const row = db.prepare('SELECT * FROM proposals WHERE id = ?').get(proposalId) as
    | Record<string, unknown>
    | undefined
  if (!row) return null
  return (await listProposals(tripId)).find((p) => p.id === proposalId) ?? null
}