const INTERVAL_MS = 5000

// Relecture périodique de l'API quand le temps réel (WebSocket) n'est pas disponible : dev local ou coupure.
// En pause tant que `enabled` est faux ou que l'onglet est caché ; au retour sur l'onglet, une relecture immédiate
// rattrape ce qui a été manqué.
export function useFallbackPolling(refresh: () => unknown, enabled: () => boolean) {
  let timer: ReturnType<typeof setInterval> | undefined

  const tick = () => {
    if (enabled() && !document.hidden) void refresh()
  }
  const onVisible = () => {
    if (!document.hidden) tick()
  }

  onMounted(() => {
    timer = setInterval(tick, INTERVAL_MS)
    document.addEventListener('visibilitychange', onVisible)
  })
  onBeforeUnmount(() => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisible)
  })
}
