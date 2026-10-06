<template>
  <UCard>
    <template #header>
      <div class="flex items-start justify-between gap-2">
        <h2 class="text-lg font-semibold">
          {{ summaryName }}
        </h2>
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Fermer"
          @click="emit('close')"
        />
      </div>
    </template>

    <div
      v-if="status === 'pending'"
      class="flex items-center justify-center gap-3 py-8 text-muted"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-5 animate-spin"
      />
      Chargement...
    </div>
    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      title="Impossible de charger le détail"
      :description="error.message"
    />
    <div
      v-else-if="detail"
      class="space-y-4"
    >
      <p
        v-if="subtitle"
        class="italic"
      >
        {{ subtitle }}
      </p>
      <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <template
          v-for="field in fields"
          :key="field.key"
        >
          <dt class="text-muted">
            {{ field.label }}
          </dt>
          <dd>{{ field.value }}</dd>
        </template>
      </dl>
      <div
        v-if="detail.Description"
        class="space-y-2 text-sm"
      >
        <p
          v-for="(paragraph, i) in paragraphs"
          :key="i"
        >
          <template
            v-for="(part, j) in paragraph"
            :key="j"
          >
            <strong v-if="part.bold">{{ part.text }}</strong>
            <template v-else>
              {{ part.text }}
            </template>
          </template>
        </p>
      </div>
      <div
        v-if="extras.length"
        class="space-y-2 text-sm"
      >
        <p
          v-for="extra in extras"
          :key="extra.key"
        >
          <strong>{{ extra.label }}.</strong> {{ extra.value }}
        </p>
      </div>
      <div
        v-if="tags.length"
        class="flex flex-wrap gap-2"
      >
        <UBadge
          v-for="tag in tags"
          :key="tag"
          :label="tag"
          color="neutral"
          variant="subtle"
        />
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
const props = defineProps<{
  resource: ResourceType
  id: string
  summaryName: string
}>()
const emit = defineEmits<{ close: [] }>()

const config = useRuntimeConfig()

const { data, status, error } = useLazyFetch<Record<string, unknown>>(
  () => `${config.public.apiBase}/api/v1/${props.resource.apiPath ?? props.resource.slug}/${props.id}`,
  { key: () => `compendium-${props.resource.slug}-${props.id}` }
)

const detail = computed(() => (data.value ? formatRow(data.value) : undefined))

// Sorts : "<École> de niveau <niveau> (<classes>)"
const subtitle = computed(() => {
  if (props.resource.slug !== 'spells' || !detail.value) return ''
  const { School, Level, Classes } = detail.value
  return `${String(School).charAt(0).toUpperCase()}${String(School).slice(1).toLowerCase()} de niveau ${Level}${Classes ? ` (${Classes})` : ''}`
})

const fields = computed(() =>
  props.resource.detailFields
    .map(f => ({ ...f, value: f.key === 'Duration' ? withConcentration(detail.value?.[f.key]) : detail.value?.[f.key] }))
    .filter(f => f.value !== undefined && f.value !== '')
)

const extras = computed(() =>
  (props.resource.extraFields ?? [])
    .map(f => ({ ...f, value: detail.value?.[f.key] }))
    .filter(f => f.value !== undefined && f.value !== '')
)

// Un sort à concentration l'indique dans sa durée (ex: "Concentration, 1 minute")
const withConcentration = (duration: unknown) =>
  data.value?.Concentration === true ? ['Concentration', duration].filter(Boolean).join(', ') : duration

const tags = computed(() => {
  const raw = data.value?.Tags
  return Array.isArray(raw) ? (raw as string[]) : []
})

// La description utilise "**texte**" pour le gras et "\n" pour les paragraphes
const paragraphs = computed(() =>
  String(detail.value?.Description ?? '')
    .split('\n')
    .filter(line => line.trim())
    .map(line =>
      line.split('**').map((text, i) => ({ text, bold: i % 2 === 1 })).filter(part => part.text)
    )
)
</script>
