<template>
  <div class="mx-auto max-w-2xl p-4 pt-[calc(var(--safe-top)+1rem)] pb-[calc(var(--bottom-nav-height)+1rem)] md:p-8 lg:pt-8 lg:pb-8">
    <h1 class="mb-6 text-2xl font-bold">
      Réglages
    </h1>

    <UCard>
      <UFormField
        label="Thème"
        description="Choisissez l'apparence de l'application."
      >
        <URadioGroup
          v-model="colorMode.preference"
          :items="themes"
          orientation="horizontal"
          variant="card"
        />
      </UFormField>
    </UCard>

    <UCard class="mt-4">
      <UFormField
        label="Jets de dés"
        description="Qui lance le d20 pour les jets de compétence et de caractéristique."
      >
        <URadioGroup
          v-model="diceModel"
          :items="diceModes"
          variant="card"
        />
      </UFormField>
    </UCard>

    <UCard class="mt-4">
      <UFormField
        label="Compte"
        description="Fermer la session sur cet appareil."
      >
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-log-out"
          @click="logout"
        >
          Se déconnecter
        </UButton>
      </UFormField>
    </UCard>
  </div>
</template>

<script setup lang="ts">
const colorMode = useColorMode()
const { logout } = useAuth()
const { diceMode, setDiceMode } = useDiceMode()

const diceModes = [
  { label: 'Manuel', description: 'Je lance mes dés et je saisis le résultat.', value: 'manual' },
  { label: 'Dans l\'application', description: 'L\'application tire le d20 à ma place.', value: 'app' }
]
const diceModel = computed({
  get: () => diceMode.value,
  set: (value: DiceMode) => setDiceMode(value)
})

const themes = [
  { label: 'Système', value: 'system' },
  { label: 'Clair', value: 'light' },
  { label: 'Sombre', value: 'dark' }
]
</script>
