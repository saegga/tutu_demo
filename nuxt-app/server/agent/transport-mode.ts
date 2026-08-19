import type { Place, TransportMode } from '~shared'

// Определение вида транспорта из пожеланий пользователя.
// Поддерживает и глобальный режим («везде поездом»), и привязку к конкретному
// перегону: «до Владивостока на ж/д», «обратно на самолёте».

export function parseTransportMode(text: string): TransportMode | null {
  if (/(поезд|ж\/?д|железнодор|на поезде|плацкарт|купе|сидячий|электрич|поездом)/.test(text)) return 'train'
  if (/(автобус|на автобусе|рейсовый автобус)/.test(text)) return 'bus'
  if (/(самолёт|самолет|авиа|на самолёте|полететь|перелететь|рейсом)/.test(text)) return 'flight'
  return null
}

// Какой транспорт на перегоне fromId → toId.
// - «до Владивостока на ж/д» → режим для перегонов, заканчивающихся во Владивостоке;
// - «обратно на самолёте» → режим для перегона домой (в origin);
// - «везде поездом» (без города и без «обратно») → общий режим на всё;
// - ничего конкретного → null (уйдёт в дефолт = авиа).
export function legTransportMode(
  fromId: string,
  toId: string,
  needs: string[],
  places: Place[],
): TransportMode | null {
  const origin = places[0]
  const returnToOrigin = Boolean(origin && toId === origin.id)

  let general: TransportMode | null = null

  for (const need of needs) {
    const mode = parseTransportMode(need)
    if (!mode) continue

    const lower = need.toLowerCase()
    const mentions = places.find((p) => {
      const n = p.name.toLowerCase()
      return lower.includes(n) || (p.searchName ? lower.includes(p.searchName.toLowerCase()) : false)
    })
    const isReturn = /обратно|назад|домой|на родину|в россию/.test(lower)

    if (mentions?.id === toId) return mode
    if (returnToOrigin && (isReturn || mentions?.id === origin.id)) return mode
    if (!mentions && !isReturn && !general) general = mode
  }

  return general
}