<template>
  <div class="flex h-full flex-col">
    <!-- Header -->
    <header class="flex items-center justify-between border-b px-4 py-3">
      <div>
        <p class="text-sm font-semibold">Путешествия с ИИ</p>
        <p class="text-[11px] text-slate-400">Расскажи, куда хочешь поехать</p>
      </div>
      <button
        class="rounded-lg border px-2.5 py-1 text-xs text-slate-600 transition hover:bg-slate-50"
        @click="reset"
      >
        Новая поездка
      </button>
    </header>

    <!-- Draft status -->
    <div class="border-b px-4 py-3" style="display:none">
      <p class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        Маршрут
      </p>
      <DraftStatus :draft="draft" />
    </div>

    <!-- Messages -->
    <div ref="scroller" class="flex-1 min-h-0 overflow-y-auto px-4 py-3">
      <div
        v-for="msg in messages"
        :key="msg.id"
        class="mb-2 flex"
        :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
      >
        <div
          class="max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm"
          :class="msg.role === 'user'
            ? 'rounded-br-sm bg-blue-600 text-white'
            : 'rounded-bl-sm bg-slate-100 text-slate-800'"
        >
          {{ msg.content }}
        </div>
      </div>

      <div v-if="busy" class="mb-2 flex justify-start">
        <div class="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2">
          <span class="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
          <span class="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style="animation-delay: 120ms" />
          <span class="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style="animation-delay: 240ms" />
        </div>
      </div>
    </div>

    <!-- Error -->
    <p v-if="error" class="px-4 pb-1 text-xs text-red-600">{{ error }}</p>

    <!-- Input + generate -->
    <div class="border-t px-4 py-3">
      <GenerateButton :ready="readyToGenerate" :busy="busy" @generate="generate" />

      <QuickSuggestions class="mt-2" />

      <div class="mt-2 flex gap-2">
        <input
          v-model="message"
          class="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-400"
          placeholder="Опиши поездку…"
          :disabled="busy"
          @keyup.enter="submit"
        >
        <button
          class="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          :disabled="busy || !message.trim()"
          @click="submit"
        >
          Отправить
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAgent } from '../../composables/useAgent'

const {
  draft,
  messages,
  busy,
  error,
  readyToGenerate,
  init,
  send,
  generate,
  reset,
} = useAgent()

const message = ref('')
const scroller = ref<HTMLElement | null>(null)

onMounted(async () => {
  await init()
})

function submit() {
  if (!message.value.trim()) return
  send(message.value)
  message.value = ''
}

watch(
  () => messages.value.length,
  async () => {
    await nextTick()
    if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
  },
)
</script>