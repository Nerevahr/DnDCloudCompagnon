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
      <UButton to="/campagnes">
        Mes campagnes
      </UButton>
    </div>
    <div
      v-else
      class="flex items-center gap-3 text-muted"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-6 animate-spin"
      />
      Ouverture de la campagne...
    </div>
  </div>
</template>

<script setup lang="ts">
// Lien d'invitation partagé par le MJ : rejoint la campagne (sans effet si on en est déjà membre) puis
// ouvre sa page, où le joueur choisit son personnage à sa première visite.
const code = String(useRoute().params.code)
const api = useCampaignsApi()
const error = ref('')

onMounted(async () => {
  try {
    const campaign = await api.join(code)
    await clearNuxtData('campaigns')
    await navigateTo(`/campagnes/${campaign.id}`, { replace: true })
  } catch (e) {
    error.value = (e as { statusCode?: number }).statusCode === 404
      ? 'Ce lien d\'invitation est invalide ou a expiré. Demandez-en un nouveau à votre MJ.'
      : 'Impossible de rejoindre la campagne, réessayez.'
  }
})

useHead({ title: 'Rejoindre une campagne' })
</script>
