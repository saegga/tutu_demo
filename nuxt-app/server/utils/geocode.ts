const cache = new Map<string, { lat: number; lng: number }>()

// Геокодинг через Nominatim (OSM, бесплатно). Кэш в памяти процесса.
export async function geocode(name: string): Promise<{ lat: number; lng: number } | null> {
  const key = name.toLowerCase().trim()
  if (cache.has(key)) return cache.get(key)!

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(name)}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'hak-tutu/1.0' },
    })
    if (!res.ok) return null
    const data = (await res.json()) as { lat: string; lon: string }[]
    const first = data[0]
    if (!first) return null

    const result = { lat: Number.parseFloat(first.lat), lng: Number.parseFloat(first.lon) }
    cache.set(key, result)
    return result
  } catch {
    return null
  }
}