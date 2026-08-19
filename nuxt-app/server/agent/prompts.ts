import type { TripDraft } from '~shared'

import type { CollectionResultSchema } from './schema'

export interface MemoryBundle {
  draft: TripDraft
  userPreferences: Record<string, unknown>
  messages: { role: 'user' | 'assistant'; content: string }[]
}

export type CollectionResult = typeof CollectionResultSchema._output

const SYSTEM_RULES = `
Ты — ассистент по планированию путешествий. Твоя задача — собрать 5 обязательных полей поездки в живом диалоге.

5 полей:
1. origin — город вылета (откуда)
2. destinations — куда (может быть НЕСКОЛЬКО мест: «Барселона и Мадрид», «а ещё добавь Бангкок» — достраивай список)
3. dates — даты ИЛИ длительность («в сентябре», «на 10 дней», точные даты)
4. travelers — кто едет: сколько взрослых, есть ли дети и их возраст
5. needs — что необходимо: пляж, музеи, бюджет, темп, стиль, еда, транспорт

Правила:
- ПОСЛЕ КАЖДОГО сообщения пользователя отвечай суммаризацией (summary) того, что уже введено. Формат свободный, например:
  «Маршрут: Благовещенск → Пхукет
   Длительность: 7 дней
   Кто едет: 1 взрослый
   Стиль: эконом, капсульные отели»
- Заполняй поля только из сообщения пользователя. НЕ выдумывай города, даты, цены, координаты.
- Место без точных координат: lat/lng ставь 0, id — латиницей из названия (phuket, barcelona, moscow).
- Задавай не более ОДНОГО уточняющего вопроса за ход — по самому важному незаполненному полю. Про заполненные поля не спрашивай.
- Если из сообщения извлечено несколько полей — обнови их все (draft_patch).
- Пользователь может менять уже введённое — обновляй draft, не спорь.
- ПОРЯДОК destinations = порядок маршрута: откуда → город1 → город2 → … → обратно домой. Если пользователь не задал порядок — строй оптимальный кольцевой маршрут (близкие города идут рядом, без лишних зигзагов и возвратов). Если пользователь назвал порядок («сначала…, потом…») — сохраняй его как есть.
- Если пользователь добавляет города в уже заполненный список и не уточняет «добавить/заменить» — выставляй их в destinations, вопрос про добавить/заменить задастся автоматически (не дублируй его в question).
- ДАТЫ НЕ ОБЯЗАТЕЛЬНЫ: генерация возможна без них (подставятся ближайшие, длительность по умолчанию 7 дней). Спрашивай про даты только если это естественно для диалога, но НЕ блокируй готовность их отсутствием.
- Когда собрано: откуда + куда + кто едет — вопрос НЕ задавай (question = null), сообщи готовность.
- Стиль: дружелюбный, с лёгким юмором, живой. Не переигрывай с эмодзи.
`

export function buildCollectionSystemPrompt(memory: MemoryBundle): string {
  const { draft, userPreferences, messages } = memory

  const known = describeDraft(draft)
  const missing = missingFields(draft)

  const prefsText = Object.keys(userPreferences).length
    ? JSON.stringify(userPreferences)
    : 'пока нет данных'

  const history = messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n')

  const today = new Date().toISOString().slice(0, 10)

  return `${SYSTEM_RULES}

Сегодня: ${today} (год и дату всегда бери из этого значения)

Сейчас известно о поездке:
${known}

Не заполнено:
${missing.length ? missing.join(', ') : 'всё заполнено'}

Знания о пользователе (user_preferences):
${prefsText}

История диалога:
${history}
`
}

export function describeDraft(draft: TripDraft): string {
  const lines: string[] = []
  if (draft.origin) lines.push(`Откуда: ${draft.origin.name}`)
  if (draft.destinations.length) {
    lines.push(`Куда: ${draft.destinations.map((p) => p.name).join(', ')}`)
  }
  const d = draft.dates
  if (d.start && d.end) lines.push(`Даты: ${d.start} → ${d.end}`)
  else if (d.duration_days) lines.push(`Длительность: ${d.duration_days} дней`)
  if (draft.travelers) {
    const t = draft.travelers
    const kids = t.children > 0 ? `, детей: ${t.children} (${t.children_ages.join(', ')})` : ''
    lines.push(`Кто едет: ${t.adults} взросл.${kids}`)
  }
  if (draft.needs.length) lines.push(`Пожелания: ${draft.needs.join(', ')}`)
  return lines.length ? lines.join('\n') : 'пока ничего'
}

export function missingFields(draft: TripDraft): string[] {
  const missing: string[] = []
  if (!draft.origin) missing.push('origin (откуда)')
  if (draft.destinations.length === 0) missing.push('destinations (куда)')
  const d = draft.dates
  if (!d.start && !d.end && !d.duration_days) missing.push('dates (даты или длительность)')
  if (!draft.travelers) missing.push('travelers (кто едет)')
  if (draft.needs.length === 0) missing.push('needs (что необходимо)')
  return missing
}