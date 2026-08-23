<template>
  <div class="flex h-screen w-screen overflow-hidden bg-white">
    <!-- LEFT: AI CHAT -->
    <aside class="flex w-[33%] shrink-0 flex-col border-r">
      <ChatAgent class="flex-1 min-h-0" />
    </aside>

    <!-- RIGHT: MAP / ROUTE -->
    <main class="relative flex-1 min-w-0">
      <ClientOnly>
        <RouteOverlay
          :state="tripState"
          :issues="issues"
          :draft="draft"
          :on-select-transport="selectTransport"
          :on-select-hotel="selectHotel"
          :on-change-nights="changeHotelNights"
          :on-save-route="saveTrip"
          :saved="saved"
          :on-list-trips="listSavedTrips"
          :on-load-trip="loadTrip"
          :on-delete-trip="deleteTrip"
        />
      </ClientOnly>
    </main>
  </div>
</template>

<script setup lang="ts">
import { useAgent } from '../composables/useAgent'

const {
  tripState,
  issues,
  draft,
  selectTransport,
  selectHotel,
  changeHotelNights,
  saveTrip,
  saved,
  listSavedTrips,
  loadTrip,
  deleteTrip,
} = useAgent()
</script>