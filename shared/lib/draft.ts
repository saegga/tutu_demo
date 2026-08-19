// ============================================================
// Draft-логика (SPEC.md §2) — изоморфная, используется
// и в server (кнопка/агент), и в app (активация кнопки)
// ============================================================

import type { TripDraft } from '../types/trip'

export function emptyDraft(): TripDraft {
  return {
    origin: null,
    destinations: [],
    dates: { start: null, end: null, duration_days: null },
    travelers: null,
    needs: [],
  }
}

export function hasDuration(d: TripDraft): boolean {
  return d.dates.duration_days !== null
    || (d.dates.start !== null && d.dates.end !== null)
}

// Достаточно для генерации: маршрут + кто едет.
// Даты/длительность не обязательны — подставляются ближайшие (по умолчанию 7 дней).
export function isDraftReadyToGenerate(d: TripDraft): boolean {
  return d.origin !== null
    && d.destinations.length > 0
    && d.travelers !== null
}

// Полностью заполнены все 5 полей (уже с точными датами и стилем).
export function isDraftComplete(d: TripDraft): boolean {
  return isDraftReadyToGenerate(d) && d.needs.length > 0
}

// Слияние частичного обновления draft (из tool-вызова `update_trip_draft`).
// destinations/needs модель возвращает ПОЛНЫМ итоговым списком → заменяем целиком.
export function mergeDraftUpdate(base: TripDraft, update: Partial<TripDraft>): TripDraft {
  return {
    ...base,
    origin: update.origin !== undefined ? update.origin : base.origin,
    destinations: update.destinations !== undefined ? update.destinations : base.destinations,
    dates: update.dates ? { ...base.dates, ...update.dates } : base.dates,
    travelers: update.travelers !== undefined ? update.travelers : base.travelers,
    needs: update.needs !== undefined ? update.needs : base.needs,
  }
}