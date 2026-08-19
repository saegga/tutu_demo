import { callMcpTool } from './client'

// Создание checkout-ссылки. checkout_ref передаётся ДОСЛОВНО из ответа
// search_* (включая passengers_* / return_departure_at для round-trip).
export async function createCheckoutLink(
  checkoutRef: Record<string, unknown>,
): Promise<{ url: string; search_url?: string }> {
  const result = await callMcpTool('create_checkout_link', {
    checkout_ref: checkoutRef,
  })

  return {
    url: String(result.url ?? ''),
    search_url: result.search_url != null ? String(result.search_url) : undefined,
  }
}