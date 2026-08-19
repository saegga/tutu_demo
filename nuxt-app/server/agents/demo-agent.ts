import { ChatDeepSeek } from '@langchain/deepseek'
import {
  StateGraph,
  MessagesAnnotation,
  START,
  END
} from '@langchain/langgraph'

const model = new ChatDeepSeek({
  model: 'deepseek-chat',
  temperature: 0
})

async function callModel(
  state: typeof MessagesAnnotation.State
) {
  const response = await model.invoke(state.messages)

  return {
    messages: [response]
  }
}

const graph = new StateGraph(MessagesAnnotation)
  .addNode('agent', callModel)
  .addEdge(START, 'agent')
  .addEdge('agent', END)
  .compile()

export async function runAgent(message: string) {
  const result = await graph.invoke({
    messages: [
      {
        role: 'user',
        content: message
      }
    ]
  })

  const lastMessage =
    result.messages[result.messages.length - 1]

  return lastMessage.content
}