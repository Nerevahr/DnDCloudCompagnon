<template>
  <div v-if="resource">
    <div class="mb-4 flex items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold">
        {{ resource.label }}
      </h1>
      <span
        v-if="rows.length"
        class="text-sm text-muted"
      >{{ filteredRows.length }} résultat(s)</span>
    </div>

    <div class="mb-4 flex items-center gap-2 md:flex-wrap md:gap-3">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Rechercher..."
        size="sm"
        class="min-w-0 flex-1 md:w-full md:max-w-sm md:flex-none"
      />
      <USelectMenu
        v-for="filter in filterOptions"
        :key="`${resource.slug}-${filter.key}`"
        v-model="filters[filter.key]"
        :items="filter.options"
        multiple
        :placeholder="filter.label"
        size="sm"
        class="w-24 shrink-0 md:w-44"
      />
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      title="Impossible de charger les données"
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
    <div v-else>
      <UTable
        v-model:global-filter="search"
        :data="filteredRows"
        :columns="columns"
        :meta="tableMeta"
        class="rounded-lg border border-default"
        @select="onSelect"
      />
    </div>

    <!-- Volet de détail : occupe toute la hauteur du body et glisse depuis la droite -->
    <Teleport
      to="#compendium-drawer"
      defer
    >
      <Transition name="drawer">
        <div
          v-if="selected"
          class="pointer-events-auto h-full"
        >
          <ResourceDetail
            :key="`${resource.slug}-${selected.id}`"
            :resource="resource"
            :id="String(selected.id)"
            :summary-name="String(selected.Name)"
            class="h-full overflow-y-auto rounded-none shadow-2xl"
            @close="selected = undefined"
          />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const config = useRuntimeConfig()
const search = ref('')

const resource = computed(() => resourceTypes.find(t => t.slug === route.params.type))

if (!resource.value) {
  throw createError({ statusCode: 404, statusMessage: 'Type de ressource inconnu', fatal: true })
}

const { data, status, error } = useLazyFetch<Record<string, Record<string, unknown>[]>>(
  () => `${config.public.apiBase}/api/v1/${resource.value!.apiPath ?? resource.value!.slug}`,
  { query: computed(() => ({ sort: resource.value!.sort })), key: () => `compendium-${route.params.type}`, watch: [() => route.params.type] }
)

const UButton = resolveComponent('UButton')

const columns = computed(() =>
  (resource.value?.columns ?? []).map(c => ({
    accessorKey: c.key,
    // Mobile : colonnes masquées ou paddings réduits pour éviter le scroll horizontal
    meta: {
      class: c.hideOnMobile
        ? { th: 'hidden md:table-cell', td: 'hidden md:table-cell' }
        : { th: 'px-2 md:px-4', td: 'px-2 whitespace-normal md:px-4 md:whitespace-nowrap' }
    },
    cell: c.mobileSubKey
      ? ({ row }: { row: any }) => h('div', [
          h('div', String(row.original[c.key] ?? '')),
          h('div', { class: 'text-xs italic text-muted md:hidden' }, String(row.original[c.mobileSubKey!] ?? ''))
        ])
      : undefined,
    header: c.sortable
      ? ({ column }: { column: any }) => {
          const sorted = column.getIsSorted()
          return h(UButton, {
            color: 'neutral',
            variant: 'ghost',
            class: '-mx-2.5 px-2.5',
            icon: sorted === 'asc'
              ? 'i-lucide-arrow-up-narrow-wide'
              : sorted === 'desc' ? 'i-lucide-arrow-down-wide-narrow' : 'i-lucide-arrow-up-down',
            onClick: () => column.toggleSorting(sorted === 'asc')
          }, () => [
            h('span', { class: 'md:hidden' }, c.shortLabel ?? c.label),
            h('span', { class: 'hidden md:inline' }, c.label)
          ])
        }
      : c.label
  }))
)

const rows = computed(() =>
  (data.value?.[resource.value!.listKey] ?? [])
    .filter(row => resource.value!.rowFilter?.(row) ?? true)
    .map(formatRow)
)

// Filtres : une sélection multiple de valeurs par colonne filtrable
const filters = reactive<Record<string, (string | number)[]>>({})

// Valeurs d'une cellule : liste jointe par ", " pour les colonnes multi-valeurs
const cellValues = (row: Record<string, unknown>, column: ResourceColumn) =>
  column.multiValue
    ? String(row[column.key] ?? '').split(', ').filter(Boolean)
    : [row[column.key] as string | number]

const filterableColumns = computed(() => (resource.value?.columns ?? []).filter(c => c.filterable))

const filterOptions = computed(() =>
  filterableColumns.value.map(c => ({
    key: c.key,
    label: c.label,
    options: [...new Set(rows.value.flatMap(r => cellValues(r, c)))]
      .filter(v => v !== '')
      .sort((a, b) => (a > b ? 1 : a < b ? -1 : 0))
  }))
)

const filteredRows = computed(() =>
  rows.value.filter(row =>
    filterableColumns.value.every((column) => {
      const selectedValues = filters[column.key]
      return !selectedValues?.length || cellValues(row, column).some(v => selectedValues.includes(v))
    })
  )
)

const selected = ref<Record<string, unknown>>()

const onSelect = (_event: Event, row: { original: Record<string, unknown> }) => {
  selected.value = row.original
}

const tableMeta = {
  class: {
    tr: (row: { original: Record<string, unknown> }) =>
      row.original.id === selected.value?.id ? 'bg-elevated' : 'cursor-pointer'
  }
}

watch(() => route.params.type, () => {
  search.value = ''
  Object.keys(filters).forEach(key => delete filters[key])
  selected.value = undefined
})

useHead({ title: () => resource.value?.label ?? 'Compendium' })
</script>

<style scoped>
.drawer-enter-active {
  transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.3s ease;
}
.drawer-leave-active {
  transition: transform 0.22s ease-in, opacity 0.22s ease-in;
}
.drawer-enter-from,
.drawer-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
