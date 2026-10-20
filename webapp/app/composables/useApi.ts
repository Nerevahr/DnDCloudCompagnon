const LAST_401_KEY = 'dnd-last-401'
// Un second 401 dans ce délai est considéré comme une boucle de reconnexion
const RELOGIN_LOOP_MS = 60_000

// Options à passer à useFetch/useLazyFetch pour joindre le jeton Cognito aux appels de l'API.
// Si l'API refuse le jeton (401), la session est vidée : le middleware renvoie alors vers /login.
export function useApiFetchOptions() {
  const { getAccessToken, clearSession } = useAuth()

  return {
    async onRequest({ options }: { options: { headers?: HeadersInit } }) {
      const token = await getAccessToken()
      if (token) {
        const headers = new Headers(options.headers)
        headers.set('Authorization', `Bearer ${token}`)
        options.headers = headers
      }
    },
    onResponseError({ response }: { response: { status: number } }) {
      if (response.status !== 401) return
      // Garde-fou : si l'API refuse encore le jeton juste après une reconnexion, la cause n'est pas une
      // session expirée (API mal configurée...). Se reconnecter en boucle ne servirait à rien : on laisse
      // l'erreur s'afficher dans la page.
      try {
        const last = Number(sessionStorage.getItem(LAST_401_KEY) ?? 0)
        sessionStorage.setItem(LAST_401_KEY, String(Date.now()))
        if (Date.now() - last < RELOGIN_LOOP_MS) return
      } catch { /* sessionStorage indisponible */ }
      clearSession()
      void navigateTo('/login')
    }
  }
}
