import { ChatDeepSeek } from '@langchain/deepseek'

export function getChatModel() {
  const config = useRuntimeConfig()

  return new ChatDeepSeek({
    apiKey: config.deepseekApiKey || undefined,
    model: 'deepseek-chat',
    temperature: 0,
  })
}