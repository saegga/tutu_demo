import { getMcpClient } from '../utils/mcp'

export default defineEventHandler(async () => {
  const { client, transport } = await getMcpClient()

  try {
    const result = await client.callTool({
      name: 'search_hotels',
      arguments: {
        city_name: 'Москва',
        check_in: '2026-08-20',
        check_out: '2026-08-22',
        adults: 1,
        page: 1,
        page_size: 10,
      },
    })
    console.log(result)
    return result
  } finally {
    await transport.close()
  }
})