import type { AgentStatus, TripDraft } from '~shared'

import { buildCollectionGraph } from './graph'
import { buildCollectionSystemPrompt } from './prompts'

export interface AgentMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface RunAgentInput {
  draft: TripDraft
  userPreferences: Record<string, unknown>
  messages: AgentMessage[]
}

export interface RunAgentOutput {
  draft: TripDraft
  reply: string
  status: AgentStatus
}

export async function runCollectionAgent(input: RunAgentInput): Promise<RunAgentOutput> {
  const graph = buildCollectionGraph()

  // Обрезаем историю, чтобы не раздувать контекст модели
  const history = input.messages.slice(-30)

  const result = await graph.invoke({
    systemPrompt: buildCollectionSystemPrompt({
      draft: input.draft,
      userPreferences: input.userPreferences,
      messages: history,
    }),
    messages: history.map((m) => ({ role: m.role, content: m.content })),
    draft: input.draft,
    userPreferences: input.userPreferences,
    collection: null,
    reply: '',
    status: 'understanding',
  })

  return {
    draft: result.draft,
    reply: result.reply,
    status: result.status,
  }
}