import type { ChangeOp, Impact, TripState } from '~shared'

import { totalKnownCost } from './validate'

export function computeImpact(
  before: TripState,
  after: TripState,
  changes: ChangeOp[],
): Impact {
  const beforeCost = totalKnownCost(before)
  const afterCost = totalKnownCost(after)
  const beforeDays = before.stops.reduce((sum, s) => sum + s.days, 0)
  const afterDays = after.stops.reduce((sum, s) => sum + s.days, 0)
  const beforeTime = before.transport.reduce((sum, l) => sum + (l.duration_min ?? 0), 0)
  const afterTime = after.transport.reduce((sum, l) => sum + (l.duration_min ?? 0), 0)

  return {
    budget_delta: afterCost - beforeCost,
    travel_time_delta_min: afterTime - beforeTime,
    days_delta: afterDays - beforeDays,
    summary: summarizeChanges(changes),
  }
}

export function summarizeChanges(changes: ChangeOp[]): string {
  return changes.map(summarizeChange).join(', ') || 'без изменений'
}

function summarizeChange(op: ChangeOp): string {
  switch (op.operation) {
    case 'add_stop':
      return `+${op.days} дн в «${op.place_id}»`
    case 'remove_stop':
      return `−«${op.place_id}»`
    case 'move_stop':
      return `«${op.place_id}» → позиция ${op.position + 1}`
    case 'change_duration':
      return `«${op.place_id}»: ${op.days} дн`
    case 'lock_stop':
      return `«${op.place_id}» ${op.locked ? 'зафиксирован' : 'разблокирован'}`
    case 'add_activity':
      return `активность «${op.activity.name}»`
    case 'remove_activity':
      return `убрана активность`
    case 'add_transport':
      return `транспорт «${op.leg.from_place_id} → ${op.leg.to_place_id}»`
    case 'add_hotel':
      return `отель «${op.hotel.name}»`
    case 'set_budget':
      return `бюджет ${op.budget} ${op.currency}`
    case 'set_pace':
      return `темп: ${op.pace}`
    case 'set_dates':
      return `даты ${op.start} → ${op.end}`
    case 'set_travelers':
      return `путешественников: ${op.travelers}`
    case 'set_interests':
      return `обновлены интересы`
    case 'add_constraint':
      return `ограничение: ${op.constraint.text}`
    case 'remove_constraint':
      return `снято ограничение`
  }
}