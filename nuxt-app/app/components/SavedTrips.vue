<template>
  <div class="flex h-full flex-col">
    <div class="flex items-center justify-between border-b px-4 py-3">
      <div>
        <p class="text-sm font-semibold">Мои маршруты</p>
        <p class="text-[11px] text-slate-400">Сохранённые поездки</p>
      </div>
      <button
        type="button"
        class="cursor-pointer rounded-lg px-2.5 py-1 text-xs text-slate-600 transition hover:bg-slate-50"
        @click="$emit('close')"
      >
        ×
      </button>
    </div>

    <div v-if="loading" class="flex flex-1 items-center justify-center text-sm text-slate-400">
      Загружаю…
    </div>

    <div v-else-if="trips.length === 0" class="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center text-sm text-slate-400">
      <p>Пока нет сохранённых маршрутов</p>
      <p class="text-xs">Собери поездку и нажми «Сохранить»</p>
    </div>

    <div v-else class="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
      <div
        v-for="trip in trips"
        :key="trip.id"
        class="flex cursor-pointer flex-col gap-1 rounded-xl border p-3 transition hover:border-blue-300 hover:bg-blue-50/50"
        @click="$emit('open', trip.id)"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="min-w-0 truncate text-sm font-medium text-slate-700">{{ trip.title ?? 'Маршрут' }}</span>
          <button
            type="button"
            class="flex shrink-0 cursor-pointer items-center rounded-lg px-1.5 py-0.5 text-xs text-slate-400 transition hover:bg-red-50 hover:text-red-600"
            title="Удалить маршрут"
            @click.stop="$emit('delete', trip.id)"
          >
            ✕
          </button>
        </div>
        <span class="text-[11px] text-slate-400">{{ fmtDate(trip.updated_at) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ trips: { id: string; title: string | null; updated_at: string }[]; loading: boolean }>()
defineEmits<{ close: []; open: [id: string]; delete: [id: string] }>()

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
</script>
