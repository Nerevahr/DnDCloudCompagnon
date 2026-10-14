<template>
  <div class="flex min-h-dvh items-center justify-center p-4">
    <div
      v-if="error"
      class="flex max-w-sm flex-col items-center gap-4 text-center"
    >
      <UAlert
        color="error"
        variant="subtle"
        :description="error"
      />
      <UButton to="/login">
        Retour à la connexion
      </UButton>
    </div>
    <UIcon
      v-else
      name="i-lucide-loader-circle"
      class="size-8 animate-spin text-muted"
    />
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const { handleCallback } = useAuth()
const error = ref('')

onMounted(async () => {
  const { code, state, error_description: cognitoError } = route.query
  if (typeof code !== 'string' || typeof state !== 'string') {
    error.value = typeof cognitoError === 'string' ? cognitoError : 'Réponse de connexion invalide.'
    return
  }
  try {
    await handleCallback(code, state)
    await navigateTo('/', { replace: true })
  } catch {
    error.value = 'La connexion a échoué. Réessayez.'
  }
})
</script>
