import { getSupabase } from '../utils/supabase'

export default defineEventHandler(async () => {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('test_table')
    .select('*')

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message
    })
  }

  return data
})