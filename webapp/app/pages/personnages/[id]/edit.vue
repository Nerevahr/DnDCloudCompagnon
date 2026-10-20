<template>
  <div class="mx-auto max-w-3xl p-4 pt-[calc(var(--safe-top)+1rem)] pb-[calc(var(--bottom-nav-height)+1rem)] md:p-8 lg:pt-8 lg:pb-8">
    <UButton
      :to="`/personnages/${id}`"
      color="neutral"
      variant="link"
      icon="i-lucide-arrow-left"
      class="-ml-2 mb-4"
    >
      Retour à la fiche
    </UButton>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      :title="error.statusCode === 404 ? 'Personnage introuvable' : 'Impossible de charger le personnage'"
      :description="error.message"
    />
    <div
      v-else-if="!form"
      class="flex items-center justify-center gap-3 py-16 text-muted"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-5 animate-spin"
      />
      Chargement...
    </div>

    <form
      v-else
      class="space-y-4"
      @submit.prevent="save"
    >
      <UCard>
        <div class="grid gap-4 sm:grid-cols-2">
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
          <UFormField label="Sous-classe">
            <UInput
              v-model="form.Subclass"
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
          <UFormField label="Historique">
            <UInput
              v-model="form.Background"
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
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold">
            Combat
          </h2>
        </template>
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <UFormField label="PV actuels">
            <UInputNumber
              v-model="form.HitPoints.Current"
              :min="0"
              :max="9999"
            />
          </UFormField>
          <UFormField label="PV max">
            <UInputNumber
              v-model="form.HitPoints.Max"
              :min="0"
              :max="9999"
            />
          </UFormField>
          <UFormField label="PV temporaires">
            <UInputNumber
              v-model="form.HitPoints.Temporary"
              :min="0"
              :max="9999"
            />
          </UFormField>
          <UFormField label="Classe d'armure">
            <UInputNumber
              v-model="form.ArmorClass"
              :min="0"
              :max="40"
            />
          </UFormField>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold">
            Caractéristiques
          </h2>
        </template>
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <UFormField
            v-for="ability in abilities"
            :key="ability.key"
            :label="`${ability.label} (${abilityModifier(form.Abilities[ability.key])})`"
          >
            <UInputNumber
              v-model="form.Abilities[ability.key]"
              :min="1"
              :max="30"
            />
          </UFormField>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold">
            Compétences
          </h2>
        </template>
        <ul class="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          <li
            v-for="key in skillKeysSorted"
            :key="key"
            class="flex items-center justify-between gap-3 py-1"
          >
            <span>{{ skillLabels[key] }}</span>
            <span class="flex items-center gap-4">
              <UCheckbox
                label="Maîtrise"
                :model-value="isProficient(key)"
                @update:model-value="setProficient(key, $event === true)"
              />
              <UCheckbox
                label="Expertise"
                :model-value="form.SkillExpertise.includes(key)"
                @update:model-value="setExpertise(key, $event === true)"
              />
            </span>
          </li>
        </ul>
      </UCard>

      <UCard>
        <UFormField
          label="Pièces d'or"
          description="Deux décimales au maximum."
        >
          <UInputNumber
            v-model="form.Gold"
            :min="0"
            :max="999999999.99"
            :step="0.01"
            :format-options="{ minimumFractionDigits: 2, maximumFractionDigits: 2 }"
          />
        </UFormField>
      </UCard>

      <UCard>
        <UFormField
          label="Sorts"
          :description="`${form.Spells.length} sort(s) sélectionné(s)`"
        >
          <USelectMenu
            v-model="form.Spells"
            :items="spellList?.spells ?? []"
            value-key="id"
            label-key="Name"
            multiple
            :loading="spellsStatus === 'pending'"
            placeholder="Rechercher un sort..."
            class="w-full"
          />
        </UFormField>
      </UCard>

      <UCard>
        <UFormField label="Notes">
          <UTextarea
            v-model="form.Notes"
            class="w-full"
            :rows="5"
            maxlength="5000"
          />
        </UFormField>
      </UCard>

      <UAlert
        v-if="saveError"
        color="error"
        variant="subtle"
        :description="saveError"
      />

      <div class="flex items-center justify-between gap-3">
        <UButton
          color="error"
          variant="outline"
          icon="i-lucide-trash-2"
          @click="confirmDelete = true"
        >
          Supprimer
        </UButton>
        <UButton
          type="submit"
          icon="i-lucide-save"
          :loading="saving"
          :disabled="!form.Name.trim() || !form.Class.trim()"
        >
          Enregistrer
        </UButton>
      </div>
    </form>

    <UModal
      v-model:open="confirmDelete"
      title="Supprimer ce personnage ?"
      description="Cette action est définitive."
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
const route = useRoute()
const id = String(route.params.id)
const api = useCharactersApi()
const toast = useToast()

const { data, error } = useFetch<Character>(`${api.base}/${id}`, { ...api.options, key: `character-${id}` })

// Copie locale éditable de la fiche
const form = ref<Character>()
watch(data, (character) => {
  if (character) {
    form.value = {
      ...structuredClone(toRaw(character)),
      Gold: character.Gold ?? 0,
      Spells: character.Spells ?? [],
      SkillProficiencies: character.SkillProficiencies ?? [],
      SkillExpertise: character.SkillExpertise ?? []
    }
  }
}, { immediate: true })

const { data: spellList, status: spellsStatus } = useSpellList()

// L'expertise implique la maîtrise : la cocher coche la maîtrise ; décocher la maîtrise retire l'expertise
const isProficient = (key: string) =>
  !!form.value && (form.value.SkillProficiencies!.includes(key) || form.value.SkillExpertise!.includes(key))

function toggle(list: string[], key: string, on: boolean) {
  const without = list.filter(k => k !== key)
  return on ? [...without, key] : without
}

function setProficient(key: string, on: boolean) {
  if (!form.value) return
  form.value.SkillProficiencies = toggle(form.value.SkillProficiencies!, key, on)
  if (!on) form.value.SkillExpertise = toggle(form.value.SkillExpertise!, key, false)
}

function setExpertise(key: string, on: boolean) {
  if (!form.value) return
  form.value.SkillExpertise = toggle(form.value.SkillExpertise!, key, on)
  if (on) form.value.SkillProficiencies = toggle(form.value.SkillProficiencies!, key, true)
}

const saving = ref(false)
const saveError = ref('')

async function save() {
  if (!form.value) return
  saving.value = true
  saveError.value = ''
  const { Name, Class, Subclass, Species, Background, Level, ArmorClass, Abilities, HitPoints, Notes, Gold, Spells, SkillProficiencies, SkillExpertise } = form.value
  try {
    const updated = await api.update(id, {
      Name, Class, Subclass, Species: Species ?? '', Background, Level, ArmorClass, Abilities, HitPoints, Notes,
      // Arrondi au centième : évite les erreurs de flottants du champ numérique
      Gold: Math.round((Gold ?? 0) * 100) / 100,
      Spells, SkillProficiencies, SkillExpertise
    })
    data.value = updated
    // La liste doit être rechargée pour refléter les modifications
    await clearNuxtData('characters')
    toast.add({ title: 'Personnage enregistré', color: 'success', icon: 'i-lucide-check' })
    await navigateTo(`/personnages/${id}`)
  } catch (e) {
    saveError.value = (e as { data?: { details?: string[] } }).data?.details?.join(' ') ?? 'Enregistrement impossible, réessayez.'
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
    await clearNuxtData('characters')
    await navigateTo('/personnages')
  } catch {
    confirmDelete.value = false
    saveError.value = 'Suppression impossible, réessayez.'
  } finally {
    deleting.value = false
  }
}

useHead({ title: () => form.value ? `Modifier ${form.value.Name}` : 'Modifier le personnage' })
</script>
