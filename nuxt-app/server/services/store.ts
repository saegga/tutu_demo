import type { SupabaseClient } from '@supabase/supabase-js'

import { getDbMode } from '../utils/db-mode'

import * as mock from './mock-store'
import * as sqlite from './sqlite-store'
import * as supabaseStore from './trip-store'

// Фасад: sqlite / mock / supabase. Клиент (Supabase) передаётся первым
// аргументом ради единой сигнатуры; в не-supabase режимах игнорируется.

export const createTrip = (
  client: SupabaseClient,
  input: { title?: string; draft?: unknown; userId?: string },
) => {
  const mode = getDbMode()
  if (mode === 'sqlite') return sqlite.createTrip(input as Parameters<typeof sqlite.createTrip>[0])
  if (mode === 'mock') return mock.createTrip(input as Parameters<typeof mock.createTrip>[0])
  return supabaseStore.createTrip(client, input as Parameters<typeof supabaseStore.createTrip>[1])
}

export const getTrip = (client: SupabaseClient, tripId: string) => {
  const mode = getDbMode()
  if (mode === 'sqlite') return sqlite.getTrip(tripId)
  if (mode === 'mock') return mock.getTrip(tripId)
  return supabaseStore.getTrip(client, tripId)
}

export const updateTrip = (
  client: SupabaseClient,
  tripId: string,
  patch: Record<string, unknown>,
) => {
  const mode = getDbMode()
  if (mode === 'sqlite') return sqlite.updateTrip(tripId, patch)
  if (mode === 'mock') return mock.updateTrip(tripId, patch)
  return supabaseStore.updateTrip(client, tripId, patch)
}

export const addMessage = (
  client: SupabaseClient,
  tripId: string,
  msg: { role: string; content: string; tool_calls?: unknown; agent_state?: string },
) => {
  const mode = getDbMode()
  if (mode === 'sqlite') return sqlite.addMessage(tripId, msg)
  if (mode === 'mock') return mock.addMessage(tripId, msg)
  return supabaseStore.addMessage(client, tripId, msg)
}

export const listMessages = (client: SupabaseClient, tripId: string) => {
  const mode = getDbMode()
  if (mode === 'sqlite') return sqlite.listMessages(tripId)
  if (mode === 'mock') return mock.listMessages(tripId)
  return supabaseStore.listMessages(client, tripId)
}

export const getUserPreferences = (client: SupabaseClient, userId: string) => {
  const mode = getDbMode()
  if (mode === 'sqlite') return sqlite.getUserPreferences(userId)
  if (mode === 'mock') return mock.getUserPreferences(userId)
  return supabaseStore.getUserPreferences(client, userId)
}

export const addEvent = (client: SupabaseClient, tripId: string, event: unknown) => {
  const mode = getDbMode()
  if (mode === 'sqlite') return sqlite.addEvent(tripId, event as Parameters<typeof sqlite.addEvent>[1])
  if (mode === 'mock') return mock.addEvent(tripId, event as Parameters<typeof mock.addEvent>[1])
  return supabaseStore.addEvent(client, tripId, event as Parameters<typeof supabaseStore.addEvent>[2])
}

export const listEvents = (client: SupabaseClient, tripId: string, limit?: number) => {
  const mode = getDbMode()
  if (mode === 'sqlite') return sqlite.listEvents(tripId)
  if (mode === 'mock') return mock.listEvents(tripId)
  return supabaseStore.listEvents(client, tripId, limit)
}

export const listProposals = (client: SupabaseClient, tripId: string) => {
  const mode = getDbMode()
  if (mode === 'sqlite') return sqlite.listProposals(tripId)
  if (mode === 'mock') return mock.listProposals(tripId)
  return supabaseStore.listProposals(client, tripId)
}

export const setProposalStatus = (
  client: SupabaseClient,
  tripId: string,
  proposalId: string,
  status: string,
) => {
  const mode = getDbMode()
  const s = status as Parameters<typeof sqlite.setProposalStatus>[2]
  if (mode === 'sqlite') return sqlite.setProposalStatus(tripId, proposalId, s)
  if (mode === 'mock') return mock.setProposalStatus(tripId, proposalId, s)
  return supabaseStore.setProposalStatus(client, tripId, proposalId, s)
}