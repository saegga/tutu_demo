import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

export default defineEventHandler(async () => {
  const config = useRuntimeConfig()

  const client = new Client({
    name: 'travel-ai',
    version: '1.0.0',
  })

  const transport = new StreamableHTTPClientTransport(
    new URL(config.mcpUrl)
  )

  try {
    await client.connect(transport)

    const result = await client.listTools()

    return {
      success: true,
      tools: result.tools,
    }
  } finally {
    await transport.close()
  }
})