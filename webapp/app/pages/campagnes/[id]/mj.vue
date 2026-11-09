<template>
  <div class="mx-auto max-w-5xl p-4 pt-[calc(var(--safe-top)+1rem)] pb-[calc(var(--bottom-nav-height)+1rem)] md:p-8 lg:pt-8 lg:pb-8">
    <UButton
      :to="`/campagnes/${id}`"
      color="neutral"
      variant="link"
      icon="i-lucide-arrow-left"
      class="-ml-2 mb-4"
    >
      {{ campaign?.Name ?? 'Campagne' }}
    </UButton>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      :title="error.statusCode === 404 ? 'Campagne introuvable' : 'Impossible de charger la campagne'"
      :description="error.message"
    />
    <UAlert
      v-else-if="campaign && !isGm"
      color="warning"
      variant="subtle"
      title="Accès réservé au MJ"
    />
    <div
      v-else-if="!campaign"
      class="flex items-center justify-center gap-3 py-16 text-muted"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-5 animate-spin"
      />
      Chargement...
    </div>

    <div
      v-else
      class="space-y-6"
    >
      <div class="flex items-center gap-2">
        <h1 class="truncate text-2xl font-bold">
          Administration
        </h1>
        <UBadge
          variant="subtle"
          class="shrink-0"
        >
          MJ
        </UBadge>
      </div>

      <p
        v-if="connected"
        class="flex flex-wrap items-center gap-2 text-sm text-muted"
      >
        <span class="size-2 rounded-full bg-success" />
        {{ presentNames.length ? `Présents : ${presentNames.join(', ')}` : 'Aucun joueur présent' }}
      </p>

      <div class="grid gap-6 md:grid-cols-[13rem_minmax(0,1fr)]">
        <!-- Menu de l'administration : panneau latéral à gauche (barre horizontale sur mobile) -->
        <nav
          aria-label="Administration de la campagne"
          class="-mx-4 flex gap-1 overflow-x-auto px-4 md:sticky md:top-8 md:mx-0 md:flex-col md:self-start md:overflow-visible md:rounded-lg md:border md:border-default md:p-2"
        >
          <button
            v-for="item in sections"
            :key="item.key"
            type="button"
            class="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-elevated"
            :class="section === item.key ? 'bg-elevated text-highlighted' : 'text-muted'"
            :aria-current="section === item.key ? 'page' : undefined"
            @click="section = item.key"
          >
            <UIcon
              :name="item.icon"
              class="size-4 shrink-0"
            />
            {{ item.label }}
          </button>
        </nav>

        <div class="min-w-0 space-y-6">
          <CampaignCombats
            v-if="section === 'combats'"
            :campaign-id="id"
            :members="campaign.Members"
            :present="present"
            :live="connected"
            :tick="combatTick"
          />

          <!-- Rubriques à venir -->
          <div
            v-else
            class="flex flex-col items-center gap-3 rounded-lg border border-dashed border-default px-4 py-16 text-center"
          >
            <UIcon
              :name="current.icon"
              class="size-8 text-muted"
            />
            <h2 class="font-semibold">
              {{ current.label }}
            </h2>
            <p class="text-sm text-muted">
              Cette rubrique arrive bientôt.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const id = String(useRoute().params.id)
const api = useCampaignsApi()

const { data: campaign, error } = useFetch<Campaign>(`${api.base}/${id}`, { ...api.options, key: `campaign-${id}` })
const isGm = computed(() => campaign.value?.Role === 'GM')

// Le MJ se connecte aussi à la partie : il voit les joueurs présents, et est prévenu quand un combat change
const combatTick = ref(0)
const { connected, present } = useCampaignSocket(id, (message) => {
  if (message.type === 'combat') combatTick.value++
})
const presentNames = computed(() => (campaign.value?.Members ?? [])
  .filter(member => member.Role === 'PLAYER' && present.value.includes(member.UserId))
  .map(member => member.Character?.Name ?? 'Personnage non choisi'))

// Rubriques du menu latéral ; seuls les combats existent pour l'instant
const sections = [
  { key: 'combats', label: 'Combats', icon: 'i-lucide-swords' },
  { key: 'pnj', label: 'PNJ', icon: 'i-lucide-users' },
  { key: 'monstres', label: 'Monstres', icon: 'i-lucide-skull' }
] as const
type SectionKey = typeof sections[number]['key']

// La rubrique est gardée dans l'URL (?section=pnj) pour survivre à un rechargement
const route = useRoute()
const section = computed<SectionKey>({
  get: () => sections.find(item => item.key === route.query.section)?.key ?? 'combats',
  set: key => void navigateTo({ query: { ...route.query, section: key }, replace: true })
})
const current = computed(() => sections.find(item => item.key === section.value)!)

useHead({ title: () => `MJ · ${campaign.value?.Name ?? 'Campagne'}` })
</script>
