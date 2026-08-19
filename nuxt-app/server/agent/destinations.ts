import type { Place } from '~shared'

// Логика «добавить новые города или заменить» при уже заполненном списке
// пунктов назначения. Если намерение пользователя неоднозначно — спрашиваем.

export type DestinationIntent = 'add' | 'replace' | 'ask'

const ADD_RE = /(добав|ещё\b|а ещё|и ещё|также|дополнительно|\bплюс\b|включ|заодно)/i
const REPLACE_RE = /(вместо|замени|заменя|убери|убрать|пересобери|заново|по-другому|иначе|не надо)/i

export function detectDestinationIntent(
  current: Place[],
  incoming: Place[],
  userMessage: string,
): DestinationIntent {
  if (current.length === 0 || incoming.length === 0) return 'replace'

  const existing = new Set(current.map((p) => p.name.trim().toLowerCase()))
  const hasNew = incoming.some((p) => !existing.has(p.name.trim().toLowerCase()))
  if (!hasNew) return 'replace'

  if (REPLACE_RE.test(userMessage)) return 'replace'
  if (ADD_RE.test(userMessage)) return 'add'
  return 'ask'
}

// При intent 'add' дописываем новые города в конец (порядок старых сохраняется,
// дубликаты не создаём). При 'replace' берём только новые.
export function mergeDestinations(
  current: Place[],
  incoming: Place[],
  intent: DestinationIntent,
): Place[] {
  if (intent === 'replace') return incoming

  const out = [...current]
  for (const p of incoming) {
    const key = p.name.trim().toLowerCase()
    if (!out.some((x) => x.name.trim().toLowerCase() === key)) {
      out.push(p)
    }
  }
  return out
}

// Разбор ответа пользователя на вопрос «добавить/заменить».
// pendingPlaces — города из вопроса; их упоминание в ответе тоже считаем «добавить».
// Внимание: \b не работает с кириллицей → границы слов через (^|\s)...($|\s|[.,!?])
export function classifyAddReplaceAnswer(text: string, pendingPlaces: Place[]): DestinationIntent {
  const lower = text.toLowerCase()
  if (/(замени|вместо|убери|не надо|только|заново|по-другому|иначе|(^|\s)нет($|[\s.,!?]))/.test(lower)) {
    return 'replace'
  }
  if (/(сложн|добав|ещё|также|\bплюс\b|давай|верно|конечно|\bок\b|вс[ёе] верно|обязательно|ага|угу|(^|\s)да($|[\s.,!?]))/.test(lower)) {
    return 'add'
  }
  if (pendingPlaces.some((p) => lower.includes(p.name.trim().toLowerCase()))) return 'add'
  return 'ask'
}