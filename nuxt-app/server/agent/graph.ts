import type { BaseMessage } from '@langchain/core/messages'
import { Annotation, END, START, StateGraph } from '@langchain/langgraph'

import { isDraftReadyToGenerate, type AgentStatus, type TripDraft } from '~shared'

import { getChatModel } from './deepseek'
import { mergeDraft } from './nodes'
import { isCountryName } from './country-cities'
import { detectDestinationIntent, mergeDestinations } from './destinations'
import { CollectionResultSchema, type CollectionResult, type DraftPatchSchema } from './schema'
import { parseLooseJson } from '../utils/loose-json'

type DraftPatch = typeof DraftPatchSchema._output

const AgentState = Annotation.Root({
  systemPrompt: Annotation<string>({
    reducer: (_a, b) => b,
    default: () => '',
  }),
  messages: Annotation<BaseMessage[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
  draft: Annotation<TripDraft>({
    reducer: (_a, b) => b,
    default: () => ({}) as TripDraft,
  }),
  userPreferences: Annotation<Record<string, unknown>>({
    reducer: (_a, b) => b,
    default: () => ({}),
  }),
  collection: Annotation<CollectionResult | null>({
    reducer: (_a, b) => b,
    default: () => null,
  }),
  reply: Annotation<string>({
    reducer: (_a, b) => b,
    default: () => '',
  }),
  status: Annotation<AgentStatus>({
    reducer: (_a, b) => b,
    default: () => 'understanding',
  }),
  clarification: Annotation<string[]>({
    reducer: (_a, b) => b,
    default: () => [],
  }),
})

const EXTRACT_INSTRUCTION = `\n\nОтвечай СТРОГО одним JSON-объектом, без markdown и пояснений, в формате:
{"draft_patch": {"origin": {"id": "...", "name": "...", "country": "...", "lat": 0, "lng": 0} | null, "destinations": [{...}] | null, "dates": {"start": "YYYY-MM-DD" | null, "end": "YYYY-MM-DD" | null, "duration_days": 5 | null} | null, "travelers": {"adults": 1, "children": 0, "children_ages": []} | null, "needs": ["..."] | null}, "question": "строка" | null, "summary": "строка"}
Все строки — только в двойных кавычках. Поля draft_patch, которые в диалоге не упомянуты, — null.`

async function understandNode(state: typeof AgentState.State) {
  const model = getChatModel()
  const messages: BaseMessage[] = [
    { role: 'system', content: state.systemPrompt },
    ...state.messages,
  ]

  // Быстрый путь: строгий структурированный вывод
  try {
    const structured = model.withStructuredOutput(CollectionResultSchema)
    const result = await structured.invoke(messages, {
      signal: AbortSignal.timeout(60_000),
    })
    return {
      collection: result,
      status: 'collecting' as AgentStatus,
    }
  } catch {
    // Запасной путь: обычный вывод → либеральный парсинг JSON (DeepSeek
    // иногда возвращает незакавыченные строки, с которыми не справляется
    // строгий парсер структурированного вывода).
    const response = await model.invoke(
      [...messages, { role: 'user', content: EXTRACT_INSTRUCTION }],
      { signal: AbortSignal.timeout(60_000) },
    )
    const text = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content)

    const parsed = parseLooseJson(text)
    const collection = CollectionResultSchema.parse(parsed)

    return {
      collection,
      status: 'collecting' as AgentStatus,
    }
  }
}

function lastUserMessage(messages: BaseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === 'user') {
      return typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
    }
  }
  return ''
}

function collectNode(state: typeof AgentState.State) {
  const result = state.collection
  if (!result?.draft_patch) {
    return { draft: { ...state.draft, pending_destinations: null } }
  }

  const patch = result.draft_patch

  // Если пункт назначения/отправления — страна («Таиланд»), а не город,
  // не мержим его в draft и просим уточнить конкретное место.
  const countries = [
    ...(patch.origin && isCountryName(patch.origin) ? [patch.origin.name] : []),
    ...(patch.destinations ?? []).filter(isCountryName).map((d) => d.name),
  ]

  const cleanPatch: DraftPatch = {
    ...patch,
    origin: patch.origin && isCountryName(patch.origin) ? null : patch.origin,
  }

  // Разбираемся с городами (страны уже отброшены): добавить или заменить?
  const incoming = patch.destinations?.filter((d) => !isCountryName(d)) ?? []
  if (incoming.length > 0) {
    const intent = detectDestinationIntent(state.draft.destinations, incoming, lastUserMessage(state.messages))

    if (intent === 'ask') {
      // Неоднозначно: не мержим, спрашиваем у пользователя и запоминаем
      // ожидающие города в draft.pending_destinations — ответ обработается в chat.post
      return {
        draft: {
          ...mergeDraft(state.draft, { ...cleanPatch, destinations: undefined }),
          pending_destinations: incoming,
        },
        clarification: [...new Set(countries)],
      }
    }

    cleanPatch.destinations = mergeDestinations(state.draft.destinations, incoming, intent)
  }

  return {
    draft: { ...mergeDraft(state.draft, cleanPatch), pending_destinations: null },
    clarification: [...new Set(countries)],
  }
}

function answerNode(state: typeof AgentState.State) {
  const result = state.collection
  const summary = result?.summary ?? ''

  // Нужно уточнить город — страна вместо конкретного места
  if (state.clarification.length > 0) {
    const places = state.clarification.join(', ')
    return {
      reply: `Куда именно ${places}? Назови город или конкретное место — так я точнее подберу билеты и отели.`,
      status: 'waiting_for_user' as AgentStatus,
    }
  }

  // Уже есть пункты, и пользователь добавил новые без уточнения —
  // спрашиваем: дополнительный пункт маршрута или замена.
  const pending = state.draft.pending_destinations
  if (pending && pending.length > 0) {
    const current = state.draft.destinations.map((p) => p.name).join(', ')
    const incoming = pending.map((p) => p.name).join(', ')
    return {
      reply: `Сейчас в маршруте: ${current}. Ты ещё упомянул: ${incoming}. Это дополнительные пункты (построю сложный маршрут) или заменить текущий список?`,
      status: 'waiting_for_user' as AgentStatus,
    }
  }

  const question = result?.question ?? null
  const ready = isDraftReadyToGenerate(state.draft)

  let reply = summary
  if (ready) {
    reply += '\nВсё верно? Если да — один твой кивок, и я запускаю генерацию!'
  } else if (question) {
    reply += `\n${question}`
  }

  return {
    reply,
    status: ready ? ('ready' as AgentStatus) : ('waiting_for_user' as AgentStatus),
  }
}

export function buildCollectionGraph() {
  const graph = new StateGraph(AgentState)
    .addNode('understand', understandNode)
    .addNode('collect', collectNode)
    .addNode('answer', answerNode)
    .addEdge(START, 'understand')
    .addEdge('understand', 'collect')
    .addEdge('collect', 'answer')
    .addEdge('answer', END)
    .compile()

  return graph
}