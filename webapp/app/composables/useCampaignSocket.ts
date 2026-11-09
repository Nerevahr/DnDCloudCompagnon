// Messages poussés par l'API temps réel (voir realtime-api) : ils ne portent aucune donnée de jeu, le client relit l'API REST
export type RealtimeMessage =
  // Joueurs actuellement connectés à la partie (UserId)
  | { type: 'presence', Present: string[] }
  // Un combat a changé (lancé, initiative reçue, ordre modifié, terminé...)
  | { type: 'combat' }

const PING_MS = 4 * 60_000
const MAX_RETRY_MS = 30_000

// Se connecte à la partie en cours d'une campagne (WebSocket) tant que le composant est monté : l'utilisateur devient
// « présent » et reçoit les notifications. `connected` vaut true tant que la connexion est ouverte ; sans API WebSocket
// configurée (dev local) ou en cas de coupure, il reste false et la page doit interroger l'API REST à intervalle
// régulier. `onMessage` est aussi appelé à chaque reconnexion (pas à la première ouverture) avec un message « combat »
// pour resynchroniser la page sur ce qui a pu être manqué.
export function useCampaignSocket(campaignId: string, onMessage: (message: RealtimeMessage) => void) {
  const wsBase = useRuntimeConfig().public.wsBase
  const { getAccessToken } = useAuth()

  const connected = ref(false)
  const present = ref<string[]>([])

  let socket: WebSocket | undefined
  let pingTimer: ReturnType<typeof setInterval> | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let retryDelay = 1000
  let stopped = false
  let hasConnected = false

  async function open() {
    // Le jeton est relu à chaque tentative : il a pu être rafraîchi depuis la coupure
    const token = await getAccessToken()
    if (stopped || !token) return

    const ws = new WebSocket(`${wsBase}?campaignId=${encodeURIComponent(campaignId)}&token=${encodeURIComponent(token)}`)
    socket = ws

    ws.onopen = () => {
      connected.value = true
      retryDelay = 1000
      ws.send(JSON.stringify({ action: 'presence' }))
      // Une connexion API Gateway se ferme après 10 minutes sans message
      pingTimer = setInterval(() => ws.send(JSON.stringify({ action: 'ping' })), PING_MS)
      // Reconnexion : on a pu manquer des notifications. À la première ouverture, la page vient de charger ses données.
      if (hasConnected) onMessage({ type: 'combat' })
      hasConnected = true
    }
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as RealtimeMessage
        if (message.type === 'presence') present.value = message.Present
        onMessage(message)
      } catch { /* message illisible : ignoré */ }
    }
    ws.onclose = () => {
      connected.value = false
      clearInterval(pingTimer)
      if (stopped) return
      retryTimer = setTimeout(open, retryDelay)
      retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS)
    }
  }

  onMounted(() => {
    if (wsBase) void open()
  })
  onBeforeUnmount(() => {
    stopped = true
    clearTimeout(retryTimer)
    clearInterval(pingTimer)
    socket?.close()
  })

  return { connected, present }
}
