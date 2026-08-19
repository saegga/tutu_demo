import { createClient } from '@supabase/supabase-js'
import {
  emptyDraft,
  isDraftReadyToGenerate,
  type AgentStatus,
  type TripDraft,
  type TripState,
  type ValidatorIssue,
} from '~shared'

export interface UiMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
}

// Модульный синглтон: стейт общий для всех вызовов useAgent()
const tripId = ref<string | null>(null)
const draft = ref<TripDraft>(emptyDraft())
const messages = ref<UiMessage[]>([])
const status = ref<AgentStatus>('idle')
const tripState = ref<TripState | null>(null)
const issues = ref<ValidatorIssue[]>([])
const busy = ref(false)
const error = ref<string | null>(null)

const readyToGenerate = computed(() => isDraftReadyToGenerate(draft.value))

let supabase: ReturnType<typeof createClient> | null = null
let anonToken = ''

// В sqlite/mock-режиме (NUXT_PUBLIC_DB_MODE !== 'supabase') Supabase не используется
function needsSupabase(): boolean {
  return useRuntimeConfig().public.dbMode !== 'sqlite' && useRuntimeConfig().public.dbMode !== 'mock'
}

function getClient() {
  if (supabase) return supabase
  const config = useRuntimeConfig()
  supabase = createClient(
    config.public.supabaseUrl,
    config.public.supabasePublishableKey,
  )
  return supabase
}

async function ensureSession() {
  if (anonToken || !needsSupabase()) return
  try {
    const { data, error: signInError } = await getClient().auth.signInAnonymously()
    if (signInError) {
      error.value = `Ошибка входа: ${signInError.message}`
      return
    }
    anonToken = data.session?.access_token ?? ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

function headers() {
  return anonToken ? { 'x-supabase-auth': anonToken } : {}
}

async function init() {
  if (tripId.value) return
  await ensureSession()
  try {
    const trip = await $fetch('/api/trip', { method: 'POST', headers: headers() })
    tripId.value = trip.id
    if (trip.draft) draft.value = trip.draft
  } catch (e) {
    error.value = String(e)
  }
}

async function reset() {
  tripId.value = null
  draft.value = emptyDraft()
  messages.value = []
  tripState.value = null
  issues.value = []
  status.value = 'idle'
  error.value = null
  await init()
}

async function send(text: string) {
  if (!text.trim() || !tripId.value || busy.value) return

  const content = text.trim()
  messages.value.push({ id: Date.now(), role: 'user', content })
  busy.value = true
  error.value = null
  status.value = 'understanding'

  try {
    const result = await $fetch('/api/chat', {
      method: 'POST',
      headers: headers(),
      body: { tripId: tripId.value, message: content },
    })
    draft.value = result.draft
    status.value = result.status
    messages.value.push({ id: Date.now(), role: 'assistant', content: result.reply })
    if (result.regenerated && result.state) {
      tripState.value = result.state
      issues.value = result.issues ?? []
      status.value = 'ready'
    }
  } catch (e) {
    error.value = String(e)
  } finally {
    busy.value = false
  }
}

async function generate() {
  if (!readyToGenerate.value || !tripId.value || busy.value) return

  busy.value = true
  error.value = null
  status.value = 'generating'

  try {
    const result = await $fetch('/api/generate', {
      method: 'POST',
      headers: headers(),
      body: { tripId: tripId.value },
    })
    tripState.value = result.state
    issues.value = result.issues
    status.value = 'ready'
  } catch (e) {
    error.value = String(e)
  } finally {
    busy.value = false
  }
}

export function useAgent() {
  return {
    tripId,
    draft,
    messages,
    status,
    tripState,
    issues,
    busy,
    error,
    readyToGenerate,
    init,
    send,
    generate,
    reset,
  }
}