<template>
  <div class="flex min-h-dvh items-center justify-center p-4 pt-[calc(var(--safe-top)+1rem)]">
    <UCard class="w-full max-w-sm">
      <div class="flex flex-col items-center gap-6 text-center">
        <div>
          <h1 class="text-2xl font-bold">
            DnD Cloud Compagnon
          </h1>
          <p class="mt-2 text-sm text-muted">
            Connectez-vous pour accéder au compendium.
          </p>
        </div>
        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          :description="error"
          class="w-full text-left"
        />
        <UButton
          block
          size="lg"
          icon="i-lucide-log-in"
          :loading="loading"
          @click="signIn"
        >
          Se connecter
        </UButton>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
const { login } = useAuth()
const loading = ref(false)
const error = ref('')

async function signIn() {
  loading.value = true
  try {
    await login()
  } catch {
    error.value = 'Impossible de contacter le service de connexion.'
    loading.value = false
  }
}
</script>
