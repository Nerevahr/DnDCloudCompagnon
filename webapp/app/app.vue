<template>
  <UApp>
    <NuxtRouteAnnouncer />
    <UHeader
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
  }
])
</script>
