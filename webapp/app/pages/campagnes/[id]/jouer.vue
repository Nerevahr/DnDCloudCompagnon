<template>
  <div class="mx-auto max-w-3xl p-4 pt-[calc(var(--safe-top)+1rem)] pb-[calc(var(--bottom-nav-height)+1rem)] md:p-8 lg:pt-8 lg:pb-8">
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

    <div
      v-else-if="combat?.Status === 'RUNNING' && combat.Order"
      class="space-y-4"
    >
      <h1 class="text-2xl font-bold">
        {{ combat.Name }}
      </h1>
      <p class="text-sm text-muted">
        Ordre de jeu
      </p>
      <CombatTimeline
        :entries="combat.Order"
        :self-id="campaign?.Members.find(member => member.IsMe)?.UserId"
      />
    </div>

    <div
      v-else-if="combat?.Status === 'INITIATIVE' || combat?.Status === 'ORDER'"
      class="flex flex-col items-center gap-4 py-16 text-center"
    >
      <UIcon
        name="i-lucide-swords"
        class="size-10 text-primary"
      />
      <h1 class="text-2xl font-bold">
        {{ combat.Name }}
      </h1>
      <template v-if="combat.Initiative != null">
        <p class="text-muted">
          Votre initiative
        </p>
        <p class="text-5xl font-bold tabular-nums">
          {{ combat.Initiative }}
        </p>
        <p class="flex items-center gap-2 text-sm text-muted">
          <UIcon
            name="i-lucide-loader-circle"
            class="size-4 animate-spin"
          />
          Attente du MJ...
        </p>
      </template>
      <UButton
        v-else
        icon="i-lucide-dices"
        @click="openRoll"
      >
        Lancer l'initiative
      </UButton>
    </div>

    <div
      v-else
      class="flex flex-col items-center gap-3 py-24 text-center"
    >
      <UIcon
        name="i-lucide-scroll-text"
        class="size-10 text-muted"
      />
      <h1 class="text-2xl font-bold">
        Campagne en cours
      </h1>
    </div>

    <UModal
      v-model:open="rollOpen"
      title="Initiative"
      :ui="{ content: 'max-w-xs' }"
    >
      <template #body>
        <div class="space-y-4">
          <UInputNumber
            v-if="diceMode === 'manual'"
            v-model="rollValue"
            :min="1"
            :max="20"
            placeholder="Jet de d20"
            aria-label="Résultat du d20"
            class="w-full"
          />
          <UButton
            v-else
            color="neutral"
            variant="outline"
            icon="i-lucide-dices"
            block
            @click="rollValue = rollD20()"
          >
            Relancer
          </UButton>
          <D20
            v-if="rollValue"
            :value="rollValue"
            class="mx-auto size-24"
          />
          <div
            v-if="rollValue"
            class="space-y-1 text-center"
          >
            <span class="text-3xl font-bold tabular-nums">{{ total }}</span>
            <span class="block text-sm text-muted tabular-nums">
              {{ rollValue }} {{ bonus < 0 ? '−' : '+' }} {{ Math.abs(bonus) }} (Dextérité)
            </span>
          </div>
          <UAlert
            v-if="sendError"
            color="error"
            variant="subtle"
            :description="sendError"
          />
          <UButton
            block
            :disabled="!rollValue"
            :loading="sending"
            @click="send"
          >
            Valider l'initiative
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { Combat } from '~/composables/useCampaigns'

const id = String(useRoute().params.id)
const api = useCampaignsApi()

const { data: campaign, error } = useFetch<Campaign>(`${api.base}/${id}`, { ...api.options, key: `campaign-${id}` })

const { data: combatData, refresh } = useFetch<{ Combats: Combat[] }>(api.combatsUrl(id), {
  ...api.options,
  key: `combat-${id}`,
  server: false
})
// L'API ne renvoie aux joueurs que le combat lancé, s'il y en a un
const combat = computed(() => combatData.value?.Combats[0] ?? null)

// Le joueur se connecte à la partie (WebSocket) : il devient présent et le MJ le prévient quand un combat change.
// Sans connexion ouverte (dev local, coupure), on retombe sur une relecture régulière de l'API.
const { connected } = useCampaignSocket(id, (message) => {
  if (message.type === 'combat') void refresh()
})
useFallbackPolling(refresh, () => !connected.value)

// Initiative : d20 + modificateur de Dextérité, avec le même système de jet que la fiche de personnage
const { diceMode } = useDiceMode()
const rollOpen = ref(false)
const rollValue = ref<number>()
const sending = ref(false)
const sendError = ref('')

const bonus = computed(() => combat.value?.InitiativeBonus ?? 0)
const total = computed(() => (rollValue.value ?? 0) + bonus.value)

function openRoll() {
  // Mode application : le d20 est tiré tout de suite, sans rien demander au joueur
  rollValue.value = diceMode.value === 'app' ? rollD20() : undefined
  sendError.value = ''
  rollOpen.value = true
}

// La modale s'ouvre d'elle-même quand le MJ lance le combat et que l'initiative n'est pas encore envoyée
const needsRoll = computed(() => combat.value?.Status === 'INITIATIVE' && combat.value.Initiative == null)
watch(needsRoll, (needed) => {
  if (needed && !rollOpen.value) openRoll()
  if (!needed) rollOpen.value = false
}, { immediate: true })

async function send() {
  sending.value = true
  sendError.value = ''
  try {
    combatData.value = { Combats: [(await api.sendInitiative(id, combat.value!.id, total.value)).Combat] }
    rollOpen.value = false
  } catch (e) {
    const data = (e as { data?: { details?: string[], error?: string } }).data
    sendError.value = data?.details?.join(' ') ?? data?.error ?? 'Envoi impossible, réessayez.'
  } finally {
    sending.value = false
  }
}

useHead({ title: () => campaign.value?.Name ?? 'Campagne' })
</script>
