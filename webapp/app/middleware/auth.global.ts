// Toutes les pages exigent une session, sauf la connexion et le retour de Cognito
const publicRoutes = ['/login', '/auth/callback']
const RETURN_TO_KEY = 'dnd-return-to'

export default defineNuxtRouteMiddleware((to) => {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated.value && !publicRoutes.includes(to.path)) {
    // Mémorise la page demandée (ex: un lien d'invitation) pour y revenir après la connexion
    try { sessionStorage.setItem(RETURN_TO_KEY, to.fullPath) } catch { /* sessionStorage indisponible */ }
    return navigateTo('/login')
  }
  if (isAuthenticated.value && to.path === '/login') return navigateTo('/')
})
