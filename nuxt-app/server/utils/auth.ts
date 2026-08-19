import type { H3Event } from 'h3'
import type { SupabaseClient } from '@supabase/supabase-js'

import { getDbMode } from './db-mode'
import { getSupabase } from './supabase'

export function getSupabaseFromEvent(event: H3Event): SupabaseClient {
  // В sqlite/mock-режиме Supabase не используется — возвращаем заглушку,
  // фасад store.ts в этих режимах клиент игнорирует.
  if (getDbMode() !== 'supabase') return null as unknown as SupabaseClient

  const token = getHeader(event, 'x-supabase-auth')
  return getSupabase(token ?? undefined)
}

export async function getUserId(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return data.user.id
}