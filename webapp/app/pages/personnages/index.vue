<template>
  <div class="mx-auto max-w-3xl p-4 pt-[calc(var(--safe-top)+1rem)] pb-[calc(var(--bottom-nav-height)+1rem)] md:p-8 lg:pt-8 lg:pb-8">
    <div class="mb-6 flex items-center justify-between gap-4">
      <h1 class="text-2xl font-bold">
        Personnages
      </h1>
      <UButton
        icon="i-lucide-plus"
        @click="openCreate"
      >
        Nouveau
      </UButton>
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      title="Impossible de charger les personnages"
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
      v-else-if="!data?.characters.length"
      class="rounded-lg border border-dashed border-default py-16 text-center text-muted"
    >
      Aucun personnage pour l'instant.
    </div>
    <ul
      v-else
      class="space-y-3"
    >
      <li
        v-for="character in data.characters"
        :key="character.id"
      >
        <NuxtLink
          :to="`/personnages/${character.id}`"
          class="flex items-center justify-between gap-4 rounded-lg border border-default p-4 transition-colors hover:bg-elevated"
        >
          <div class="min-w-0">
            <p class="truncate font-semibold">
              {{ character.Name }}
            </p>
            <p class="truncate text-sm text-muted">
              {{ [character.Species, character.Class].filter(Boolean).join(' · ') }} · Niveau {{ character.Level }}
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-1 text-sm">
            <UIcon
              name="i-lucide-heart"
              class="size-4 text-error"
            />
            {{ character.HitPoints?.Current ?? 0 }}/{{ character.HitPoints?.Max ?? 0 }}
          </div>
        </NuxtLink>
      </li>
    </ul>

    <UModal
      v-model:open="creating"
      title="Nouveau personnage"
    >
      <template #body>
        <form
          id="create-character"
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
          <UFormField
            label="Classe"
            required
          >
            <UInput
              v-model="form.Class"
              class="w-full"
              maxlength="50"
            />
          </UFormField>
          <UFormField label="Espèce">
            <UInput
              v-model="form.Species"
              class="w-full"
              maxlength="50"
            />
          </UFormField>
          <UFormField label="Niveau">
            <UInputNumber
              v-model="form.Level"
              :min="1"
              :max="20"
            />
          </UFormField>
          <UFormField label="Caractéristiques">
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <UFormField
                v-for="ability in abilities"
                :key="ability.key"
                :label="ability.label"
                size="sm"
              >
                <UInputNumber
                  v-model="form.Abilities[ability.key]"
                  :min="1"
                  :max="30"
                />
              </UFormField>
            </div>
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
          form="create-character"
          :loading="saving"
          :disabled="!form.Name.trim() || !form.Class.trim()"
        >
          Créer
        </UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
const api = useCharactersApi()
const { data, status, error } = useLazyFetch<{ count: number, characters: CharacterSummary[] }>(api.base, {
  ...api.options,
  key: 'characters'
})

const creating = ref(false)
const saving = ref(false)
const createError = ref('')
const emptyForm = () => ({
  Name: '',
  Class: '',
  Species: '',
  Level: 1,
  Abilities: Object.fromEntries(abilities.map(a => [a.key, 10])) as Record<typeof abilities[number]['key'], number>
})
const form = reactive(emptyForm())

function openCreate() {
  Object.assign(form, emptyForm())
  createError.value = ''
  creating.value = true
}

async function submit() {
  saving.value = true
  createError.value = ''
  try {
    const character = await api.create({ ...form })
    await navigateTo(`/personnages/${character.id}`)
  } catch (e) {
    createError.value = (e as { data?: { details?: string[] } }).data?.details?.join(' ') ?? 'Création impossible, réessayez.'
  } finally {
    saving.value = false
  }
}

useHead({ title: 'Personnages' })
</script>
