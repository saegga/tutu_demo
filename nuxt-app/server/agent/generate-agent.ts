import { SystemMessage, ToolMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import type { DynamicStructuredTool } from '@langchain/core/tools'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { END, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph'

import type { HotelOption, TransportLeg, TransportMode, TripState } from '~shared'

import { getChatModel } from './deepseek'
import { planTransportRoute, type TransportPlanLeg } from '../mcp/enrich'
import { createHotelsTool, createTransportTool } from '../mcp/tools'

// ─── Системный промпт: агент вызывает инструменты по детерминированному плану ──

function modeToTool(mode: TransportMode): string {
  if (mode === 'train') return 'search_rail'
  if (mode === 'bus') return 'search_bus'
  return 'search_avia'
}

export function buildGenerationSystemPrompt(
  state: TripState,
  needs: string[],
  plan: TransportPlanLeg[],
): string {
  const travelers = state.trip.travelers

  const legLines = plan.map((leg) => [
    `- from_place_id='${leg.fromId}', to_place_id='${leg.toId}'`,
    `tool='${modeToTool(leg.mode)}'`,
    `origin='${leg.origin}'`,
    `destination='${leg.destination}'`,
    `departure_date='${leg.date}'`,
  ].join(', '))

  const hotelLines = state.stops.map((stop) => {
    const p = state.places.find((pl) => pl.id === stop.place_id)
    const city = p?.searchName ?? p?.name ?? stop.place_id
    return `- place_id='${stop.place_id}', city='${city}'`
  })

  return [
    'Ты — движок подбора билетов и отелей. Твоя работа — вызвать инструменты поиска по плану ниже.',
    'Отвечай ТОЛЬКО вызовами инструментов, без пояснений и текста.',
    '',
    `Путешественников: ${travelers}.`,
    '',
    'Перегоны — для каждого вызови search_transport с аргументами из плана:',
    legLines.length ? legLines.join('\n') : '- перегонов нет',
    '',
    'Отели — для каждого города вызови search_hotels (check_in=' + `'${state.trip.start}'`
      + `, check_out='${state.trip.end}'` + `, adults=${travelers}):`,
    hotelLines.length ? hotelLines.join('\n') : '- городов нет',
    '',
    'Вызови ВСЕ инструменты из списка, не пропуская. from_place_id/to_place_id/place_id и даты '
      + 'передавай ТОЧНО как указано. Пожелания пользователя: '
      + (needs.length ? needs.join('; ') : 'нет'),
  ].join('\n')
}

// ─── Граф: agent (bindTools) ⇄ tools, пока есть tool_calls ─────────────

export function buildGenerationGraph(
  model: BaseChatModel,
  tools: DynamicStructuredTool[],
) {
  const toolsByName = new Map(tools.map((t) => [t.name, t]))

  async function agentNode(state: typeof MessagesAnnotation.State) {
    const response = await model.invoke(state.messages)
    return { messages: [response] }
  }

  async function toolsNode(state: typeof MessagesAnnotation.State) {
    const last = state.messages[state.messages.length - 1]
    const calls = last?.tool_calls ?? []

    // Инструменты вызываем параллельно, чтобы не ждать N×latency MCP подряд.
    const results = await Promise.all(
      calls.map(async (call) => {
        const tool = toolsByName.get(call.name)
        let content: string
        if (!tool) {
          content = JSON.stringify({ error: `Неизвестный инструмент ${call.name}` })
        } else {
          try {
            content = String(await tool.invoke(call.args))
          } catch (e) {
            content = JSON.stringify({
              error: `Ошибка инструмента ${call.name}: ${e instanceof Error ? e.message : String(e)}`,
            })
          }
        }
        return new ToolMessage({ content, tool_call_id: call.id })
      }),
    )

    return { messages: results }
  }

  function shouldContinue(state: typeof MessagesAnnotation.State) {
    const last = state.messages[state.messages.length - 1]
    const hasCalls = last && Array.isArray(last.tool_calls) && last.tool_calls.length > 0
    return hasCalls ? 'tools' : END
  }

  return new StateGraph(MessagesAnnotation)
    .addNode('agent', agentNode)
    .addNode('tools', toolsNode)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', shouldContinue, { tools: 'tools', [END]: END })
    .addEdge('tools', 'agent')
    .compile()
}

// ─── Сборка результата из ToolMessages ────────────────────────────────

export interface GenerationAgentResult {
  transport: TransportLeg[]          // выбранные (лучшие по цене) перегоны — по одному на пару
  transport_options: TransportLeg[]  // все найденные варианты на каждый перегон
  hotels: HotelOption[]
}

export function assembleFromToolMessages(messages: BaseMessage[]): GenerationAgentResult {
  const transport: TransportLeg[] = []
  const transport_options: TransportLeg[] = []
  const hotels: HotelOption[] = []
  const seenLegs = new Set<string>()
  const seenOptions = new Set<string>()
  const seenHotels = new Set<string>()

  for (const m of messages) {
    if (m.getType() !== 'tool') continue

    let data: Record<string, unknown>
    try {
      data = JSON.parse(String(m.content))
    } catch {
      continue
    }
    const options = Array.isArray(data.options) ? (data.options as unknown[]) : []

    if (typeof data.place_id === 'string') {
      for (const item of options) {
        if (typeof item !== 'object' || item === null) continue
        const hotel = item as HotelOption
        if (!hotel.id || seenHotels.has(hotel.id)) continue
        seenHotels.add(hotel.id)
        hotels.push(hotel)
      }
    } else if (typeof data.from_place_id === 'string' && typeof data.to_place_id === 'string') {
      const key = `${data.from_place_id}->${data.to_place_id}`
      const legOptions = (options as TransportLeg[])
        .filter((l) => l.from_place_id === data.from_place_id && l.to_place_id === data.to_place_id)
        .sort((a, b) => (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY))

      // Все варианты перегона — для выбора пользователем в UI
      for (const opt of legOptions) {
        if (!opt.id || seenOptions.has(opt.id)) continue
        seenOptions.add(opt.id)
        transport_options.push(opt)
      }

      // Выбранный по умолчанию — самый дешёвый
      const best = legOptions[0]
      if (best && !seenLegs.has(key)) {
        seenLegs.add(key)
        transport.push(best)
      }
    }
  }

  return { transport, transport_options, hotels }
}

// ─── Запуск агента генерации ──────────────────────────────────────────

export interface RunGenerationAgentOptions {
  model?: BaseChatModel
  tools?: DynamicStructuredTool[]
  timeoutMs?: number
}

export async function runGenerationAgent(
  state: TripState,
  needs: string[],
  opts: RunGenerationAgentOptions = {},
): Promise<GenerationAgentResult> {
  const plan = planTransportRoute(state, needs)
  const tools = opts.tools ?? [createTransportTool(), createHotelsTool()]
  // Модель ВСЕГДА биндим с инструментами (даже если передана в opts — иначе агент
  // не увидит тулзы и вернёт пустоту).
  const model = (opts.model ?? getChatModel()).bindTools(tools)

  const graph = buildGenerationGraph(model, tools)

  // Таймаут: если LLM/MCP подвисают, не держим генерацию бесконечно —
  // buildGeneratedState подхватит ошибку и уйдёт в детерминированный фолбэк.
  const timeoutMs = opts.timeoutMs ?? 25_000
  const result = await Promise.race([
    graph.invoke(
      {
        messages: [new SystemMessage(buildGenerationSystemPrompt(state, needs, plan))],
      },
      { recursionLimit: 8 },
    ),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`агент-генерация не уложилась в ${timeoutMs} мс`)), timeoutMs),
    ),
  ])

  return assembleFromToolMessages(result.messages)
}
