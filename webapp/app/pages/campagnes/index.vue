<template>
  <div class="mx-auto max-w-3xl p-4 pt-[calc(var(--safe-top)+1rem)] pb-[calc(var(--bottom-nav-height)+1rem)] md:p-8 lg:pt-8 lg:pb-8">
    <div class="mb-6 flex items-center justify-between gap-4">
      <h1 class="text-2xl font-bold">
        Campagnes
      </h1>
      <UButton
        icon="i-lucide-plus"
        @click="openCreate"
      >
        Nouvelle
      </UButton>
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      title="Impossible de charger les campagnes"
      :description="error.message"
    />
    <div
      v-else-if="status === 'pending'"
      class="flex items-center justify-center gap-3 rounded-lg border border-default py-16 text-muted"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-5 animate-spin"
      />
      Chargement...
    </div>
    <div
      v-else-if="!data?.campaigns.length"
      class="rounded-lg border border-dashed border-default py-16 text-center text-muted"
    >
      Aucune campagne pour l'instant. Créez-en une ou ouvrez un lien d'invitation.
    </div>
    <ul
      v-else
      class="space-y-3"
    >
      <li
        v-for="campaign in data.campaigns"
        :key="campaign.id"
      >
        <NuxtLink
          :to="`/campagnes/${campaign.id}`"
          class="flex items-center justify-between gap-4 rounded-lg border border-default p-4 transition-colors hover:bg-elevated"
        >
          <div class="min-w-0">
            <p class="truncate font-semibold">
              {{ campaign.Name }}
            </p>
            <p
              v-if="campaign.Description"
              class="truncate text-sm text-muted"
            >
              {{ campaign.Description }}
            </p>
          </div>
          <UBadge
            :color="campaign.Role === 'GM' ? 'primary' : 'neutral'"
            variant="subtle"
            class="shrink-0"
          >
            {{ campaign.Role === 'GM' ? 'MJ' : 'Joueur' }}
          </UBadge>
        </NuxtLink>
      </li>
    </ul>

    <UModal
      v-model:open="creating"
      title="Nouvelle campagne"
      description="Vous en serez le Maître du jeu (MJ) et pourrez inviter des joueurs avec un lien."
    >
      <template #body>
        <form
          id="create-campaign"
          class="space-y-4"
          @submit.prevent="submit"
        >
          <UFormField
            label="Nom"
            required
          >
            <UInput
              v-model="form.Name"
              class="w-full"
              maxlength="100"
              autofocus
            />
          </UFormField>
          <UFormField label="Description">
            <UTextarea
              v-model="form.Description"
              class="w-full"
              maxlength="2000"
              :rows="3"
            />
          </UFormField>
          <UAlert
            v-if="createError"
            color="error"
            variant="subtle"
            :description="createError"
          />
        </form>
      </template>
      <template #footer>
        <UButton
          color="neutral"
          variant="outline"
          @click="creating = false"
        >
          Annuler
        </UButton>
        <UButton
          type="submit"
          form="create-campaign"
          :loading="saving"
          :disabled="!form.Name.trim()"
        >
          Créer
        </UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
const api = useCampaignsApi()
const { data, status, error } = useLazyFetch<{ count: number, campaigns: CampaignSummary[] }>(api.base, {
  ...api.options,
  key: 'campaigns'
})

const creating = ref(false)
const saving = ref(false)
const createError = ref('')
const form = reactive({ Name: '', Description: '' })

function openCreate() {
  Object.assign(form, { Name: '', Description: '' })
  createError.value = ''
  creating.value = true
}

async function submit() {
  saving.value = true
  createError.value = ''
  try {
    const campaign = await api.create({ ...form })
    await clearNuxtData('campaigns')
    await navigateTo(`/campagnes/${campaign.id}`)
  } catch (e) {
    createError.value = (e as { data?: { details?: string[] } }).data?.details?.join(' ') ?? 'Création impossible, réessayez.'
  } finally {
    saving.value = false
  }
}

useHead({ title: 'Campagnes' })
</script>
