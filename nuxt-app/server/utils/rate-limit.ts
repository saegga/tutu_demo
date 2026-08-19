// Простой in-memory rate limiter (окно на ключ).
// Для демо достаточно; на продакшене — Redis/UPSERT в Supabase.

const buckets = new Map<string, { count: number; reset: number }>()

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || bucket.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs })
    return true
  }

  if (bucket.count >= limit) return false
  bucket.count++
  return true
}