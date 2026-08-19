import { jsonrepair } from 'jsonrepair'

// Типовая ошибка DeepSeek в структурированном выводе:
//   "question": Отлично, Таиланд — это уже жара! ...  (значение без кавычек)
// Здесь: вытащить JSON-объект и починить такие значения.

export function extractJsonObject(text: string): string {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('JSON-объект не найден в ответе модели')
  }
  return text.slice(start, end + 1)
}

const BARE_VALUE_KEYS = ['id', 'name', 'country', 'question', 'summary', 'start', 'end', 'text']

// Оборачивает в кавычки незакавыченное строковое значение поля key.
// Не трогает значения, начинающиеся с ", {, [, цифры, t/f/n, минуса (это валидный JSON).
function quoteBareValue(input: string, key: string): string {
  const re = new RegExp(
    `("${key}"\\s*:\\s*)(?![["{\\[\\dtn-])(.+?)(?=\\s*,\\s*"|\\s*[}\\]])`,
    'g',
  )
  return input.replace(re, (_m, pre: string, val: string) => {
    const clean = val
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/\\"/g, '"')
      .replace(/"/g, '\\"')
    return `${pre}"${clean}"`
  })
}

export function parseLooseJson<T = unknown>(text: string): T {
  const raw = extractJsonObject(text)

  try {
    return JSON.parse(raw) as T
  } catch {
    // 1) чиним незакавыченные строковые значения
    let repaired = raw
    for (const key of BARE_VALUE_KEYS) {
      repaired = quoteBareValue(repaired, key)
    }
    try {
      return JSON.parse(repaired) as T
    } catch {
      // 2) финальная попытка — jsonrepair (unquoted keys, trailing commas и т.п.)
      try {
        return JSON.parse(jsonrepair(raw)) as T
      } catch (e) {
        throw new Error(`Не удалось разобрать JSON из ответа модели: ${(e as Error).message}`, {
          cause: e,
        })
      }
    }
  }
}