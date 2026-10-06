<template>
  <!-- La hauteur est fixée à l'écran : le menu et le corps défilent indépendamment -->
  <div class="relative flex h-[calc(100vh-var(--ui-header-height))] overflow-hidden">
    <!-- Mobile : icônes seules ; à partir de md : icônes + libellés -->
    <aside class="w-14 shrink-0 overflow-y-auto border-r border-default p-2 md:w-60 md:p-4">
      <UNavigationMenu
        :items="links"
        orientation="vertical"
        :ui="{ linkLabel: 'hidden md:inline' }"
      />
    </aside>
    <section class="min-w-0 flex-1 overflow-y-auto p-4 md:p-8">
      <NuxtPage />
    </section>
    <!-- Point d'ancrage du volet de détail (alimenté par les pages enfants via Teleport) -->
    <div
      id="compendium-drawer"
      class="pointer-events-none absolute inset-y-0 right-0 z-30 w-full max-w-sm"
    />
  </div>
</template>

<script setup lang="ts">
const links = resourceTypes.map(type => ({
  label: type.label,
  icon: type.icon,
  to: `/compendium/${type.slug}`
}))
</script>
