import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const client = new Client({ name: 'diag', version: '1.0.0' })
const transport = new StreamableHTTPClientTransport(new URL(process.env.MCP_URL ?? 'https://mcp.tutu.ru/mcp'))
await client.connect(transport)

const start = new Date()
start.setDate(start.getDate() + 21)
const date = start.toISOString().slice(0, 10)

try {
  const res = await client.callTool({
    name: 'search_rail',
    arguments: { origin: 'Москва', destination: 'Благовещенск', departure_date: date, passengers: 1, page_size: 2, view: 'compact' },
  })
  const text = (res.content ?? []).find((c) => c.type === 'text')?.text ?? ''
  const j = JSON.parse(text)
  const offers = j.offers ?? []
  console.log('rail offers:', offers.length)
  const o = offers[0]
  if (o) {
    console.log('keys:', Object.keys(o).join(', '))
    console.log('head:', JSON.stringify(o).slice(0, 700))
  }
} catch (e) {
  console.log('ERROR:', e?.message ?? e)
}
await transport.close()