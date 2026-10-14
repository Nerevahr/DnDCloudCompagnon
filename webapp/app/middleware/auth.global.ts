// Toutes les pages exigent une session, sauf la connexion et le retour de Cognito
const publicRoutes = ['/login', '/auth/callback']

export default defineNuxtRouteMiddleware((to) => {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated.value && !publicRoutes.includes(to.path)) return navigateTo('/login')
  if (isAuthenticated.value && to.path === '/login') return navigateTo('/')
})
