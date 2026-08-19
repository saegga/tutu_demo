import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('sqlite-store', () => {
  let dbPath: string
  let store: typeof import('./sqlite-store')

  beforeAll(async () => {
    dbPath = join(mkdtempSync(join(tmpdir(), 'hakututu-')), 'test.db')
    process.env.NUXT_SQLITE_PATH = dbPath
    store = await import('./sqlite-store')
  })

  afterAll(() => {
    delete process.env.NUXT_SQLITE_PATH
  })

  it('создаёт и читает поездку', async () => {
    const trip = await store.createTrip({ title: 'Тест', userId: 'u1' })
    expect(trip.id).toBeTruthy()
    expect(trip.phase).toBe('collecting')

    const got = await store.getTrip(trip.id)
    expect(got?.title).toBe('Тест')
    expect(got?.user_id).toBe('u1')
  })

  it('обновляет draft и state', async () => {
    const trip = await store.createTrip({ userId: 'u1' })
    const updated = await store.updateTrip(trip.id, {
      draft: {
        origin: null,
        destinations: [],
        dates: { start: null, end: null, duration_days: 7 },
        travelers: null,
        needs: ['пляж'],
      },
      phase: 'generated',
    })

    expect(updated?.phase).toBe('generated')
    expect(updated?.draft?.dates.duration_days).toBe(7)
    expect(updated?.draft?.needs).toEqual(['пляж'])
  })

  it('хранит сообщения в порядке', async () => {
    const trip = await store.createTrip({ userId: 'u1' })
    await store.addMessage(trip.id, { role: 'user', content: 'привет' })
    await store.addMessage(trip.id, { role: 'assistant', content: 'здравствуй' })

    const list = await store.listMessages(trip.id)
    expect(list).toHaveLength(2)
    expect(list[0].content).toBe('привет')
    expect(list[1].role).toBe('assistant')
  })

  it('добавляет события и предпочтения', async () => {
    const trip = await store.createTrip({ userId: 'u1' })
    await store.addEvent(trip.id, { type: 'status', state: 'collecting', message: 'ok' })
    const events = await store.listEvents(trip.id)
    expect(events).toHaveLength(1)
    expect(events[0].event.type).toBe('status')

    await store.getUserPreferences('u1')
  })

  it('разделяет данные между поездками', async () => {
    const a = await store.createTrip({ userId: 'u1' })
    const b = await store.createTrip({ userId: 'u2' })
    await store.addMessage(a.id, { role: 'user', content: 'только у A' })

    expect(await store.listMessages(a.id)).toHaveLength(1)
    expect(await store.listMessages(b.id)).toHaveLength(0)
  })
})