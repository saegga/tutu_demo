import type { ChangeOp, Place, Proposal, TripState } from '~shared'

// Применяет Proposal к TripState. newPlaces — справочник новых мест
// (для add_stop, когда место ещё не в state.places).
export function applyProposal(
  state: TripState,
  proposal: Proposal,
  newPlaces: Place[] = [],
): TripState {
  const next: TripState = {
    ...state,
    trip: { ...state.trip },
    preferences: {
      ...state.preferences,
      interests: { ...state.preferences.interests },
    },
    places: [...state.places],
    stops: state.stops.map((s) => ({ ...s })),
    activities: [...state.activities],
    transport: [...state.transport],
    hotels: [...state.hotels],
    constraints: [...state.constraints],
    pending_actions: [...state.pending_actions],
  }

  for (const op of proposal.changes) {
    applyChange(next, op, newPlaces)
  }

  next.updated_at = new Date().toISOString()
  return next
}

function applyChange(state: TripState, op: ChangeOp, newPlaces: Place[]): void {
  switch (op.operation) {
    case 'add_stop': {
      const place = newPlaces.find((p) => p.id === op.place_id)
      if (place && !state.places.some((p) => p.id === place.id)) {
        state.places.push(place)
      }
      const position = op.position ?? state.stops.length
      state.stops = state.stops
        .map((s) => (s.order >= position ? { ...s, order: s.order + 1 } : s))
        .concat({ place_id: op.place_id, days: op.days, locked: false, order: position })
      reindex(state)
      break
    }
    case 'remove_stop': {
      state.stops = state.stops.filter((s) => s.place_id !== op.place_id)
      state.activities = state.activities.filter((a) => a.stop_place_id !== op.place_id)
      state.hotels = state.hotels.filter((h) => h.place_id !== op.place_id)
      state.transport = state.transport.filter(
        (l) => l.from_place_id !== op.place_id && l.to_place_id !== op.place_id,
      )
      reindex(state)
      break
    }
    case 'move_stop': {
      const stop = state.stops.find((s) => s.place_id === op.place_id)
      if (stop) stop.order = op.position
      reindex(state)
      break
    }
    case 'change_duration': {
      const stop = state.stops.find((s) => s.place_id === op.place_id)
      if (stop) stop.days = op.days
      break
    }
    case 'lock_stop': {
      const stop = state.stops.find((s) => s.place_id === op.place_id)
      if (stop) stop.locked = op.locked
      break
    }
    case 'add_activity':
      state.activities.push(op.activity)
      break
    case 'remove_activity':
      state.activities = state.activities.filter((a) => a.id !== op.activity_id)
      break
    case 'add_transport':
      state.transport.push(op.leg)
      break
    case 'add_hotel':
      state.hotels.push(op.hotel)
      break
    case 'set_budget':
      state.preferences.budget = op.budget
      state.preferences.currency = op.currency
      break
    case 'set_pace':
      state.preferences.pace = op.pace
      break
    case 'set_dates':
      state.trip.start = op.start
      state.trip.end = op.end
      break
    case 'set_travelers':
      state.trip.travelers = op.travelers
      break
    case 'set_interests':
      state.preferences.interests = op.interests
      break
    case 'add_constraint':
      if (!state.constraints.some((c) => c.id === op.constraint.id)) {
        state.constraints.push(op.constraint)
      }
      break
    case 'remove_constraint':
      state.constraints = state.constraints.filter((c) => c.id !== op.constraint_id)
      break
  }
}

function reindex(state: TripState): void {
  state.stops = state.stops
    .sort((a, b) => a.order - b.order)
    .map((s, i) => ({ ...s, order: i }))
}