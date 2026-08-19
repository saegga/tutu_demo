import { runAgent } from '../agents/demo-agent'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const answer = await runAgent(body.message)

  return {
    answer,
  }
})