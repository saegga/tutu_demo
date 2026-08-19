import { emptyDraft, isDraftReadyToGenerate, type TripState, type ValidatorIssue } from '~shared'

import { buildGeneratedState } from '../agent/generate'
import { runCollectionAgent } from '../agent'
import { classifyAddReplaceAnswer, mergeDestinations } from '../agent/destinations'
import {
  addEvent,
  addMessage,
  getTrip,
  getUserPreferences,
  listMessages,
  updateTrip,
} from '../services/store'
import { getSupabaseFromEvent } from '../utils/auth'
import { rateLimit } from '../utils/rate-limit'

const MAX_MESSAGE_LENGTH = 2000

export default defineEventHandler(async (event) => {
  const supabase = getSupabaseFromEvent(event)
  const body = (await readBody<{ tripId: string; message: string }>(event)) ?? {}

  if (!body.tripId || typeof body.message !== 'string' || !body.message.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'tripId и message обязательны' })
  }

  if (body.message.length > MAX_MESSAGE_LENGTH) {
    throw createError({
      statusCode: 400,
      statusMessage: `Сообщение длиннее ${MAX_MESSAGE_LENGTH} символов`,
    })
  }

  if (!rateLimit(`chat:${body.tripId}`, 20, 60_000)) {
    throw createError({ statusCode: 429, statusMessage: 'Слишком часто. Подожди минуту.' })
  }

  const trip = await getTrip(supabase, body.tripId)
  if (!trip) throw createError({ statusCode: 404, statusMessage: 'trip not found' })

  const draft = trip.draft ?? emptyDraft()
  const prior = await listMessages(supabase, body.tripId)
  const prefs = await getUserPreferences(supabase, trip.user_id)

  await addMessage(supabase, body.tripId, { role: 'user', content: body.message })
  await addEvent(supabase, body.tripId, {
    type: 'status',
    state: 'understanding',
    message: 'Понимаю…',
  })

  const history = [
    ...prior
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: body.message },
  ]

  let nextDraft: typeof draft
  let reply: string
  let status: 'ready' | 'waiting_for_user' | 'collecting' | 'understanding'
  let regenerated = false
  let state: TripState | null = null
  let stateIssues: ValidatorIssue[] = []

  // Открытый вопрос «добавить/заменить» — отвечаем на него напрямую,
  // не прогоняя ответ через модель (иначе модель повторно ставит ask → цикл).
  const pending = draft.pending_destinations
  if (pending && pending.length > 0) {
    const intent = classifyAddReplaceAnswer(body.message, pending)
    if (intent === 'add' || intent === 'replace') {
      const destinations =
        intent === 'add'
          ? mergeDestinations(draft.destinations, pending, 'add')
          : pending
      nextDraft = { ...draft, destinations, pending_destinations: null }
      const names = destinations.map((p) => p.name).join(' → ')
      const origin = nextDraft.origin?.name ?? 'домой'
      reply =
        intent === 'add'
          ? `Добавил в маршрут! Теперь: ${origin} → ${names}.`
          : `Обновил пункты: ${origin} → ${names}.`
      status = 'waiting_for_user'
    } else {
      nextDraft = draft
      const names = pending.map((p) => p.name).join(', ')
      reply = `Так что делаем с ${names} — добавить в маршрут или заменить текущий список?`
      status = 'waiting_for_user'
    }
  } else {
    // Пользователь подтверждает запуск генерации («да», «всё верно») —
    // строим маршрут сразу, без вопроса модели (иначе модель повторяет
    // «Всё верно? Если да — кивок» бесконечно).
    const lastAssistant = prior.filter((m) => m.role === 'assistant').at(-1)?.content ?? ''
    const asksConfirmation = /(вс[ёе] готово|генераци|кивок|запускаю генерацию)/.test(lastAssistant)
    const isConfirmation = /(^|\s)(да|давай|конечно|поехали|запускай|запусти|согласен|го|верно|точно|ок|ok|вс[ёе] верно|вс[ёе] правильно)(\s|$|[.,!?])/.test(
      body.message.toLowerCase(),
    )

    if (asksConfirmation && isConfirmation && isDraftReadyToGenerate(draft)) {
      nextDraft = draft
      try {
        const gen = await buildGeneratedState(draft, prefs)
        state = gen.state
        stateIssues = gen.issues
        regenerated = true
        reply = `Запускаю генерацию!\n\n${routeSummary(gen.state)}\n\nСмотри детали маршрута, транспорта и отелей справа.`
        status = 'ready'
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        reply = `Упс, не удалось построить маршрут: ${message}. Попробуй ещё раз.`
        status = 'waiting_for_user'
        nextDraft = draft

        await addEvent(supabase, body.tripId, { type: 'error', message })
      }
    } else {
      try {
        const result = await runCollectionAgent({
          draft,
          userPreferences: prefs,
          messages: history,
        })
        nextDraft = result.draft
        reply = result.reply
        status = result.status as typeof status
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        reply = `Упс, что-то пошло не так: ${message}. Попробуй перефразировать.`
        status = 'waiting_for_user'
        nextDraft = draft

        await addEvent(supabase, body.tripId, { type: 'error', message })
      }
    }
  }

  await updateTrip(supabase, body.tripId, { draft: nextDraft })
  await addMessage(supabase, body.tripId, {
    role: 'assistant',
    content: reply,
    agent_state: status,
  })
  await addEvent(supabase, body.tripId, { type: 'draft_update', draft: nextDraft })
  await addEvent(supabase, body.tripId, {
    type: 'status',
    state: status,
    message: 'Готово',
  })

  // Авто-перегенерация: если маршрут уже был построен и draft изменился —
  // пересобираем состояние прямо в чате, без повторного нажатия кнопки.
  // (Ветка подтверждения генерации выше уже пересобрала state сама.)
  const draftChanged = JSON.stringify(nextDraft) !== JSON.stringify(draft)
  if (!regenerated && draftChanged && trip.state && isDraftReadyToGenerate(nextDraft)) {
    try {
      const gen = await buildGeneratedState(nextDraft, prefs)
      state = gen.state
      stateIssues = gen.issues
      regenerated = true

      await updateTrip(supabase, body.tripId, {
        state: gen.state,
        core: gen.state.trip,
        preferences: gen.state.preferences,
        phase: 'generated',
      })
      await addEvent(supabase, body.tripId, { type: 'state_update', trip_state: gen.state })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      await addEvent(supabase, body.tripId, {
        type: 'error',
        message: `Перегенерация не удалась: ${message}`,
      })
    }
  }

  if (regenerated && state) {
    await updateTrip(supabase, body.tripId, {
      state,
      core: state.trip,
      preferences: state.preferences,
      phase: 'generated',
    })
    await addEvent(supabase, body.tripId, { type: 'state_update', trip_state: state })
  }

  return {
    reply,
    draft: nextDraft,
    status,
    readyToGenerate: isDraftReadyToGenerate(nextDraft),
    regenerated,
    state: regenerated ? state : undefined,
    issues: regenerated ? stateIssues : undefined,
  }
})

function routeSummary(state: TripState): string {
  const nameOf = (id: string) => state.places.find((p) => p.id === id)?.name ?? id
  const first = state.places[0]
  const names = [first ? nameOf(first.id) : '', ...state.stops.map((s) => nameOf(s.place_id))]
    .filter(Boolean)
    .join(' → ')
  const modes = state.transport.map((t) => t.mode).join(', ')
  return `Маршрут: ${names}.\nТранспорт: ${modes || 'подбирается'}.\nОтелей подобрано: ${state.hotels.length}.`
}