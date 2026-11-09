<template>
  <ol class="space-y-2">
    <li
      v-for="(entry, index) in entries"
      :key="entry.id"
      ref="items"
      class="flex items-center gap-3 rounded-lg border bg-default p-3"
      :class="[
        entry.id === selfId ? 'border-primary bg-primary/10' : 'border-default',
        drag ? (drag.from === index ? 'relative z-10 shadow-lg' : 'transition-transform') : ''
      ]"
      :style="{ transform: shift(index) }"
    >
      <span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-elevated text-sm font-bold tabular-nums">
        {{ index + 1 }}
      </span>
      <div class="min-w-0 flex-1">
        <p class="truncate font-semibold">
          {{ entry.Name }}
          <span
            v-if="entry.id === selfId"
            class="font-normal text-muted"
          > (vous)</span>
        </p>
        <p class="text-sm text-muted">
          {{ entry.Enemy ? 'Ennemi' : 'Joueur' }}
        </p>
      </div>
      <span
        v-if="entry.Initiative !== undefined"
        class="text-xl font-bold tabular-nums"
      >{{ entry.Initiative }}</span>
      <!-- Retrait d'un ennemi (jamais d'un joueur) -->
      <UButton
        v-if="editable && entry.Enemy"
        color="error"
        variant="ghost"
        size="sm"
        icon="i-lucide-trash-2"
        :aria-label="`Retirer ${entry.Name}`"
        :title="`Retirer ${entry.Name}`"
        class="shrink-0"
        @click="emit('remove', index)"
      />
      <!-- Poignée : glisser pour déplacer ; flèches haut/bas du clavier quand elle a le focus -->
      <button
        v-if="editable"
        type="button"
        class="-mr-1 shrink-0 cursor-grab touch-none rounded p-2 text-muted hover:bg-elevated active:cursor-grabbing"
        :aria-label="`Déplacer ${entry.Name} (position ${index + 1})`"
        @pointerdown="start($event, index)"
        @pointermove="track"
        @pointerup="finish"
        @pointercancel="cancel"
        @keydown.up.prevent="index > 0 && emit('move', index, index - 1)"
        @keydown.down.prevent="index < entries.length - 1 && emit('move', index, index + 1)"
      >
        <UIcon
          name="i-lucide-grip-vertical"
          class="size-5"
        />
      </button>
    </li>
  </ol>
</template>

<script setup lang="ts">
import type { OrderEntry } from '~/composables/useCampaigns'

const props = defineProps<{ entries: OrderEntry[], selfId?: string, editable?: boolean }>()
const emit = defineEmits<{ move: [from: number, to: number], remove: [index: number] }>()

const items = ref<HTMLElement[]>([])

// Glissement en cours : `centers` sont les centres verticaux des lignes au départ, `height` la hauteur de la ligne
// saisie (pas comprise) ; `to` est la position visée d'après la position du pointeur.
const drag = ref<{ from: number, to: number, startY: number, offset: number, centers: number[], height: number }>()

function start(event: PointerEvent, index: number) {
  const rects = items.value.map(item => item.getBoundingClientRect())
  const row = rects[index]
  if (!row) return
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  drag.value = {
    from: index,
    to: index,
    startY: event.clientY,
    offset: 0,
    centers: rects.map(rect => rect.top + rect.height / 2),
    height: row.height + 8
  }
}

function track(event: PointerEvent) {
  const state = drag.value
  if (!state) return
  const offset = event.clientY - state.startY
  const center = state.centers[state.from]! + offset
  // Position visée : la ligne d'origine dont le centre est le plus proche du centre de la ligne saisie
  let to = 0
  state.centers.forEach((value, i) => {
    if (Math.abs(value - center) < Math.abs(state.centers[to]! - center)) to = i
  })
  drag.value = { ...state, offset, to }
}

function finish() {
  const state = drag.value
  drag.value = undefined
  if (state && state.to !== state.from) emit('move', state.from, state.to)
}

const cancel = () => {
  drag.value = undefined
}

// Décalage visuel : la ligne saisie suit le pointeur, celles qu'elle enjambe s'écartent
function shift(index: number) {
  const state = drag.value
  if (!state || !props.editable) return undefined
  if (index === state.from) return `translateY(${state.offset}px)`
  if (state.from < state.to && index > state.from && index <= state.to) return `translateY(${-state.height}px)`
  if (state.from > state.to && index < state.from && index >= state.to) return `translateY(${state.height}px)`
  return undefined
}
</script>
