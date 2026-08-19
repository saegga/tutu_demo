import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

export async function getMcpClient() {
  const config = useRuntimeConfig()

  const client = new Client({
    name: 'travel-ai',
    version: '1.0.0',
  })

  const transport = new StreamableHTTPClientTransport(
    new URL(config.mcpUrl)
  )

  await client.connect(transport)

  return { client, transport }
}