<template>
  <UApp>
    <VitePwaManifest />
    <NuxtRouteAnnouncer />
    <UHeader
      v-if="showNav"
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

    <nav
      v-if="showNav"
      class="fixed inset-x-0 bottom-0 z-50 grid h-(--bottom-nav-height) grid-flow-col auto-cols-fr border-t border-default bg-default pb-(--bottom-nav-pad) lg:hidden"
    >
      <NuxtLink
        v-for="(item, i) in bottomMenu"
        :key="item.id ?? item.label + i"
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
// Pas de navigation sur les écrans de connexion
const showNav = computed(() => !['/login', '/auth/callback'].includes(route.path))

// Entrées masquées au build (NUXT_PUBLIC_HIDDEN_MENU) : retirées du menu, pages toujours routables
const hidden = String(useRuntimeConfig().public.hiddenMenu)
  .split(',')
  .map(id => id.trim())
  .filter(Boolean)
const isVisible = (item: { id?: string }) => !item.id || !hidden.includes(item.id)

const menu = computed(() => [
  {
    id: 'compendium',
    label: 'Compendium',
    icon: 'i-lucide-book-open',
    to: '/compendium',
    active: route.path.startsWith('/compendium')
  },
  {
    id: 'cartes',
    label: 'Cartes',
    icon: 'i-lucide-map',
    to: '/cartes',
    active: route.path.startsWith('/cartes')
  },
  {
    id: 'settings',
    label: 'Réglages',
    icon: 'i-lucide-settings',
    to: '/settings',
    active: route.path.startsWith('/settings')
  }
].filter(isVisible))

// Bottom menu mobile : seul le compendium est actif, les autres entrées sont des placeholders
const bottomMenu = [
  { id: 'compendium', label: 'Compendium', icon: 'i-lucide-book-open', to: '/compendium' },
  { label: 'Soon', icon: 'i-lucide-users', to: undefined },
  { label: 'Soon', icon: 'i-lucide-map', to: undefined },
  { id: 'settings', label: 'Réglages', icon: 'i-lucide-settings', to: '/settings' }
].filter(isVisible)
</script>
