// Authentification Cognito (Hosted UI, flow "code" + PKCE). Les jetons sont gardés en localStorage.
interface Tokens {
  accessToken: string
  idToken: string
  refreshToken: string
  // Timestamp (ms) d'expiration du jeton d'accès
  expiresAt: number
}

const STORAGE_KEY = 'dnd-auth'
const VERIFIER_KEY = 'dnd-auth-verifier'
const STATE_KEY = 'dnd-auth-state'
// Marge avant expiration à partir de laquelle on rafraîchit le jeton
const REFRESH_MARGIN_MS = 60_000

const base64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const randomString = () => base64Url(crypto.getRandomValues(new Uint8Array(32)))

function readTokens(): Tokens | null {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
  } catch {
    return null
  }
}

export function useAuth() {
  const config = useRuntimeConfig().public
  const tokens = useState<Tokens | null>('auth-tokens', () => (import.meta.client ? readTokens() : null))
  const isAuthenticated = computed(() => !!tokens.value)

  const redirectUri = () => `${location.origin}/auth/callback`

  function saveTokens(value: Tokens | null) {
    tokens.value = value
    try {
      if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
      else localStorage.removeItem(STORAGE_KEY)
    } catch { /* stockage indisponible : la session ne survivra pas au rechargement */ }
  }

  async function requestTokens(params: Record<string, string>, previous?: Tokens): Promise<Tokens> {
    const res = await fetch(`${config.cognitoDomain}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.cognitoClientId, ...params })
    })
    if (!res.ok) throw new Error(`Cognito token endpoint: ${res.status}`)
    const body = await res.json()
    return {
      accessToken: body.access_token,
      idToken: body.id_token,
      // Le refresh_token n'est pas renvoyé lors d'un rafraîchissement
      refreshToken: body.refresh_token ?? previous?.refreshToken,
      expiresAt: Date.now() + body.expires_in * 1000
    }
  }

  // Redirige vers la page de connexion Cognito
  async function login() {
    const verifier = randomString()
    const state = randomString()
    sessionStorage.setItem(VERIFIER_KEY, verifier)
    sessionStorage.setItem(STATE_KEY, state)
    const challenge = base64Url(new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
    ))
    const query = new URLSearchParams({
      client_id: config.cognitoClientId,
      response_type: 'code',
      scope: 'openid email profile',
      redirect_uri: redirectUri(),
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state
    })
    location.assign(`${config.cognitoDomain}/login?${query}`)
  }

  // Échange le code reçu sur /auth/callback contre des jetons
  async function handleCallback(code: string, state: string) {
    const verifier = sessionStorage.getItem(VERIFIER_KEY)
    const expectedState = sessionStorage.getItem(STATE_KEY)
    sessionStorage.removeItem(VERIFIER_KEY)
    sessionStorage.removeItem(STATE_KEY)
    if (!verifier || !expectedState || state !== expectedState) throw new Error('Réponse de connexion invalide')
    saveTokens(await requestTokens({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri()
    }))
  }

  async function logout() {
    saveTokens(null)
    try {
      // Les réponses de l'API mises en cache par le service worker ne doivent pas survivre à la session
      await caches.delete('api-v1')
    } catch { /* Cache API indisponible */ }
    const query = new URLSearchParams({ client_id: config.cognitoClientId, logout_uri: `${location.origin}/login` })
    location.assign(`${config.cognitoDomain}/logout?${query}`)
  }

  // Jeton d'accès valide (rafraîchi si besoin), ou null si la session a expiré
  async function getAccessToken(): Promise<string | null> {
    const current = tokens.value
    if (!current) return null
    if (current.expiresAt - REFRESH_MARGIN_MS > Date.now()) return current.accessToken
    try {
      const refreshed = await requestTokens({ grant_type: 'refresh_token', refresh_token: current.refreshToken }, current)
      saveTokens(refreshed)
      return refreshed.accessToken
    } catch {
      saveTokens(null)
      return null
    }
  }

  return { isAuthenticated, login, logout, handleCallback, getAccessToken, clearSession: () => saveTokens(null) }
}
