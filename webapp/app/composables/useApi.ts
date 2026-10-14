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
      if (response.status === 401) {
        clearSession()
        void navigateTo('/login')
      }
    }
  }
}
