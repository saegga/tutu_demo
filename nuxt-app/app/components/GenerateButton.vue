<template>
  <button
    class="w-full rounded-lg px-4 py-2.5 font-medium transition disabled:cursor-not-allowed"
    :class="enabled
      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
      : 'bg-slate-200 text-slate-400'"
    :disabled="!enabled"
    @click="$emit('generate')"
  >
    <span v-if="busy" class="inline-flex items-center gap-2">
      <span class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
      Генерирую маршрут…
    </span>
    <span v-else>Сгенерировать маршрут</span>
  </button>
  <p v-if="!enabled" class="mt-1 text-center text-[11px] text-slate-400">
    Заполни: откуда, куда и кто едет
  </p>
</template>

<script setup lang="ts">
const props = defineProps<{ ready: boolean; busy: boolean }>()
defineEmits<{ generate: [] }>()

const enabled = computed(() => props.ready && !props.busy)
</script>