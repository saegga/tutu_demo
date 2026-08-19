import { createClient } from '@supabase/supabase-js'

export const getSupabase = (token?: string) => {
  const config = useRuntimeConfig()

  return createClient(
    config.supabaseUrl,
    config.supabasePublishableKey,
    token
      ? {
          global: {
            headers: { Authorization: `Bearer ${token}` },
          },
        }
      : undefined,
  )
}