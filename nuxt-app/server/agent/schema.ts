import { z } from 'zod'

export const PlaceSchema = z.object({
  id: z.string().describe('стабильный id: barcelona, phuket'),
  name: z.string(),
  country: z.string(),
  lat: z.number(),
  lng: z.number(),
})

export const TripDatesSchema = z.object({
  start: z.string().nullable().describe('ISO дата "2026-09-01" или null'),
  end: z.string().nullable(),
  duration_days: z.number().nullable().describe('количество ночей/дней, если точные даты неизвестны'),
})

export const TravelersSchema = z.object({
  adults: z.number().int().min(1),
  children: z.number().int().min(0),
  children_ages: z.array(z.number().int()),
})

export const DraftPatchSchema = z.object({
  origin: PlaceSchema.nullable().optional().describe('город вылета из этого сообщения или null, если не упомянут'),
  destinations: z.array(PlaceSchema).nullable().optional().describe('города/острова назначения из этого сообщения или null'),
  dates: TripDatesSchema.nullable().optional().describe('даты или длительность из этого сообщения или null'),
  travelers: TravelersSchema.nullable().optional().describe('кто едет из этого сообщения или null'),
  needs: z.array(z.string()).nullable().optional().describe('пожелания из этого сообщения или null'),
})

export const CollectionResultSchema = z.object({
  draft_patch: DraftPatchSchema.describe('извлечённые из сообщения поля draft (обновление)'),
  question: z.string().nullable().describe('один уточняющий вопрос по самому важному незаполненному полю, или null'),
  summary: z.string().describe('суммаризация поездки из того, что уже известно пользователю'),
})