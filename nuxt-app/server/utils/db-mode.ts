// Режим базы: sqlite (локально) / mock (in-memory) / supabase (продакшен).
// NUXT_DB=sqlite (или NUXT_SQLITE_PATH) → sqlite
// NUXT_MOCK_MODE=1 → mock
// иначе → supabase

export type DbMode = 'sqlite' | 'mock' | 'supabase'

export function getDbMode(): DbMode {
  if (process.env.NUXT_SQLITE_PATH || process.env.NUXT_DB === 'sqlite') return 'sqlite'
  if (process.env.NUXT_MOCK_MODE === '1') return 'mock'
  return 'supabase'
}

export function isSupabase(): boolean {
  return getDbMode() === 'supabase'
}

export function isMockMode(): boolean {
  return getDbMode() === 'mock'
}