<template>
  <div class="mx-auto max-w-3xl p-4 pt-[calc(var(--safe-top)+1rem)] pb-[calc(var(--bottom-nav-height)+1rem)] md:p-8 lg:pt-8 lg:pb-8">
    <UButton
      to="/campagnes"
      color="neutral"
      variant="link"
      icon="i-lucide-arrow-left"
      class="-ml-2 mb-4"
    >
      Campagnes
    </UButton>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      :title="error.statusCode === 404 ? 'Campagne introuvable' : 'Impossible de charger la campagne'"
      :description="error.message"
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
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <h1 class="truncate text-2xl font-bold">
            {{ campaign.Name }}
          </h1>
          <UBadge
            :color="isGm ? 'primary' : 'neutral'"
            variant="subtle"
            class="shrink-0"
          >
            {{ isGm ? 'MJ' : 'Joueur' }}
          </UBadge>
          <UButton
            v-if="isGm"
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-pencil"
            aria-label="Modifier la campagne"
            title="Modifier la campagne"
            class="ml-auto shrink-0"
            @click="openEdit"
          />
        </div>
        <p
          v-if="campaign.Description"
          class="mt-2 whitespace-pre-line text-muted"
        >
          {{ campaign.Description }}
        </p>
      </div>

      <!-- Première visite d'un joueur : il doit choisir lequel de ses personnages rejoint la campagne -->
      <section
        v-if="campaign.NeedsCharacter || changingCharacter"
        class="space-y-3 rounded-lg border border-primary p-4"
      >
        <h2 class="font-semibold">
          {{ campaign.NeedsCharacter ? 'Choisissez votre personnage' : 'Changer de personnage' }}
        </h2>
        <p
          v-if="campaign.NeedsCharacter"
          class="text-sm text-muted"
        >
          Quel personnage rejoint cette campagne ?
        </p>
        <UAlert
          v-if="charactersError"
          color="error"
          variant="subtle"
          title="Impossible de charger vos personnages"
          :description="charactersError.message"
        />
        <p
          v-else-if="characters && !characters.characters.length"
          class="text-sm text-muted"
        >
          Vous n'avez aucun personnage.
          <NuxtLink
            to="/personnages"
            class="text-primary underline"
          >
            Créez-en un
          </NuxtLink>
          puis revenez ici.
        </p>
        <ul
          v-else
          class="space-y-2"
        >
          <li
            v-for="character in characters?.characters"
            :key="character.id"
          >
            <button
              type="button"
              class="flex w-full items-center justify-between gap-4 rounded-lg border border-default p-3 text-left transition-colors hover:bg-elevated disabled:opacity-50"
              :disabled="choosing"
              @click="choose(character.id)"
            >
              <span class="min-w-0">
                <span class="block truncate font-semibold">{{ character.Name }}</span>
                <span class="block truncate text-sm text-muted">
                  {{ [character.Species, character.Class].filter(Boolean).join(' · ') }} · Niveau {{ character.Level }}
                </span>
              </span>
              <UIcon
                name="i-lucide-check"
                class="size-5 shrink-0 text-primary"
              />
            </button>
          </li>
        </ul>
        <UAlert
          v-if="chooseError"
          color="error"
          variant="subtle"
          :description="chooseError"
        />
        <UButton
          v-if="changingCharacter"
          color="neutral"
          variant="outline"
          size="sm"
          @click="changingCharacter = false"
        >
          Annuler
        </UButton>
      </section>

      <!-- Lien d'invitation, réservé au MJ -->
      <section
        v-if="isGm && inviteLink"
        class="space-y-3 rounded-lg border border-default p-4"
      >
        <h2 class="font-semibold">
          Inviter des joueurs
        </h2>
        <div class="flex gap-2">
          <UInput
            :model-value="inviteLink"
            readonly
            class="min-w-0 flex-1"
            @focus="($event.target as HTMLInputElement).select()"
          />
          <UButton
            :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
            color="neutral"
            variant="outline"
            aria-label="Copier le lien"
            title="Copier le lien"
            @click="copyInvite"
          />
        </div>
        <UButton
          color="neutral"
          variant="link"
          size="sm"
          icon="i-lucide-refresh-cw"
          class="-ml-2"
          :loading="renewing"
          @click="renewInvite"
        >
          Générer un nouveau lien (invalide l'ancien)
        </UButton>
      </section>

      <UButton
        v-if="!campaign.NeedsCharacter"
        :to="`/campagnes/${id}/${isGm ? 'mj' : 'jouer'}`"
        size="lg"
        block
        icon="i-lucide-swords"
      >
        {{ isGm ? 'Jouer en tant que MJ' : 'Jouer' }}
      </UButton>

      <section class="space-y-3">
        <h2 class="font-semibold">
          Membres ({{ campaign.Members.length }})
        </h2>
        <ul class="space-y-2">
          <li
            v-for="member in members"
            :key="member.UserId"
            class="flex items-center justify-between gap-4 rounded-lg border border-default p-3"
          >
            <div class="min-w-0">
              <p class="truncate font-semibold">
                <template v-if="member.Role === 'GM'">
                  Maître du jeu
                </template>
                <template v-else-if="member.Character">
                  {{ member.Character.Name }}
                </template>
                <template v-else>
                  Personnage non choisi
                </template>
                <span
                  v-if="member.IsMe"
                  class="font-normal text-muted"
                > (vous)</span>
              </p>
              <p
                v-if="member.Character"
                class="truncate text-sm text-muted"
              >
                {{ [member.Character.Species, member.Character.Class].filter(Boolean).join(' · ') }} · Niveau {{ member.Character.Level }}
              </p>
            </div>
            <UBadge
              :color="member.Role === 'GM' ? 'primary' : 'neutral'"
              variant="subtle"
              class="shrink-0"
            >
              {{ member.Role === 'GM' ? 'MJ' : 'Joueur' }}
            </UBadge>
          </li>
        </ul>
        <UButton
          v-if="!isGm && !campaign.NeedsCharacter && !changingCharacter"
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-lucide-repeat"
          @click="changingCharacter = true"
        >
          Changer de personnage
        </UButton>
      </section>

      <UButton
        v-if="isGm"
        color="error"
        variant="outline"
        icon="i-lucide-trash-2"
        @click="confirmDelete = true"
      >
        Supprimer la campagne
      </UButton>
    </div>

    <UModal
      v-model:open="editing"
      title="Modifier la campagne"
    >
      <template #body>
        <form
          id="edit-campaign"
          class="space-y-4"
          @submit.prevent="saveEdit"
        >
          <UFormField
            label="Nom"
            required
          >
            <UInput
              v-model="form.Name"
              class="w-full"
              maxlength="100"
            />
          </UFormField>
          <UFormField label="Description">
            <UTextarea
              v-model="form.Description"
              class="w-full"
              maxlength="2000"
              :rows="4"
            />
          </UFormField>
          <UAlert
            v-if="editError"
            color="error"
            variant="subtle"
            :description="editError"
          />
        </form>
      </template>
      <template #footer>
        <UButton
          color="neutral"
          variant="outline"
          @click="editing = false"
        >
          Annuler
        </UButton>
        <UButton
          type="submit"
          form="edit-campaign"
          :loading="saving"
          :disabled="!form.Name.trim()"
        >
          Enregistrer
        </UButton>
      </template>
    </UModal>

    <UModal
      v-model:open="confirmDelete"
      title="Supprimer cette campagne ?"
      description="Elle sera supprimée pour tous les joueurs. Cette action est définitive."
    >
      <template #footer>
        <UButton
          color="neutral"
          variant="outline"
          @click="confirmDelete = false"
        >
          Annuler
        </UButton>
        <UButton
          color="error"
          :loading="deleting"
          @click="remove"
        >
          Supprimer
        </UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
const id = String(useRoute().params.id)
const api = useCampaignsApi()
const charactersApi = useCharactersApi()
const toast = useToast()

const { data: campaign, error } = useFetch<Campaign>(`${api.base}/${id}`, { ...api.options, key: `campaign-${id}` })

const isGm = computed(() => campaign.value?.Role === 'GM')
// Le MJ en premier, puis les joueurs dans l'ordre d'arrivée
const members = computed(() => [...(campaign.value?.Members ?? [])].sort((a, b) =>
  Number(b.Role === 'GM') - Number(a.Role === 'GM') || a.JoinedAt.localeCompare(b.JoinedAt)))
// Personnages de l'utilisateur, chargés seulement quand il doit en choisir un
const changingCharacter = ref(false)
const needsList = computed(() => !!campaign.value?.NeedsCharacter || changingCharacter.value)
const { data: characters, error: charactersError, execute: loadCharacters } = useLazyFetch<{ count: number, characters: CharacterSummary[] }>(charactersApi.base, {
  ...charactersApi.options,
  key: 'characters',
  immediate: false,
  watch: false
})
watch(needsList, (needed) => {
  if (needed) void loadCharacters()
}, { immediate: true })

const choosing = ref(false)
const chooseError = ref('')

async function choose(characterId: string) {
  choosing.value = true
  chooseError.value = ''
  try {
    campaign.value = await api.chooseCharacter(id, characterId)
    changingCharacter.value = false
  } catch (e) {
    chooseError.value = (e as { data?: { details?: string[] } }).data?.details?.join(' ') ?? 'Choix impossible, réessayez.'
  } finally {
    choosing.value = false
  }
}

// Lien à partager : page de la webapp qui rejoint la campagne avec le code (l'API ne connaît pas l'URL de la webapp)
const inviteLink = computed(() =>
  campaign.value?.InviteCode ? `${location.origin}/campagnes/rejoindre/${campaign.value.InviteCode}` : '')

const copied = ref(false)

async function copyInvite() {
  try {
    await navigator.clipboard.writeText(inviteLink.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    toast.add({ title: 'Copie impossible', description: 'Sélectionnez le lien et copiez-le manuellement.', color: 'error' })
  }
}

const renewing = ref(false)

async function renewInvite() {
  renewing.value = true
  try {
    campaign.value = await api.renewInvite(id)
    toast.add({ title: 'Nouveau lien généré', description: 'L\'ancien lien ne fonctionne plus.' })
  } catch {
    toast.add({ title: 'Impossible de renouveler le lien', color: 'error' })
  } finally {
    renewing.value = false
  }
}

const editing = ref(false)
const saving = ref(false)
const editError = ref('')
const form = reactive({ Name: '', Description: '' })

function openEdit() {
  Object.assign(form, { Name: campaign.value?.Name ?? '', Description: campaign.value?.Description ?? '' })
  editError.value = ''
  editing.value = true
}

async function saveEdit() {
  saving.value = true
  editError.value = ''
  try {
    campaign.value = await api.update(id, { ...form })
    await clearNuxtData('campaigns')
    editing.value = false
  } catch (e) {
    editError.value = (e as { data?: { details?: string[] } }).data?.details?.join(' ') ?? 'Modification impossible, réessayez.'
  } finally {
    saving.value = false
  }
}

const confirmDelete = ref(false)
const deleting = ref(false)

async function remove() {
  deleting.value = true
  try {
    await api.remove(id)
    await clearNuxtData('campaigns')
    await navigateTo('/campagnes')
  } catch {
    confirmDelete.value = false
    toast.add({ title: 'Suppression impossible', description: 'Réessayez.', color: 'error' })
  } finally {
    deleting.value = false
  }
}

useHead({ title: () => campaign.value?.Name ?? 'Campagne' })
</script>
