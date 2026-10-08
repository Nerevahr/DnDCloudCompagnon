<template>
  <UApp>
    <VitePwaManifest />
    <NuxtRouteAnnouncer />
    <UHeader
      class="hidden pt-[env(safe-area-inset-top)] lg:block"
      :toggle="false"
      :ui="{ container: 'max-w-none' }"
    >
      <template #left>
        <NuxtLink
          to="/"
          class="text-lg font-bold"
        >
          <span class="lg:hidden">D</span>
          <span class="hidden lg:inline">DnD Cloud Compagnon</span>
        </NuxtLink>
        <USeparator
          orientation="vertical"
          class="mx-4 h-6"
        />
        <UNavigationMenu
          :items="menu"
          :ui="{ linkLabel: 'hidden lg:inline' }"
        />
      </template>

    </UHeader>
    <UMain>
      <NuxtPage />
    </UMain>

    <nav class="fixed inset-x-0 bottom-0 z-50 grid h-(--bottom-nav-height) grid-cols-4 border-t border-default bg-default pb-(--bottom-nav-pad) lg:hidden">
      <NuxtLink
        v-for="item in bottomMenu"
        :key="item.label"
        :to="item.to"
        :aria-disabled="!item.to"
        class="flex flex-col items-center justify-center gap-1 text-xs"
        :class="[
          item.to && route.path.startsWith(item.to) ? 'text-primary' : 'text-muted',
          item.to ? '' : 'pointer-events-none'
        ]"
      >
        <UIcon
          :name="item.icon"
          class="size-5"
        />
        {{ item.label }}
      </NuxtLink>
    </nav>
  </UApp>
</template>

<script setup lang="ts">
const route = useRoute()

const menu = computed(() => [
  {
    label: 'Compendium',
    icon: 'i-lucide-book-open',
    to: '/compendium',
    active: route.path.startsWith('/compendium')
  },
  {
    label: 'Cartes',
    icon: 'i-lucide-map',
    to: '/cartes',
    active: route.path.startsWith('/cartes')
  },
  {
    label: 'Réglages',
    icon: 'i-lucide-settings',
    to: '/settings',
    active: route.path.startsWith('/settings')
  }
])

// Bottom menu mobile : seul le compendium est actif, les autres entrées sont des placeholders
const bottomMenu = [
  { label: 'Compendium', icon: 'i-lucide-book-open', to: '/compendium' },
  { label: 'Soon', icon: 'i-lucide-users', to: undefined },
  { label: 'Soon', icon: 'i-lucide-map', to: undefined },
  { label: 'Réglages', icon: 'i-lucide-settings', to: '/settings' }
]
</script>
