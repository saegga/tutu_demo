import { ref, computed } from 'vue'
import { emptyDraft, hasDuration, isDraftReadyToGenerate, isDraftComplete, type TripDraft } from '~shared'

export function useDraft() {
  const draft = ref<TripDraft>(emptyDraft())

  const durationKnown = computed(() => hasDuration(draft.value))
  const readyToGenerate = computed(() => isDraftReadyToGenerate(draft.value))
  const complete = computed(() => isDraftComplete(draft.value))

  function setDraft(next: TripDraft) {
    draft.value = next
  }

  function patchDraft(patch: Partial<TripDraft>) {
    draft.value = { ...draft.value, ...patch }
  }

  return {
    draft,
    durationKnown,
    readyToGenerate,
    complete,
    setDraft,
    patchDraft,
  }
}