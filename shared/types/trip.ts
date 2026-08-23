// ============================================================
// Доменные типы hak-tutu
// Соответствует SPEC.md §2, §4–§5, §10–§12
// Чистые типы: никакой рантайм-логики (она в shared/lib/*)
// ============================================================

// ─── Места ────────────────────────────────────────────────────────────

export interface Place {
  id: string           // стабильный id: 'barcelona', 'phuket'
  name: string         // 'Барселона'
  country: string      // 'Испания'
  lat: number
  lng: number
  searchName?: string  // город для поиска билетов/отелей, если name — страна ('Таиланд' → 'Бангкок')
}

// ─── Сбор поездки (Фаза A) ────────────────────────────────────────────

export interface TripDates {
  start: string | null          // ISO "2026-09-01"; null, если известна только длительность
  end: string | null            // ISO; null, если известна только длительность
  duration_days: number | null  // «на 10 дней» → 10; = end − start, когда точные даты известны
}

export interface Travelers {
  adults: number
  children: number
  children_ages: number[]       // пусто, если детей нет
}

export interface TripDraft {
  origin: Place | null          // 1. Откуда
  destinations: Place[]         // 2. Куда (несколько мест = сложный маршрут)
  dates: TripDates              // 3. Даты (точные даты ИЛИ длительность)
  travelers: Travelers | null   // 4. Кто поедет
  needs: string[]               // 5. Что необходимо
  pending_destinations?: Place[] | null  // открытый вопрос «добавить/заменить» — ждём ответа пользователя
}

// ─── Ядро поездки (Фаза B) ────────────────────────────────────────────

export type Pace = 'relaxed' | 'moderate' | 'fast'

export interface TripCore {
  start: string        // ISO date "2026-09-01"
  end: string          // ISO date
  travelers: number
}

export interface Preferences {
  budget: number | null      // суммарный бюджет на поездку
  currency: string           // 'RUB' | 'USD' | ...
  pace: Pace
  interests: Record<string, number>   // "beach": 0.8, "culture": 0.7, "nightlife": 0.2 (0..1)
  transportMode?: TransportMode   // предпочтительный транспорт: 'train' | 'bus' | 'flight'
}

export interface Stop {
  place_id: string
  days: number
  locked: boolean      // пользователь явно зафиксировал — агент не меняет без спроса
  order: number        // позиция в маршруте
}

export interface Activity {
  id: string
  stop_place_id: string | null   // к какому стопу относится
  name: string
  category: string               // 'beach' | 'museum' | 'food' | 'nightlife' | ...
  price: number | null
  duration_min: number | null
  booking_url: string | null
  source: 'mcp' | 'llm' | 'user'
}

export type TransportMode = 'flight' | 'train' | 'bus' | 'car'

export interface TransportLeg {
  id: string
  from_place_id: string
  to_place_id: string
  mode: TransportMode
  departure: string | null       // ISO datetime
  arrival: string | null
  price: number | null
  currency: string
  duration_min: number | null
  booking_url: string | null
  source: 'mcp' | 'llm' | 'user'
}

export interface HotelOption {
  id: string
  place_id: string
  name: string
  rating: number | null
  price_per_night: number | null
  currency: string
  check_in: string | null
  check_out: string | null
  booking_url: string | null
  image_url: string | null   // первое фото отеля из MCP
  source: 'mcp' | 'llm' | 'user'
}

export interface HotelStay {
  hotel_id: string          // ссылка на HotelOption.id
  place_id: string          // город
  nights: number            // сколько ночей в этом отеле
}

export interface Constraint {
  id: string
  kind: 'no_night_transfer' | 'no_hotel_change' | 'no_early_morning' | 'custom'
  text: string          // человекочитаемо
}

// ─── TripState ────────────────────────────────────────────────────────

export interface TripState {
  trip: TripCore
  preferences: Preferences
  places: Place[]                    // справочник всех упомянутых мест
  stops: Stop[]
  activities: Activity[]
  transport: TransportLeg[]          // ВЫБРАННЫЕ перегоны (по одному на пару from→to)
  transport_options: TransportLeg[]  // все найденные варианты на каждый перегон (для выбора в UI)
  hotels: HotelOption[]              // все найденные отели
  hotel_stays: HotelStay[]           // выбранные отели с числом ночей (можно несколько в городе)
  constraints: Constraint[]
  pending_actions: string[]          // очевидные, ещё не применённые намерения пользователя
  updated_at: string
}

// ─── Proposal (Фаза B, правка маршрута) ──────────────────────────────

export type ChangeOp =
  | { operation: 'add_stop'; place_id: string; days: number; position?: number }
  | { operation: 'remove_stop'; place_id: string }
  | { operation: 'move_stop'; place_id: string; position: number }
  | { operation: 'change_duration'; place_id: string; days: number }
  | { operation: 'lock_stop'; place_id: string; locked: boolean }
  | { operation: 'add_activity'; activity: Activity }
  | { operation: 'remove_activity'; activity_id: string }
  | { operation: 'add_transport'; leg: TransportLeg }
  | { operation: 'add_hotel'; hotel: HotelOption }
  | { operation: 'set_budget'; budget: number; currency: string }
  | { operation: 'set_pace'; pace: Pace }
  | { operation: 'set_dates'; start: string; end: string }
  | { operation: 'set_travelers'; travelers: number }
  | { operation: 'set_interests'; interests: Record<string, number> }
  | { operation: 'add_constraint'; constraint: Constraint }
  | { operation: 'remove_constraint'; constraint_id: string }

export type DecisionLevel = 'auto' | 'proposal' | 'hitl'

export interface Impact {
  budget_delta: number | null
  travel_time_delta_min: number | null
  days_delta: number
  summary: string       // «+1 день в Париже, −1 день во Флоренции»
}

export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'applied' | 'failed'

export interface Proposal {
  id: string
  reason: string                    // «Ты просил добавить Париж»
  changes: ChangeOp[]
  impact: Impact
  decision_level: DecisionLevel
  status: ProposalStatus
  parent_proposal_id: string | null // для цепочек (перепланирование после FAIL)
}

// ─── Normalizer (Tutu MCP → TravelOption) ─────────────────────────────

export type TravelOptionKind = 'activity' | 'hotel' | 'flight' | 'train' | 'bus'

export interface TravelOption {
  kind: TravelOptionKind
  raw: Record<string, unknown>      // оригинал из MCP
  normalized: Activity | HotelOption | TransportLeg  // целевой доменный тип
  confidence: number                // 0..1 — насколько хорошо смаппились поля
}

// ─── Validator ────────────────────────────────────────────────────────

export interface ValidatorIssue {
  severity: 'error' | 'warning'
  code: string        // 'days_mismatch' | 'budget_exceeded' | 'missing_transport' | ...
  message: string
  path: string        // 'stops[0]' | 'trip'
}

export interface ValidatorResult {
  ok: boolean
  issues: ValidatorIssue[]
}

// ─── State machine агента ─────────────────────────────────────────────

export type AgentStatus =
  | 'idle'
  | 'understanding'
  | 'collecting'
  | 'generating'
  | 'planning'
  | 'searching'
  | 'replanning'
  | 'validating'
  | 'proposing'
  | 'waiting_for_user'
  | 'applying'
  | 'ready'

// ─── AgentEvent (Realtime для UI) ─────────────────────────────────────

export type AgentEvent =
  | { type: 'status'; state: AgentStatus; message: string }
  | { type: 'message'; role: 'user' | 'assistant'; content: string }
  | { type: 'draft_update'; draft: TripDraft }
  | { type: 'proposal'; proposal: Proposal }
  | { type: 'proposal_update'; proposal_id: string; status: ProposalStatus }
  | { type: 'state_update'; trip_state: TripState }
  | { type: 'tool_call'; tool: string; args: Record<string, unknown> }
  | { type: 'error'; message: string }

// ─── Фаза поездки ─────────────────────────────────────────────────────

export type TripPhase = 'collecting' | 'generated' | 'editing'