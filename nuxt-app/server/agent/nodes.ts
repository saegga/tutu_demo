import { mergeDraftUpdate, type TripDraft } from '~shared'

import type { DraftPatchSchema } from './schema'

type DraftPatch = typeof DraftPatchSchema._output

// Приводит draft_patch из LLM к Partial<TripDraft> и сливает в текущий draft.
// null в поле = «не упомянуто в этом сообщении» → не трогаем текущее значение.
export function mergeDraft(draft: TripDraft, patch: DraftPatch): TripDraft {
  const update: Partial<TripDraft> = {}

  if (patch.origin) update.origin = patch.origin
  if (patch.destinations && patch.destinations.length > 0) update.destinations = patch.destinations
  if (hasDates(patch.dates)) update.dates = patch.dates
  if (patch.travelers) update.travelers = patch.travelers
  if (patch.needs && patch.needs.length > 0) update.needs = patch.needs

  return mergeDraftUpdate(draft, update)
}

function hasDates(dates: DraftPatch['dates']): dates is NonNullable<DraftPatch['dates']> {
  return !!dates && (!!dates.start || !!dates.end || !!dates.duration_days)
}