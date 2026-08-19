<template>
  <div class="relative h-full w-full">
    <div ref="mapEl" class="h-full w-full" />
    <div
      v-if="mapError"
      class="absolute inset-0 z-[1100] flex items-center justify-center bg-white/85 p-4 text-center text-sm text-red-600"
    >
      {{ mapError }}
    </div>

    <div
      v-if="hasTransport"
      class="absolute bottom-6 left-3 z-[1000] rounded-lg bg-white/95 px-3 py-2 text-[11px] text-slate-600 shadow-lg"
    >
      <div v-for="row in legend" :key="row.label" class="flex items-center gap-2 py-0.5">
        <span
          class="inline-block h-0 w-5 border-t-2"
          :class="row.dash ? 'border-dashed' : ''"
          :style="{ borderColor: row.color }"
        />
        <span>{{ row.label }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TransportMode, TripState } from '~shared'

const props = defineProps<{ state: TripState | null; active: boolean }>()

const mapEl = ref<HTMLElement | null>(null)
const mapError = ref<string | null>(null)

let leaflet: typeof import('leaflet') | null = null
let map: import('leaflet').Map | null = null
let markers: import('leaflet').Marker[] = []
let lines: import('leaflet').Polyline[] = []

const MODE_STYLE: Record<TransportMode, { color: string; dash?: string; arc?: boolean }> = {
  flight: { color: '#3b82f6', dash: '6 6', arc: true },
  train: { color: '#f97316' },
  bus: { color: '#14b8a6' },
  car: { color: '#8b5cf6' },
}

const LEGEND: { mode: TransportMode; label: string }[] = [
  { mode: 'flight', label: 'Авиа' },
  { mode: 'train', label: 'Поезд' },
  { mode: 'car', label: 'Авто' },
  { mode: 'bus', label: 'Автобус' },
]

const hasTransport = computed(() => (props.state?.transport.length ?? 0) > 0)

const legend = computed(() =>
  LEGEND.filter((row) => props.state?.transport.some((l) => l.mode === row.mode)).map((row) => ({
    ...row,
    color: MODE_STYLE[row.mode].color,
    dash: Boolean(MODE_STYLE[row.mode].dash),
  })),
)

// Дуга (авиа): квадратичная безье с контрольной точкой, смещённой
// перпендикулярно хорде. Точки — [lat, lng].
function arcPoints(a: [number, number], b: [number, number]): [number, number][] {
  const [latA, lngA] = a
  const [latB, lngB] = b
  const dlng = lngB - lngA
  const dlat = latB - latA
  const len = Math.hypot(dlng, dlat) || 1
  const off = Math.min(0.15 * len, 8)

  const ctrlLng = (lngA + lngB) / 2 - (dlat / len) * off
  const ctrlLat = (latA + latB) / 2 + (dlng / len) * off

  const pts: [number, number][] = []
  const steps = 32
  for (let t = 0; t <= 1; t += 1 / steps) {
    const u = 1 - t
    pts.push([
      u * u * latA + 2 * u * t * ctrlLat + t * t * latB,
      u * u * lngA + 2 * u * t * ctrlLng + t * t * lngB,
    ])
  }
  return pts
}

async function ensureMap(): Promise<boolean> {
  if (map && mapEl.value) return true
  if (!mapEl.value) return false

  try {
    const mod = await import('leaflet')
    await import('leaflet/dist/leaflet.css')
    leaflet = mod

    map = mod.map(mapEl.value, { zoomControl: true }).setView([55.76, 37.64], 4)
    mod.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    mapError.value = null
    return true
  } catch (e) {
    mapError.value = e instanceof Error ? e.message : String(e)
    console.error('Leaflet init error:', e)
    return false
  }
}

function dotIcon(color: string, label?: string) {
  const L = leaflet
  if (!L) throw new Error('leaflet not loaded')

  const html = label
    ? `<div class="trip-marker" style="background:${color}"><span class="trip-marker-label">${label}</span></div>`
    : `<div class="trip-marker" style="background:${color}"></div>`

  return L.divIcon({ className: 'trip-marker-wrap', html, iconSize: [14, 14], iconAnchor: [7, 7] })
}

function clearLayers() {
  markers.forEach((m) => m.remove())
  markers = []
  lines.forEach((l) => l.remove())
  lines = []
}

async function draw(state: TripState) {
  if (!(await ensureMap())) return
  clearLayers()

  const L = leaflet
  if (!L || !map) return

  const byId = new Map(state.places.map((p) => [p.id, p]))
  const coords: [number, number][] = []

  const addMarker = (placeId: string, color: string, label?: string) => {
    const place = byId.get(placeId)
    if (!place || (place.lat === 0 && place.lng === 0)) return

    coords.push([place.lat, place.lng])
    markers.push(L.marker([place.lat, place.lng], { icon: dotIcon(color, label) }).addTo(map!))
  }

  const origin = state.places[0]
  if (origin) addMarker(origin.id, '#16a34a')

  const stops = [...state.stops].sort((a, b) => a.order - b.order)
  stops.forEach((s, i) => addMarker(s.place_id, '#2563eb', String(i + 1)))

  // Транспортные сегменты: свой стиль для каждого вида транспорта
  state.transport.forEach((leg) => {
    const from = byId.get(leg.from_place_id)
    const to = byId.get(leg.to_place_id)
    if (!from || !to) return
    if ((from.lat === 0 && from.lng === 0) || (to.lat === 0 && to.lng === 0)) return

    const style = MODE_STYLE[leg.mode] ?? MODE_STYLE.car
    const pts = style.arc
      ? arcPoints([from.lat, from.lng], [to.lat, to.lng])
      : [[from.lat, from.lng], [to.lat, to.lng]]

    lines.push(
      L.polyline(pts, {
        color: style.color,
        weight: 3,
        opacity: 0.7,
        ...(style.dash ? { dashArray: style.dash } : {}),
      }).addTo(map!),
    )
  })

  // Масштаб на весь маршрут
  const bounds = L.latLngBounds([])
  markers.forEach((m) => bounds.extend(m.getLatLng()))
  lines.forEach((l) => bounds.extend(l.getBounds()))

  if (bounds.isValid()) {
    map.fitBounds(bounds, { padding: [48, 48] })
  } else if (coords.length === 1) {
    map.setView(coords[0], 10)
  }
}

watch(
  () => props.state,
  async (state) => {
    if (state) await draw(state)
  },
  { deep: true },
)

onMounted(async () => {
  await ensureMap()
  if (props.state) await draw(props.state)
})

onBeforeUnmount(() => {
  if (map) {
    map.remove()
    map = null
  }
})
</script>

<style>
.trip-marker-wrap {
  background: transparent;
  border: none;
}
.trip-marker {
  width: 14px;
  height: 14px;
  border-radius: 9999px;
  border: 2px solid #fff;
  box-shadow: 0 1px 4px rgb(0 0 0 / 0.4);
  position: relative;
}
.trip-marker-label {
  position: absolute;
  top: -22px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  font-weight: 600;
  color: #1e293b;
  background: #fff;
  border-radius: 4px;
  padding: 0 4px;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.2);
  white-space: nowrap;
}
</style>