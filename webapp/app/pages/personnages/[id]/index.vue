<template>
  <div class="mx-auto max-w-3xl p-4 pt-[calc(var(--safe-top)+1rem)] pb-[calc(var(--bottom-nav-height)+1rem)] md:p-8 lg:pt-8 lg:pb-8">
    <UButton
      to="/personnages"
      color="neutral"
      variant="link"
      icon="i-lucide-arrow-left"
      class="-ml-2 mb-4"
    >
      Personnages
    </UButton>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      :title="error.statusCode === 404 ? 'Personnage introuvable' : 'Impossible de charger le personnage'"
      :description="error.message"
    />
    <div
      v-else-if="!character"
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
      class="space-y-4"
    >
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <h1 class="truncate text-2xl font-bold">
            {{ character.Name }}
          </h1>
          <UButton
            :to="`/personnages/${id}/edit`"
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-pencil"
            aria-label="Modifier le personnage"
            title="Modifier le personnage"
            class="shrink-0"
          />
        </div>
        <p class="text-muted">
          {{ [character.Species, character.Class, character.Subclass].filter(Boolean).join(' · ') }}
          · Niveau {{ character.Level }}
        </p>
        <p
          v-if="character.Background"
          class="text-sm text-muted"
        >
          Historique : {{ character.Background }}
        </p>
      </div>

    <dl class="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <button
        type="button"
        class="rounded-lg border border-default p-3 text-center transition-colors hover:bg-elevated"
        :class="hitPointsAnimation && `hp-${hitPointsAnimation}`"
        @click="openHitPoints"
        @animationend="hitPointsAnimation = undefined"
      >
        <dt class="text-sm text-muted">
          Points de vie
        </dt>
        <dd class="text-2xl font-semibold">
          {{ character.HitPoints.Current }}/{{ character.HitPoints.Max }}<span
            v-if="character.HitPoints.Temporary > 0"
            class="text-warning"
          >+{{ character.HitPoints.Temporary }}</span>
        </dd>
      </button>
      <div
        v-for="stat in combatStats"
        :key="stat.label"
        class="rounded-lg border border-default p-3 text-center"
      >
        <dt class="text-sm text-muted">
          {{ stat.label }}
        </dt>
        <dd class="text-2xl font-semibold">
          {{ stat.value }}
        </dd>
      </div>
    </dl>

      <USelect
        v-model="section"
        :items="sections"
        :icon="sectionIcon"
        class="w-full"
        aria-label="Section de la fiche"
      />

      <div v-show="section === 'abilities'">
        <dl class="mt-4 grid grid-cols-3 gap-x-3 gap-y-6 pb-3 sm:grid-cols-6">
          <div
            v-for="ability in abilities"
            :key="ability.key"
            role="button"
            tabindex="0"
            class="relative mx-auto aspect-[100/104] w-full max-w-28 cursor-pointer transition-transform hover:scale-105"
            @click="openAbilityRoll(ability)"
            @keydown.enter="openAbilityRoll(ability)"
          >
            <!-- Écusson : coins arrondis, pointe douce en bas, double filet -->
            <svg
              viewBox="0 0 100 104"
              class="absolute inset-0 size-full overflow-visible"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M16 2H84Q98 2 98 16V78Q98 84 92 87L56 101Q50 104 44 101L8 87Q2 84 2 78V16Q2 2 16 2Z"
                class="fill-(--ui-bg) stroke-(--ui-border-accented)"
                stroke-width="2.5"
                stroke-linejoin="round"
                vector-effect="non-scaling-stroke"
              />
              <path
                d="M18 8H82Q92 8 92 18V75Q92 79 89 81L53 95Q50 96 47 95L11 81Q8 79 8 75V18Q8 8 18 8Z"
                class="stroke-(--ui-border-accented)"
                stroke-width="1"
                stroke-linejoin="round"
                opacity="0.6"
                vector-effect="non-scaling-stroke"
              />
            </svg>
            <div class="absolute inset-x-0 bottom-[14%] top-[6%] flex flex-col items-center justify-center px-2">
              <dt class="max-w-full truncate text-[0.6rem] font-bold uppercase tracking-wider text-muted">
                {{ ability.label }}
              </dt>
              <dd class="mt-1 font-serif text-3xl font-bold leading-none">
                {{ abilityModifier(character.Abilities[ability.key]) }}
              </dd>
              <dd
                v-if="character.SavingThrows"
                class="mt-1.5 flex items-center gap-1 text-[0.65rem] text-muted"
                :title="character.SavingThrows[ability.key].Proficient ? 'Jet de sauvegarde maîtrisé' : 'Jet de sauvegarde'"
              >
                <span
                  class="size-1.5 shrink-0 rounded-full border border-accented"
                  :class="{ 'border-primary bg-primary': character.SavingThrows[ability.key].Proficient }"
                />
                JdS {{ signed(character.SavingThrows[ability.key].Bonus) }}
              </dd>
            </div>
            <dd class="absolute -bottom-3 left-1/2 min-w-10 -translate-x-1/2 rounded-full border-2 border-accented bg-default px-2 py-0.5 text-center text-sm font-semibold">
              {{ character.Abilities[ability.key] }}
            </dd>
          </div>
        </dl>

        <section
          v-if="skillGroups.length"
          class="mt-8"
        >
          <h3 class="mb-2 text-sm font-semibold uppercase tracking-wider text-muted">
            Compétences
          </h3>
          <div class="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            <div
              v-for="group in skillGroups"
              :key="group.ability.key"
            >
              <h4 class="mb-1 flex items-baseline justify-between border-b-2 border-accented pb-1 text-xs font-bold uppercase tracking-wider">
                {{ group.ability.label }}
                <span class="text-muted">{{ group.ability.short }}</span>
              </h4>
              <ul>
                <li
                  v-for="skill in group.skills"
                  :key="skill.Key"
                  class="border-b border-default"
                >
                  <button
                    type="button"
                    class="flex w-full items-center gap-2 py-1.5 text-left transition-colors hover:bg-elevated"
                    @click="openSkillRoll(skill)"
                  >
                    <!-- Pastille : vide = non maîtrisée, pleine = maîtrise, pleine avec anneau = expertise -->
                    <span
                      class="size-3 shrink-0 rounded-full border-2 border-accented"
                      :class="{
                        'border-(--ui-text-highlighted) bg-(--ui-text-highlighted)': skill.Proficiency !== 'none',
                        'ring-2 ring-(--ui-text-highlighted) ring-offset-2 ring-offset-default': skill.Proficiency === 'expertise'
                      }"
                      :title="skill.Proficiency === 'expertise' ? 'Expertise' : skill.Proficiency === 'proficient' ? 'Maîtrise' : undefined"
                    />
                    <span class="w-8 shrink-0 text-right font-semibold tabular-nums">{{ signed(skill.Bonus) }}</span>
                    <span class="min-w-0 flex-1 truncate">{{ skillLabels[skill.Key] }}</span>
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </section>
      </div>

      <div v-show="section === 'spells'">
        <div
          v-if="spellcastingStats.length"
          class="mt-6"
        >
          <p class="mb-2 text-sm text-muted">
            Caractéristique d'incantation : {{ spellcastingAbilityLabel }}
          </p>
          <dl class="grid grid-cols-3 gap-3">
            <div
              v-for="stat in spellcastingStats"
              :key="stat.label"
              class="flex flex-col rounded-lg border border-default p-3 text-center"
            >
              <!-- Le titre prend la hauteur restante : qu'il tienne sur une ou deux lignes, le séparateur
                   et les valeurs restent alignés d'un bloc à l'autre -->
              <dt class="flex flex-1 items-center justify-center pb-2 text-xs text-muted sm:text-sm">
                {{ stat.label }}
              </dt>
              <dd class="border-t border-default pt-2 text-2xl font-semibold">
                {{ stat.value }}
              </dd>
            </div>
          </dl>
        </div>
        <UAlert
          v-if="spellsError"
          color="error"
          variant="subtle"
          class="mt-4"
          title="Impossible de charger les sorts"
          :description="spellsError.message"
        />
        <p
          v-else-if="!character.Spells?.length"
          class="mt-4 rounded-lg border border-dashed border-default py-10 text-center text-muted"
        >
          Aucun sort. Ajoutez-en depuis la modification du personnage.
        </p>
        <div
          v-else-if="spellsStatus === 'pending'"
          class="mt-4 flex items-center justify-center gap-3 py-10 text-muted"
        >
          <UIcon
            name="i-lucide-loader-circle"
            class="size-5 animate-spin"
          />
          Chargement...
        </div>
        <div
          v-else
          class="mt-6 space-y-4"
        >
          <section
            v-for="group in spellGroups"
            :key="group.level"
          >
            <div class="mb-1 flex items-center justify-between gap-3">
              <h3 class="text-sm font-semibold uppercase tracking-wider text-muted">
                {{ group.level === 0 ? 'Tours de magie' : `Niveau ${group.level}` }}
              </h3>
              <!-- Emplacements : une case pleine = disponible, vide = dépensé. Toucher une case la bascule -->
              <div
                v-if="slotTotal(group.level)"
                class="flex items-center gap-1.5"
                role="group"
                :aria-label="`Emplacements de niveau ${group.level}`"
              >
                <button
                  v-for="index in slotTotal(group.level)"
                  :key="index"
                  type="button"
                  class="size-5 rounded-full border-2 border-accented transition-colors"
                  :class="index <= slotsUsed(group.level) ? 'bg-transparent' : 'bg-primary border-primary'"
                  :aria-pressed="index > slotsUsed(group.level)"
                  :aria-label="`Emplacement ${index} : ${index <= slotsUsed(group.level) ? 'dépensé' : 'disponible'}`"
                  @click="toggleSlot(group.level, index)"
                />
              </div>
            </div>
            <ul class="divide-y divide-default rounded-lg border border-default">
              <li
                v-for="spell in group.spells"
                :key="spell.id"
                class="flex items-center justify-between gap-3 px-3 py-2"
              >
                <span class="min-w-0 truncate">{{ spell.Name }}</span>
                <span class="shrink-0 text-sm text-muted">{{ spell.School }}</span>
              </li>
            </ul>
          </section>
        </div>
      </div>

      <div v-show="section === 'inventory'">
        <button
          type="button"
          class="mt-4 flex w-full items-center gap-4 rounded-lg border border-default p-4 text-left transition-colors hover:bg-elevated"
          aria-label="Modifier les pièces d'or"
          @click="openGold"
        >
          <UIcon
            name="i-lucide-coins"
            class="size-8 shrink-0 text-warning"
          />
          <div>
            <p class="text-sm text-muted">
              Pièces d'or
            </p>
            <p class="text-2xl font-semibold tabular-nums">
              {{ formatGold(character.Gold ?? 0) }}
            </p>
          </div>
        </button>
      </div>

      <UCard v-if="character.Notes">
        <template #header>
          <h2 class="font-semibold">
            Notes
          </h2>
        </template>
        <p class="whitespace-pre-wrap">
          {{ character.Notes }}
        </p>
      </UCard>
    </div>

    <UModal
      v-model:open="rollOpen"
      :title="roll?.title ?? 'Jet'"
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
            v-if="roll && rollValue"
            class="space-y-3"
          >
            <p
              v-for="line in roll.lines"
              :key="line.label"
              class="text-center"
            >
              <span
                v-if="roll.lines.length > 1"
                class="block text-xs uppercase tracking-wider text-muted"
              >{{ line.label }}</span>
              <span class="text-3xl font-bold tabular-nums">{{ rollValue + line.bonus }}</span>
              <span class="block text-sm text-muted tabular-nums">
                {{ rollValue }} {{ line.bonus < 0 ? '−' : '+' }} {{ Math.abs(line.bonus) }}
              </span>
            </p>
          </div>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="goldOpen"
      title="Pièces d'or"
      :ui="{ content: 'max-w-xs' }"
    >
      <template #body>
        <form
          class="space-y-3"
          @submit.prevent="saveGold"
        >
          <UInputNumber
            v-model="goldAmount"
            :min="0"
            :max="999999999.99"
            :step="0.01"
            :format-options="{ minimumFractionDigits: 2, maximumFractionDigits: 2 }"
            :disabled="savingGold"
            aria-label="Montant en pièces d'or"
            class="w-full"
            autofocus
          />
          <!-- Suggestions : ajustent le montant du champ, l'enregistrement reste à valider -->
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="suggestion in goldSuggestions"
              :key="suggestion.label"
              type="button"
              color="neutral"
              variant="outline"
              size="sm"
              :disabled="savingGold"
              @click="applyGoldSuggestion(suggestion)"
            >
              {{ suggestion.label }}
            </UButton>
          </div>
          <p
            v-if="goldError"
            class="text-sm text-error"
          >
            {{ goldError }}
          </p>
          <UButton
            type="submit"
            icon="i-lucide-check"
            block
            aria-label="Enregistrer"
            title="Enregistrer"
            :loading="savingGold"
            :disabled="goldAmount === undefined"
          />
        </form>
      </template>
    </UModal>

    <UModal
      v-model:open="hitPointsOpen"
      title="Points de vie"
      :ui="{ header: 'hidden', content: 'max-w-xs' }"
    >
      <template #body>
        <div class="space-y-3">
          <UInputNumber
            v-model="amount"
            :min="1"
            :max="9999"
            :disabled="applying"
            aria-label="Montant"
            class="w-full"
            @keydown.enter="apply('damage')"
          />
          <div class="grid grid-cols-3 gap-2">
            <UButton
              color="error"
              icon="i-lucide-swords"
              block
              aria-label="Infliger des dégâts"
              title="Infliger des dégâts"
              :loading="applying"
              :disabled="!amount"
              @click="apply('damage')"
            />
            <UButton
              color="success"
              icon="i-lucide-heart-pulse"
              block
              aria-label="Soigner"
              title="Soigner"
              :loading="applying"
              :disabled="!amount"
              @click="apply('heal')"
            />
            <UButton
              color="warning"
              icon="i-lucide-shield-plus"
              block
              aria-label="Gagner des PV temporaires"
              title="Gagner des PV temporaires"
              :loading="applying"
              :disabled="!amount"
              @click="apply('temp')"
            />
          </div>
        </div>
        <p
          v-if="hitPointsError"
          class="mt-2 text-sm text-error"
        >
          {{ hitPointsError }}
        </p>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
const id = String(useRoute().params.id)
const api = useCharactersApi()
const toast = useToast()

const { data: character, error } = useFetch<Character>(`${api.base}/${id}`, { ...api.options, key: `character-${id}` })

// Sections de la fiche, choisies dans la liste déroulante. Combat, Aptitudes, Inventaire et Infos diverses
// sont des emplacements vides, à remplir plus tard.
const sections = [
  { label: 'Caractéristiques', value: 'abilities', icon: 'i-lucide-shield' },
  { label: 'Combat', value: 'combat', icon: 'i-lucide-swords' },
  { label: 'Sorts', value: 'spells', icon: 'i-lucide-wand-sparkles' },
  { label: 'Aptitudes', value: 'features', icon: 'i-lucide-sparkles' },
  { label: 'Inventaire', value: 'inventory', icon: 'i-lucide-backpack' },
  { label: 'Infos diverses', value: 'misc', icon: 'i-lucide-info' }
]
const section = ref('abilities')
// Icône de la section choisie, affichée dans le champ fermé
const sectionIcon = computed(() => sections.find(item => item.value === section.value)?.icon)

const { data: spellList, status: spellsStatus, error: spellsError } = useSpellList()

// Sorts du personnage, regroupés par niveau (la liste du compendium est déjà triée par niveau puis par nom)
const spellGroups = computed(() => {
  const owned = new Set(character.value?.Spells ?? [])
  const groups: { level: number, spells: SpellSummary[] }[] = []
  for (const spell of spellList.value?.spells ?? []) {
    if (!owned.has(spell.id)) continue
    const group = groups.find(g => g.level === spell.Level)
    if (group) group.spells.push(spell)
    else groups.push({ level: spell.Level, spells: [spell] })
  }
  return groups
})

// Compétences regroupées par caractéristique (dans l'ordre de la feuille), puis par ordre alphabétique français.
// Les caractéristiques sans compétence (Constitution) n'ont pas de groupe.
const skillGroups = computed(() =>
  abilities
    .map(ability => ({
      ability,
      skills: skillKeysSorted
        .map(key => character.value?.Skills?.find(skill => skill.Key === key))
        .filter((skill): skill is SkillStat => skill?.Ability === ability.key)
    }))
    .filter(group => group.skills.length)
)

const slotTotal = (level: number) => character.value?.Spellcasting?.SpellSlots[level] ?? 0
const slotsUsed = (level: number) => Math.min(character.value?.SpellSlotsUsed?.[level] ?? 0, slotTotal(level))

// Toucher une case disponible dépense les emplacements jusqu'à elle ; toucher une case dépensée la libère
// (et les suivantes). Mise à jour immédiate, annulée si l'enregistrement échoue.
async function toggleSlot(level: number, index: number) {
  if (!character.value) return
  const previous = character.value.SpellSlotsUsed ?? {}
  const next = { ...previous, [level]: index <= slotsUsed(level) ? index - 1 : index }
  character.value = { ...character.value, SpellSlotsUsed: next }
  try {
    await api.update(id, { SpellSlotsUsed: next })
  } catch {
    character.value = { ...character.value, SpellSlotsUsed: previous }
    toast.add({ title: 'Enregistrement impossible', color: 'error', icon: 'i-lucide-triangle-alert' })
  }
}

const spellcastingAbilityLabel = computed(() =>
  abilities.find(a => a.key === character.value?.Spellcasting?.Ability)?.label
)

const spellcastingStats = computed(() => {
  const spellcasting = character.value?.Spellcasting
  if (!spellcasting) return []
  return [
    { label: 'Modificateur', value: signed(spellcasting.Modifier) },
    { label: 'DD de sauvegarde', value: spellcasting.SaveDC },
    { label: 'Bonus d\'attaque', value: signed(spellcasting.AttackBonus) }
  ]
})

const combatStats = computed(() => {
  const bonus = character.value?.ProficiencyBonus
  return [
    { label: 'Classe d\'armure', value: character.value?.ArmorClass ?? 0 },
    { label: 'Bonus de maîtrise', value: bonus === undefined ? '' : `+${bonus}` }
  ]
})

// Jets : on saisit le résultat du d20 (1 à 20) et la modale affiche le total avec chaque bonus applicable
const { diceMode } = useDiceMode()
const rollOpen = ref(false)
const roll = ref<{ title: string, lines: { label: string, bonus: number }[] }>()
const rollValue = ref<number>()

function openRoll(title: string, lines: { label: string, bonus: number }[]) {
  roll.value = { title, lines }
  // Mode application : le d20 est tiré tout de suite, sans rien demander au joueur
  rollValue.value = diceMode.value === 'app' ? rollD20() : undefined
  rollOpen.value = true
}

const openSkillRoll = (skill: SkillStat) =>
  openRoll(`${skillLabels[skill.Key]} (${signed(skill.Bonus)})`, [{ label: 'Compétence', bonus: skill.Bonus }])

function openAbilityRoll(ability: typeof abilities[number]) {
  if (!character.value) return
  const modifier = abilityModifierValue(character.value.Abilities[ability.key])
  const lines = [{ label: 'Caractéristique', bonus: modifier }]
  const save = character.value.SavingThrows?.[ability.key]
  if (save) lines.push({ label: 'Jet de sauvegarde', bonus: save.Bonus })
  openRoll(`${ability.label} (${signed(modifier)})`, lines)
}

// Édition directe du montant d'or (valeur absolue, 2 décimales)
const goldOpen = ref(false)
const goldAmount = ref<number>()
const savingGold = ref(false)
const goldError = ref('')

function openGold() {
  goldAmount.value = character.value?.Gold ?? 0
  goldError.value = ''
  goldOpen.value = true
}

// « delta » ajoute au montant du champ (jamais sous 0) ; sans delta, le montant est remis à zéro
const goldSuggestions = [
  { label: 'Vider' },
  { label: '−10', delta: -10 },
  { label: '−1', delta: -1 },
  { label: '+1', delta: 1 },
  { label: '+10', delta: 10 }
]

function applyGoldSuggestion({ delta }: { delta?: number }) {
  const next = delta === undefined ? 0 : (goldAmount.value ?? 0) + delta
  goldAmount.value = Math.max(0, Math.round(next * 100) / 100)
}

async function saveGold() {
  if (goldAmount.value === undefined) return
  savingGold.value = true
  goldError.value = ''
  try {
    // Arrondi au centième : évite les erreurs de flottants du champ numérique
    character.value = await api.update(id, { Gold: Math.round(goldAmount.value * 100) / 100 })
    goldOpen.value = false
  } catch {
    goldError.value = 'Enregistrement impossible, réessayez.'
  } finally {
    savingGold.value = false
  }
}

const hitPointsOpen = ref(false)
const amount = ref<number>(1)
const applying = ref(false)
const hitPointsError = ref('')
// Animation jouée sur la tuile des PV après un changement (retirée à la fin de l'animation)
const hitPointsAnimation = ref<'damage' | 'heal' | 'temp'>()

function openHitPoints() {
  amount.value = 1
  hitPointsError.value = ''
  hitPointsOpen.value = true
}

// Règles D&D : les dégâts épuisent d'abord les PV temporaires puis les PV actuels (jamais sous 0) ;
// les soins montent jusqu'au maximum et n'affectent pas les PV temporaires ;
// les PV temporaires ne se cumulent pas (on garde le plus élevé).
async function apply(kind: 'damage' | 'heal' | 'temp') {
  if (!character.value || !amount.value) return
  const { Current, Max, Temporary } = character.value.HitPoints
  let next = { Current, Temporary }
  if (kind === 'damage') {
    const absorbed = Math.min(Temporary, amount.value)
    next = { Temporary: Temporary - absorbed, Current: Math.max(0, Current - (amount.value - absorbed)) }
  } else if (kind === 'heal') {
    next = { Temporary, Current: Math.min(Max, Current + amount.value) }
  } else {
    // Les PV temporaires ne se cumulent pas : on garde la valeur la plus haute entre l'ancienne et la nouvelle
    next = { Current, Temporary: Math.max(Temporary, amount.value) }
  }

  applying.value = true
  hitPointsError.value = ''
  try {
    character.value = await api.update(id, { HitPoints: next })
    await clearNuxtData('characters')
    hitPointsOpen.value = false
    // Retire puis repose la classe pour rejouer l'animation même si c'est la même que la précédente
    hitPointsAnimation.value = undefined
    await nextTick()
    hitPointsAnimation.value = kind
  } catch {
    hitPointsError.value = 'Mise à jour impossible, réessayez.'
  } finally {
    applying.value = false
  }
}

useHead({ title: () => character.value?.Name ?? 'Personnage' })
</script>

<style scoped>
.hp-damage {
  animation: hp-damage 0.5s ease-out;
}
.hp-heal {
  animation: hp-heal 0.7s ease-out;
}
.hp-temp {
  animation: hp-temp 0.7s ease-out;
}

@keyframes hp-damage {
  0%, 100% { transform: translateX(0); }
  15%, 45%, 75% { transform: translateX(-5px); }
  30%, 60%, 90% { transform: translateX(5px); }
  0% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--ui-error) 60%, transparent); }
  100% { box-shadow: 0 0 0 10px transparent; }
}

@keyframes hp-heal {
  0% { transform: scale(1); box-shadow: 0 0 0 0 color-mix(in oklab, var(--ui-success) 60%, transparent); }
  30% { transform: scale(1.06); }
  100% { transform: scale(1); box-shadow: 0 0 0 14px transparent; }
}

@keyframes hp-temp {
  0% { transform: scale(1); box-shadow: 0 0 0 0 color-mix(in oklab, var(--ui-warning) 60%, transparent); }
  30% { transform: scale(1.06); }
  100% { transform: scale(1); box-shadow: 0 0 0 14px transparent; }
}

@media (prefers-reduced-motion: reduce) {
  .hp-damage,
  .hp-heal,
  .hp-temp {
    animation: none;
  }
}
</style>
