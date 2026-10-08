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
  </div>
</template>

<script setup lang="ts">
const colorMode = useColorMode()

const themes = [
  { label: 'Système', value: 'system' },
  { label: 'Clair', value: 'light' },
  { label: 'Sombre', value: 'dark' }
]
</script>
