<template>
  <div class="space-y-6">
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      title="Impossible de charger les combats"
      :description="error.message"
    />

    <!-- Liste des combats préparés et du combat en cours -->
    <section
      v-else-if="mode.kind === 'list'"
      class="space-y-4"
    >
      <div class="flex items-center justify-between gap-2">
        <h2 class="font-semibold">
          Combats ({{ combats.length }})
        </h2>
        <UButton
          icon="i-lucide-plus"
          @click="openEdit()"
        >
          Nouveau combat
        </UButton>
      </div>

      <p
        v-if="!combats.length"
        class="rounded-lg border border-dashed border-default px-4 py-10 text-center text-sm text-muted"
      >
        Aucun combat. Préparez-en à l'avance pour les lancer en un clic pendant la partie.
      </p>

      <ul class="space-y-2">
        <li
          v-for="item in combats"
          :key="item.id"
          class="flex flex-wrap items-center gap-3 rounded-lg border p-3"
          :class="item.Status === 'PREPARING' ? 'border-default' : 'border-primary'"
        >
          <div class="min-w-0 flex-1">
            <p class="truncate font-semibold">
              {{ item.Name }}
            </p>
            <p class="text-sm text-muted">
              {{ item.Enemies?.length ?? 0 }} ennemi{{ (item.Enemies?.length ?? 0) > 1 ? 's' : '' }}
            </p>
          </div>
          <UBadge
            :color="item.Status === 'PREPARING' ? 'neutral' : 'primary'"
            variant="subtle"
          >
            {{ statusLabels[item.Status] }}
          </UBadge>
          <div class="flex shrink-0 gap-2">
            <template v-if="item.Status === 'PREPARING'">
              <UButton
                color="neutral"
                variant="outline"
                size="sm"
                icon="i-lucide-pencil"
                aria-label="Modifier le combat"
                title="Modifier le combat"
                @click="openEdit(item)"
              />
              <UButton
                size="sm"
                icon="i-lucide-swords"
                :disabled="!!active"
                :title="active ? 'Un combat est déjà en cours' : undefined"
                :loading="busy"
                @click="launch(item.id)"
              >
                Lancer
              </UButton>
              <UButton
                color="error"
                variant="ghost"
                size="sm"
                icon="i-lucide-trash-2"
                aria-label="Supprimer le combat"
                title="Supprimer le combat"
                :loading="busy"
                @click="remove(item.id)"
              />
            </template>
            <UButton
              v-else
              size="sm"
              icon="i-lucide-eye"
              @click="mode = { kind: 'track', id: item.id }"
            >
              Suivre
            </UButton>
          </div>
        </li>
      </ul>
      <UAlert
        v-if="formError"
        color="error"
        variant="subtle"
        :description="formError"
      />
    </section>

    <!-- Création / modification d'un combat -->
    <section
      v-else-if="mode.kind === 'edit'"
      class="space-y-4 rounded-lg border border-default p-4"
    >
      <h2 class="font-semibold">
        {{ mode.id ? 'Modifier le combat' : 'Nouveau combat' }}
      </h2>

      <form
        class="space-y-4"
        @submit.prevent="save(false)"
      >
        <UFormField
          label="Nom du combat"
          required
        >
          <UInput
            v-model="form.Name"
            placeholder="Embuscade gobeline"
            maxlength="100"
            class="w-full"
          />
        </UFormField>

        <div class="space-y-2">
          <p class="text-sm font-medium">
            Ennemis
          </p>
          <div
            v-for="(enemy, index) in form.Enemies"
            :key="index"
            class="flex items-center gap-2"
          >
            <UInput
              v-model="enemy.Name"
              placeholder="Nom"
              maxlength="100"
              :aria-label="`Nom de l'ennemi ${index + 1}`"
              class="min-w-0 flex-1"
            />
            <UInputNumber
              v-model="enemy.Initiative"
              :min="-10"
              :max="50"
              :aria-label="`Initiative de l'ennemi ${index + 1}`"
              class="w-28 shrink-0"
            />
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-trash-2"
              aria-label="Retirer l'ennemi"
              :disabled="form.Enemies.length === 1"
              @click="form.Enemies.splice(index, 1)"
            />
          </div>
          <p class="text-xs text-muted">
            L'initiative des ennemis est fixée par vous (valeur du champ de droite).
          </p>
          <UButton
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-plus"
            :disabled="form.Enemies.length >= 30"
            @click="form.Enemies.push({ Name: '', Initiative: 10 })"
          >
            Ajouter un ennemi
          </UButton>
        </div>

        <UAlert
          v-if="formError"
          color="error"
          variant="subtle"
          :description="formError"
        />

        <div class="flex flex-wrap gap-2">
          <UButton
            type="submit"
            icon="i-lucide-save"
            :loading="busy"
          >
            Enregistrer
          </UButton>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-swords"
            :disabled="!!active"
            :title="active ? 'Un combat est déjà en cours' : undefined"
            :loading="busy"
            @click="save(true)"
          >
            Enregistrer et lancer
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            @click="backToList"
          >
            Annuler
          </UButton>
        </div>
      </form>
    </section>

    <!-- Suivi du combat lancé -->
    <section
      v-else-if="tracked"
      class="space-y-4 rounded-lg border border-primary p-4"
    >
      <UButton
        color="neutral"
        variant="link"
        icon="i-lucide-arrow-left"
        class="-ml-2"
        @click="backToList"
      >
        Tous les combats
      </UButton>

      <div class="flex items-center gap-2">
        <h2 class="min-w-0 flex-1 truncate font-semibold">
          {{ tracked.Name }}
        </h2>
        <UBadge
          color="primary"
          variant="subtle"
        >
          {{ statusLabels[tracked.Status] }}
        </UBadge>
      </div>

      <template v-if="(tracked.Status === 'ORDER' || tracked.Status === 'RUNNING') && tracked.Order">
        <p class="text-sm text-muted">
          <template v-if="draft">
            Mode édition : glissez les lignes par leur poignée, ajoutez ou retirez des ennemis. Les joueurs ne sont prévenus qu'à l'enregistrement.
          </template>
          <template v-else-if="tracked.Status === 'ORDER'">
            Toutes les initiatives sont reçues. Les joueurs ne voient pas encore l'ordre : modifiez-le si besoin (égalités départagées
            par le bonus d'initiative), puis démarrez le combat.
          </template>
          <template v-else>
            Les joueurs voient cet ordre. Passez en mode édition pour le modifier, ajouter ou retirer des ennemis.
          </template>
        </p>

        <template v-if="draft">
          <CombatTimeline
            :entries="draft"
            editable
            @move="moveDraft"
            @remove="removeFromDraft"
          />

          <form
            class="flex items-center gap-2"
            @submit.prevent="addEnemyToDraft"
          >
            <UInput
              v-model="newEnemy.Name"
              placeholder="Nouvel ennemi"
              maxlength="100"
              aria-label="Nom du nouvel ennemi"
              class="min-w-0 flex-1"
            />
            <UInputNumber
              v-model="newEnemy.Initiative"
              :min="-10"
              :max="50"
              aria-label="Initiative du nouvel ennemi"
              class="w-28 shrink-0"
            />
            <UButton
              type="submit"
              color="neutral"
              variant="outline"
              icon="i-lucide-plus"
              aria-label="Ajouter l'ennemi"
              :disabled="!newEnemy.Name.trim()"
            />
          </form>

          <div class="flex flex-wrap gap-2">
            <UButton
              icon="i-lucide-save"
              :loading="busy"
              @click="saveDraft(tracked.id)"
            >
              Enregistrer
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              :disabled="busy"
              @click="draft = undefined"
            >
              Annuler
            </UButton>
          </div>
        </template>

        <template v-else>
          <CombatTimeline :entries="tracked.Order" />
          <div class="flex flex-wrap gap-2">
            <UButton
              v-if="tracked.Status === 'ORDER'"
              icon="i-lucide-play"
              :loading="busy"
              @click="begin(tracked.id)"
            >
              Démarrer le combat
            </UButton>
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-pencil"
              @click="editOrder(tracked.Order)"
            >
              Modifier
            </UButton>
          </div>
        </template>
      </template>
      <ul
        v-else
        class="space-y-2"
      >
        <li
          v-for="row in initiativeRows"
          :key="row.key"
          class="flex items-center justify-between gap-4 rounded-lg border border-default p-3"
        >
          <div class="min-w-0">
            <p class="truncate font-semibold">
              {{ row.name }}
            </p>
            <p class="flex items-center gap-1.5 text-sm text-muted">
              <span
                v-if="!row.enemy && live"
                class="size-2 rounded-full"
                :class="row.present ? 'bg-success' : 'bg-muted'"
              />
              {{ row.enemy ? 'Ennemi' : row.present || !live ? 'Joueur' : 'Joueur · déconnecté' }}
            </p>
          </div>
          <span
            v-if="row.initiative !== undefined"
            class="text-2xl font-bold tabular-nums"
          >{{ row.initiative }}</span>
          <span
            v-else
            class="flex items-center gap-2 text-sm text-muted"
          >
            <UIcon
              name="i-lucide-loader-circle"
              class="size-4 animate-spin"
            />
            En attente
          </span>
        </li>
      </ul>

      <UAlert
        v-if="formError"
        color="error"
        variant="subtle"
        :description="formError"
      />
      <UButton
        color="error"
        variant="outline"
        icon="i-lucide-flag"
        :loading="busy"
        @click="remove(tracked.id)"
      >
        Terminer le combat
      </UButton>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { Combat, CampaignMember, OrderEntry } from '~/composables/useCampaigns'

const props = defineProps<{
  campaignId: string
  members: CampaignMember[]
  // UserId des joueurs connectés à la partie
  present: string[]
  // Vrai tant que la connexion temps réel est ouverte : plus besoin d'interroger l'API
  live: boolean
  // Incrémenté à chaque notification « combat » reçue
  tick: number
}>()

const api = useCampaignsApi()
const toast = useToast()

const statusLabels: Record<Combat['Status'], string> = {
  PREPARING: 'Préparé',
  INITIATIVE: 'Initiative',
  ORDER: 'Ordre de jeu',
  RUNNING: 'En cours'
}

const { data, error, refresh } = useFetch<{ Combats: Combat[] }>(api.combatsUrl(props.campaignId), {
  ...api.options,
  key: `combats-${props.campaignId}`,
  server: false
})
const combats = computed(() => data.value?.Combats ?? [])
// Un seul combat peut être lancé à la fois
const active = computed(() => combats.value.find(combat => combat.Status !== 'PREPARING'))

type Mode = { kind: 'list' } | { kind: 'edit', id?: string } | { kind: 'track', id: string }
const mode = ref<Mode>({ kind: 'list' })
const tracked = computed(() => mode.value.kind === 'track' ? combats.value.find(combat => combat.id === (mode.value as { id: string }).id) : undefined)

// Un combat lancé qui disparaît (terminé) ramène à la liste ; un combat déjà en cours à l'arrivée s'ouvre directement
watch(combats, (list, previous) => {
  if (mode.value.kind === 'track' && !tracked.value) {
    mode.value = { kind: 'list' }
    draft.value = undefined
  }
  const running = list.find(combat => combat.Status !== 'PREPARING')
  if (!previous?.length && mode.value.kind === 'list' && running) mode.value = { kind: 'track', id: running.id }
})

// Notification du serveur : un combat a changé (par exemple un joueur a envoyé son initiative)
watch(() => props.tick, () => void refresh())

// Sans connexion temps réel, relecture régulière pendant la phase d'initiative
useFallbackPolling(refresh, () => !props.live && active.value?.Status === 'INITIATIVE' && !busy.value)

const emptyEnemies = () => [{ Name: '', Initiative: 10 }]
const form = reactive<{ Name: string, Enemies: { Name: string, Initiative: number }[] }>({ Name: '', Enemies: emptyEnemies() })

const busy = ref(false)
const formError = ref('')

function openEdit(combat?: Combat) {
  form.Name = combat?.Name ?? ''
  form.Enemies = combat?.Enemies?.map(({ Name, Initiative }) => ({ Name, Initiative })) ?? emptyEnemies()
  formError.value = ''
  mode.value = { kind: 'edit', id: combat?.id }
}

function backToList() {
  draft.value = undefined
  formError.value = ''
  mode.value = { kind: 'list' }
}

// Joueurs puis ennemis, du plus haut au plus bas ; les joueurs sans jet en dernier
const initiativeRows = computed(() => {
  const combat = tracked.value
  if (!combat) return []
  const players = props.members
    .filter(member => member.Role === 'PLAYER')
    .map(member => ({
      key: member.UserId,
      name: member.Character?.Name ?? 'Personnage non choisi',
      enemy: false,
      present: props.present.includes(member.UserId),
      initiative: combat.Initiatives?.[member.UserId]
    }))
  const enemies = (combat.Enemies ?? []).map(enemy => ({
    key: enemy.id,
    name: enemy.Name,
    enemy: true,
    present: true,
    initiative: enemy.Initiative as number | undefined
  }))
  return [...players, ...enemies].sort((a, b) => (b.initiative ?? -Infinity) - (a.initiative ?? -Infinity))
})

function errorMessage(e: unknown) {
  const data = (e as { data?: { details?: string[], error?: string } }).data
  if (data) return data.details?.join(' ') ?? data.error ?? 'Action impossible, réessayez.'
  return e instanceof Error ? e.message : 'Action impossible, réessayez.'
}

async function run(action: () => Promise<void>) {
  busy.value = true
  formError.value = ''
  try {
    await action()
  } catch (e) {
    formError.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}

// Remplace un combat dans la liste locale (ou l'ajoute)
function upsert(combat: Combat) {
  const list = combats.value.some(item => item.id === combat.id)
    ? combats.value.map(item => item.id === combat.id ? combat : item)
    : [...combats.value, combat]
  data.value = { Combats: list }
}

const save = (thenLaunch: boolean) => run(async () => {
  const body = {
    Name: form.Name.trim(),
    Enemies: form.Enemies.map(enemy => ({ Name: enemy.Name.trim(), Initiative: Number(enemy.Initiative) }))
  }
  if (!body.Name) throw new Error('Donnez un nom au combat.')
  if (body.Enemies.some(enemy => !enemy.Name)) throw new Error('Chaque ennemi doit avoir un nom.')

  const editing = mode.value.kind === 'edit' ? mode.value.id : undefined
  const { Combat: saved } = editing ? await api.updateCombat(props.campaignId, editing, body) : await api.createCombat(props.campaignId, body)
  upsert(saved)

  if (thenLaunch) {
    upsert((await api.startCombat(props.campaignId, saved.id)).Combat)
    mode.value = { kind: 'track', id: saved.id }
  } else {
    toast.add({ title: 'Combat enregistré' })
    mode.value = { kind: 'list' }
  }
})

const launch = (combatId: string) => run(async () => {
  upsert((await api.startCombat(props.campaignId, combatId)).Combat)
  mode.value = { kind: 'track', id: combatId }
})

// Révèle l'ordre de jeu aux joueurs
const begin = (combatId: string) => run(async () => {
  upsert((await api.beginCombat(props.campaignId, combatId)).Combat)
})

// Supprime un combat préparé ou termine le combat lancé
const remove = (combatId: string) => run(async () => {
  await api.removeCombat(props.campaignId, combatId)
  data.value = { Combats: combats.value.filter(combat => combat.id !== combatId) }
})

// Mode édition de l'ordre de jeu : le MJ travaille sur un brouillon local (glisser-déposer, ajout d'ennemis) ; rien
// n'est envoyé, et les joueurs ne sont pas prévenus, avant l'enregistrement
const draft = ref<OrderEntry[]>()
const newEnemy = reactive({ Name: '', Initiative: 10 })
// Les ennemis ajoutés portent un identifiant provisoire (préfixe « new- ») jusqu'à l'enregistrement
let newCounter = 0

function editOrder(order: OrderEntry[]) {
  draft.value = order.map(entry => ({ ...entry }))
  Object.assign(newEnemy, { Name: '', Initiative: 10 })
  formError.value = ''
}

function moveDraft(from: number, to: number) {
  if (!draft.value) return
  const order = [...draft.value]
  const [entry] = order.splice(from, 1)
  order.splice(to, 0, entry!)
  draft.value = order
}

// Retire un ennemi (vaincu, par exemple) du brouillon ; il disparaît du combat à l'enregistrement
function removeFromDraft(index: number) {
  draft.value = draft.value?.filter((_, i) => i !== index)
}

// Place le nouvel ennemi selon son initiative (avant le premier participant moins rapide) ; le MJ ajuste ensuite
function addEnemyToDraft() {
  const name = newEnemy.Name.trim()
  if (!name || !draft.value) return
  const initiative = Number(newEnemy.Initiative)
  const entry: OrderEntry = { id: `new-${++newCounter}`, Name: name, Initiative: initiative, Bonus: 0, Enemy: true }
  const index = draft.value.findIndex(other => (other.Initiative ?? 0) < initiative)
  draft.value = index === -1 ? [...draft.value, entry] : [...draft.value.slice(0, index), entry, ...draft.value.slice(index)]
  newEnemy.Name = ''
}

// Enregistre l'ordre et les ennemis ajoutés : c'est ici que les joueurs sont prévenus
const saveDraft = (combatId: string) => run(async () => {
  const order = draft.value ?? []
  const added = order.filter(entry => entry.id.startsWith('new-')).map(({ id, Name, Initiative }) => ({ id, Name, Initiative: Initiative ?? 0 }))
  upsert((await api.reorderCombat(props.campaignId, combatId, order.map(entry => entry.id), added)).Combat)
  draft.value = undefined
  toast.add({ title: 'Ordre enregistré' })
})
</script>
