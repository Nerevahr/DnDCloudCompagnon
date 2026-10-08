<template>
  <div class="relative flex h-[calc(100dvh-var(--bottom-nav-height))] overflow-hidden lg:h-[calc(100dvh-var(--ui-header-height))]">
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      class="hidden"
      @change="onFile"
    >

    <!-- Volet latéral gauche : déplié (sections) ou replié (rail d'icônes) -->
    <aside
      class="flex shrink-0 flex-col border-r border-default bg-default"
      :class="panelOpen ? 'w-72' : 'w-14'"
    >
      <div
        class="flex-1 overflow-y-auto"
        :class="panelOpen ? 'p-4' : 'flex flex-col items-center gap-2 py-3'"
      >
        <!-- Replié : l'icône bascule l'affichage de la grille -->
        <UButton
          v-if="!panelOpen"
          icon="i-lucide-grid-3x3"
          :color="grid.visible ? 'primary' : 'neutral'"
          :variant="grid.visible ? 'soft' : 'ghost'"
          :aria-pressed="grid.visible"
          aria-label="Afficher/masquer la grille"
          @click="grid.visible = !grid.visible"
        />

        <section v-else>
          <h2 class="mb-3 flex items-center gap-2 text-sm font-semibold">
            <UIcon
              name="i-lucide-grid-3x3"
              class="size-4"
            />
            Grille
            <UButton
              :icon="grid.locked ? 'i-lucide-lock' : 'i-lucide-lock-open'"
              :color="grid.locked ? 'neutral' : 'primary'"
              :variant="grid.locked ? 'ghost' : 'soft'"
              size="xs"
              class="ml-auto"
              :aria-pressed="!grid.locked"
              :aria-label="grid.locked ? 'Déverrouiller la grille (glisser pour la déplacer)' : 'Verrouiller la grille'"
              :title="grid.locked ? 'Grille verrouillée' : 'Grille déverrouillée : glissez sur la carte pour la déplacer'"
              :disabled="!grid.visible"
              @click="grid.locked = !grid.locked"
            />
          </h2>
          <div class="space-y-4">
            <USwitch
              v-model="grid.visible"
              label="Afficher la grille"
            />
            <div class="space-y-2">
              <UButton
                :icon="calibrating ? 'i-lucide-x' : 'i-lucide-crosshair'"
                :label="calibrating ? 'Annuler le calibrage' : 'Calibrer sur une case'"
                color="neutral"
                variant="subtle"
                block
                :disabled="!mapUrl"
                @click="toggleCalibration"
              />
              <UFormField label="Nombre de cases en largeur">
                <UInputNumber
                  v-model="columns"
                  :min="1"
                  :max="500"
                  :step="1"
                  :disabled="!mapUrl"
                  class="w-full"
                />
              </UFormField>
            </div>
          </div>
        </section>
      </div>

      <!-- Bouton replier / déplier, en bas du volet -->
      <div
        class="border-t border-default p-2"
        :class="panelOpen ? 'flex justify-end' : 'flex justify-center'"
      >
        <UButton
          :icon="panelOpen ? 'i-lucide-chevrons-right' : 'i-lucide-chevrons-left'"
          color="neutral"
          variant="ghost"
          :aria-label="panelOpen ? 'Replier le volet' : 'Déplier le volet'"
          @click="panelOpen = !panelOpen"
        />
      </div>
    </aside>

    <div class="relative min-w-0 flex-1">
    <!-- Aucune carte : zone d'import -->
    <div
      v-if="!mapUrl"
      class="flex h-full items-center justify-center p-4"
      @dragover.prevent
      @drop.prevent="onDrop"
    >
      <button
        type="button"
        class="flex w-full max-w-md flex-col items-center gap-3 rounded-xl border-2 border-dashed border-default p-10 text-muted transition hover:border-primary hover:text-primary"
        @click="fileInput?.click()"
      >
        <UIcon
          name="i-lucide-map"
          class="size-10"
        />
        <span class="font-semibold">Importer une carte</span>
        <span class="text-sm">Cliquez ou déposez une image ici</span>
      </button>
    </div>

    <!-- Carte : pan (glisser) et zoom (molette / pincement) -->
    <div
      v-else
      ref="viewport"
      class="h-full w-full touch-none overflow-hidden bg-elevated select-none"
      :class="calibrating ? 'cursor-crosshair' : movingGrid ? 'cursor-move' : 'cursor-grab active:cursor-grabbing'"
      @wheel.prevent="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @dragover.prevent
      @drop.prevent="onDrop"
    >
      <div
        class="relative origin-top-left"
        :style="{ transform: `translate(${tx}px, ${ty}px) scale(${scale})`, width: `${imgW}px`, height: `${imgH}px` }"
      >
        <img
          :src="mapUrl"
          alt="Carte"
          draggable="false"
          class="block h-full w-full max-w-none"
          @load="onImgLoad"
        >
        <div
          v-if="grid.visible"
          class="pointer-events-none absolute inset-0"
          :style="gridStyle"
        />
        <span
          v-for="(pt, i) in calPoints"
          :key="i"
          class="pointer-events-none absolute rounded-full border-2 border-white bg-error"
          :style="{ left: `${pt.x}px`, top: `${pt.y}px`, width: `${12 / scale}px`, height: `${12 / scale}px`, transform: 'translate(-50%, -50%)' }"
        />
      </div>

      <div
        v-if="calibrating"
        class="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-md bg-default/90 px-3 py-1.5 text-sm shadow"
      >
        Cliquez sur deux coins opposés d'une même case ({{ calPoints.length }}/2)
      </div>

      <div class="absolute top-3 right-3 flex flex-col gap-2">
        <UButton
          icon="i-lucide-upload"
          color="neutral"
          variant="subtle"
          aria-label="Changer de carte"
          @pointerdown.stop
          @click="fileInput?.click()"
        />
        <UButton
          icon="i-lucide-plus"
          color="neutral"
          variant="subtle"
          aria-label="Zoom avant"
          @pointerdown.stop
          @click="zoomAtCenter(1.25)"
        />
        <UButton
          icon="i-lucide-minus"
          color="neutral"
          variant="subtle"
          aria-label="Zoom arrière"
          @pointerdown.stop
          @click="zoomAtCenter(0.8)"
        />
        <UButton
          icon="i-lucide-maximize"
          color="neutral"
          variant="subtle"
          aria-label="Ajuster à l'écran"
          @pointerdown.stop
          @click="fit"
        />
        <UButton
          icon="i-lucide-move-horizontal"
          color="neutral"
          variant="subtle"
          aria-label="Ajuster à la largeur"
          @pointerdown.stop
          @click="fitWidth"
        />
        <UButton
          square
          :color="grid.locked ? 'neutral' : 'primary'"
          variant="subtle"
          :aria-label="grid.locked ? 'Déverrouiller la grille' : 'Verrouiller la grille'"
          :aria-pressed="!grid.locked"
          @pointerdown.stop
          @click="grid.locked = !grid.locked"
        >
          <span class="relative inline-flex">
            <UIcon
              name="i-lucide-grid-3x3"
              class="size-5"
            />
            <span class="absolute -right-2 -bottom-2 flex size-4 items-center justify-center rounded-full bg-default ring-1 ring-current">
              <UIcon
                :name="grid.locked ? 'i-lucide-lock' : 'i-lucide-lock-open'"
                class="size-2.5"
              />
            </span>
          </span>
        </UButton>
      </div>
    </div>
    </div>

    <!-- Volet latéral droit : informations de la carte -->
    <aside
      class="flex shrink-0 flex-col border-l border-default bg-default"
      :class="rightOpen ? 'w-72' : 'w-14'"
    >
      <div
        class="flex-1 overflow-y-auto"
        :class="rightOpen ? 'p-4' : 'flex flex-col items-center gap-2 py-3'"
      >
        <!-- Replié : l'icône enregistre directement la carte -->
        <UButton
          v-if="!rightOpen"
          icon="i-lucide-save"
          color="neutral"
          variant="ghost"
          :disabled="!mapUrl"
          aria-label="Enregistrer la carte"
          @click="saveMap"
        />

        <div
          v-else
          class="space-y-6"
        >
        <section>
          <h2 class="mb-3 flex items-center gap-2 text-sm font-semibold">
            <UIcon
              name="i-lucide-folder"
              class="size-4"
            />
            Dossier des cartes
          </h2>
          <p
            v-if="!folder.supported"
            class="text-xs text-muted"
          >
            Votre navigateur ne permet pas d'accéder à un dossier du PC (utilisez Chrome ou Edge).
          </p>
          <div
            v-else
            class="space-y-2"
          >
            <p class="truncate text-sm">
              {{ folder.folderName.value || 'Aucun dossier choisi' }}
            </p>
            <UButton
              icon="i-lucide-folder-open"
              :label="folder.folderName.value ? 'Changer de dossier' : 'Choisir un dossier'"
              color="neutral"
              variant="subtle"
              block
              @click="pickFolder"
            />
          </div>
        </section>

        <section>
          <h2 class="mb-3 flex items-center gap-2 text-sm font-semibold">
            <UIcon
              name="i-lucide-library"
              class="size-4"
            />
            Mes cartes
          </h2>
          <p
            v-if="!maps.length"
            class="text-xs text-muted"
          >
            Aucune carte enregistrée.
          </p>
          <ul
            v-else
            class="space-y-1"
          >
            <li
              v-for="m in maps"
              :key="m.id"
              class="flex items-center gap-1"
            >
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-elevated"
                :class="{ 'bg-elevated font-medium': m.id === mapId }"
                @click="openMap(m)"
              >
                <UIcon
                  name="i-lucide-map"
                  class="size-4 shrink-0 text-muted"
                />
                <span class="min-w-0 flex-1 truncate">{{ m.name }}</span>
              </button>
              <UButton
                icon="i-lucide-trash-2"
                color="secondary"
                variant="soft"
                size="xs"
                :aria-label="`Supprimer ${m.name}`"
                @click="deleteMap(m)"
              />
            </li>
          </ul>
        </section>

        <section>
          <h2 class="mb-3 flex items-center gap-2 text-sm font-semibold">
            <UIcon
              name="i-lucide-map"
              class="size-4"
            />
            Carte
          </h2>
          <div class="space-y-4">
            <UFormField label="Nom">
              <UInput
                v-model="mapName"
                placeholder="Nom de la carte"
                class="w-full"
              />
            </UFormField>
            <p class="text-xs text-muted">
              Fichier : <code>{{ imagePath || '—' }}</code><br>
              L'image est copiée dans le dossier des cartes à l'enregistrement.
            </p>
            <UButton
              icon="i-lucide-save"
              label="Enregistrer"
              block
              :disabled="!mapUrl"
              @click="saveMap"
            />
          </div>
        </section>
        </div>
      </div>

      <div
        class="flex border-t border-default p-2"
        :class="rightOpen ? 'justify-start' : 'justify-center'"
      >
        <UButton
          :icon="rightOpen ? 'i-lucide-chevrons-left' : 'i-lucide-chevrons-right'"
          color="neutral"
          variant="ghost"
          :aria-label="rightOpen ? 'Replier le volet' : 'Déplier le volet'"
          @click="rightOpen = !rightOpen"
        />
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
const fileInput = ref<HTMLInputElement>()
const viewport = ref<HTMLElement>()
const mapUrl = ref<string>()

// Déplié par défaut seulement sur grand écran
const panelOpen = ref(false)
const rightOpen = ref(false)
onMounted(() => {
  panelOpen.value = rightOpen.value = window.matchMedia('(min-width: 1024px)').matches
})

// Sauvegarde provisoire dans le localStorage (une entrée par carte, clé = id)
const STORAGE_KEY = 'dnd-maps'
const toast = useToast()
interface SavedMap { id: string, name: string, gridSize: number, gridOffsetX?: number, gridOffsetY?: number, imagePath: string }

function readMaps(): SavedMap[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch {
    return []
  }
}

const maps = ref<SavedMap[]>([])
const folder = useMapFolder()
onMounted(() => {
  maps.value = readMaps()
  folder.restore()
})

async function pickFolder() {
  try {
    await folder.pick()
  } catch {} // sélecteur annulé
}

const mapId = ref(crypto.randomUUID())
const mapName = ref('')
// Nom du fichier image, relatif au dossier des cartes choisi sur le PC
const imagePath = ref('')
// Image importée mais pas encore copiée dans le dossier
let pendingFile: File | undefined

async function saveMap() {
  if (pendingFile) {
    if (!folder.folderName.value) {
      toast.add({ title: 'Choisissez d\'abord un dossier des cartes', color: 'error', icon: 'i-lucide-triangle-alert' })
      return
    }
    try {
      await folder.store(pendingFile)
      pendingFile = undefined
    } catch {
      toast.add({ title: 'Copie de l\'image impossible', description: 'Autorisez l\'accès au dossier.', color: 'error', icon: 'i-lucide-triangle-alert' })
      return
    }
  }
  const list = readMaps()
  const entry = {
    id: mapId.value,
    name: mapName.value.trim() || 'Carte sans nom',
    gridSize: grid.size,
    gridOffsetX: grid.offsetX,
    gridOffsetY: grid.offsetY,
    imagePath: imagePath.value
  }
  const i = list.findIndex(m => m.id === entry.id)
  if (i >= 0) list[i] = entry
  else list.push(entry)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    maps.value = list
    toast.add({ title: 'Carte enregistrée', description: entry.name, icon: 'i-lucide-check' })
  } catch {
    toast.add({ title: 'Échec de l\'enregistrement', color: 'error', icon: 'i-lucide-triangle-alert' })
  }
}
const grid = reactive({ visible: true, size: 70, offsetX: 0, offsetY: 0, locked: true })
// Glisser déplace la grille (et non la carte) quand elle est visible et déverrouillée
const movingGrid = computed(() => grid.visible && !grid.locked)

// Dimensions naturelles de la carte (la grille est dessinée dans ce repère, donc suit pan/zoom)
const imgW = ref(0)
const imgH = ref(0)

// Nombre de cases en largeur <-> taille des cases
const columns = computed({
  get: () => (imgW.value ? Math.round((imgW.value / grid.size) * 100) / 100 : undefined),
  set: (n) => {
    if (!n || n <= 0 || !imgW.value) return
    grid.size = imgW.value / n
    grid.offsetX = Math.min(grid.offsetX, grid.size)
    grid.offsetY = Math.min(grid.offsetY, grid.size)
    grid.visible = true
  }
})

// Calibrage : deux clics sur deux coins opposés d'une même case (coordonnées dans l'image)
const calibrating = ref(false)
const calPoints = ref<{ x: number, y: number }[]>([])

function toggleCalibration() {
  calibrating.value = !calibrating.value
  calPoints.value = []
}

function addCalPoint(p: { x: number, y: number }) {
  calPoints.value.push({ x: (p.x - tx.value) / scale.value, y: (p.y - ty.value) / scale.value })
  if (calPoints.value.length < 2) return
  const [a, b] = calPoints.value as [{ x: number, y: number }, { x: number, y: number }]
  const size = (Math.abs(b.x - a.x) + Math.abs(b.y - a.y)) / 2
  if (size >= 4) {
    grid.size = size
    // Le coin haut-gauche de la case définit la position d'une intersection de la grille
    grid.offsetX = ((Math.min(a.x, b.x) % size) + size) % size
    grid.offsetY = ((Math.min(a.y, b.y) % size) + size) % size
    grid.visible = true
  }
  toggleCalibration()
}

// Trait de ~1,5 px à l'écran quelle que soit l'échelle
const gridStyle = computed(() => {
  const line = `${1.5 / scale.value}px`
  const c = 'rgb(0 0 0 / 0.5)'
  return {
    backgroundImage: `linear-gradient(to right, ${c} ${line}, transparent ${line}), linear-gradient(to bottom, ${c} ${line}, transparent ${line})`,
    backgroundSize: `${grid.size}px ${grid.size}px`,
    backgroundPosition: `${grid.offsetX}px ${grid.offsetY}px`
  }
})

function onImgLoad(e: Event) {
  const img = e.target as HTMLImageElement
  imgW.value = img.naturalWidth
  imgH.value = img.naturalHeight
  nextTick(fit)
}

const scale = ref(1)
const tx = ref(0)
const ty = ref(0)

const MIN_SCALE = 0.05
const MAX_SCALE = 8

function setMap(file?: File | null) {
  if (!file || !file.type.startsWith('image/')) return
  if (mapUrl.value?.startsWith('blob:')) URL.revokeObjectURL(mapUrl.value)
  mapUrl.value = URL.createObjectURL(file)
  calibrating.value = false
  calPoints.value = []
  imagePath.value = file.name
  pendingFile = file
  // Une nouvelle image est une nouvelle carte
  mapId.value = crypto.randomUUID()
  mapName.value = file.name.replace(/\.[^.]+$/, '')
}

// Retire la carte de la liste (le fichier image du dossier n'est pas touché)
function deleteMap(m: SavedMap) {
  if (!confirm(`Supprimer la carte « ${m.name} » ?`)) return
  const list = readMaps().filter(x => x.id !== m.id)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    maps.value = list
  } catch {
    toast.add({ title: 'Échec de la suppression', color: 'error', icon: 'i-lucide-triangle-alert' })
  }
}

// Ouvre une carte enregistrée : l'image est lue dans le dossier des cartes du PC
async function openMap(m: SavedMap) {
  const name = m.imagePath.split('/').pop()!
  let file: File
  try {
    file = await folder.read(name)
  } catch {
    toast.add({
      title: 'Image introuvable',
      description: folder.folderName.value
        ? `${name} est absent du dossier « ${folder.folderName.value} » (ou l'accès est refusé).`
        : 'Choisissez d\'abord le dossier des cartes.',
      color: 'error',
      icon: 'i-lucide-triangle-alert'
    })
    return
  }
  if (mapUrl.value?.startsWith('blob:')) URL.revokeObjectURL(mapUrl.value)
  mapUrl.value = URL.createObjectURL(file)
  pendingFile = undefined
  mapId.value = m.id
  mapName.value = m.name
  imagePath.value = name
  grid.size = m.gridSize
  grid.offsetX = m.gridOffsetX ?? 0
  grid.offsetY = m.gridOffsetY ?? 0
}

function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  setMap(input.files?.[0])
  input.value = ''
}

function onDrop(e: DragEvent) {
  setMap(e.dataTransfer?.files?.[0])
}

onBeforeUnmount(() => {
  if (mapUrl.value?.startsWith('blob:')) URL.revokeObjectURL(mapUrl.value)
})

// Ajuste l'image pour qu'elle tienne entièrement dans la zone, centrée
function fit() {
  const el = viewport.value
  if (!el || !imgW.value) return
  const s = Math.min(el.clientWidth / imgW.value, el.clientHeight / imgH.value)
  scale.value = s
  tx.value = (el.clientWidth - imgW.value * s) / 2
  ty.value = (el.clientHeight - imgH.value * s) / 2
}

// Image sur toute la largeur de la zone, calée en haut
function fitWidth() {
  const el = viewport.value
  if (!el || !imgW.value) return
  scale.value = el.clientWidth / imgW.value
  tx.value = 0
  ty.value = 0
}

// Zoom en gardant fixe le point (cx, cy) exprimé dans le repère de la zone
function zoomAt(factor: number, cx: number, cy: number) {
  const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale.value * factor))
  const k = next / scale.value
  tx.value = cx - (cx - tx.value) * k
  ty.value = cy - (cy - ty.value) * k
  scale.value = next
}

function zoomAtCenter(factor: number) {
  const el = viewport.value
  if (el) zoomAt(factor, el.clientWidth / 2, el.clientHeight / 2)
}

function localPoint(e: PointerEvent | WheelEvent) {
  const r = viewport.value!.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

function onWheel(e: WheelEvent) {
  const p = localPoint(e)
  zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y)
}

// Pointeurs actifs : 1 = déplacement, 2 = pincement
const pointers = new Map<number, { x: number, y: number }>()
let lastDist = 0

function onPointerDown(e: PointerEvent) {
  if (calibrating.value) {
    addCalPoint(localPoint(e))
    return
  }
  viewport.value?.setPointerCapture(e.pointerId)
  pointers.set(e.pointerId, localPoint(e))
  if (pointers.size === 2) lastDist = pinchDistance()
}

function onPointerMove(e: PointerEvent) {
  const prev = pointers.get(e.pointerId)
  if (!prev) return
  const cur = localPoint(e)
  pointers.set(e.pointerId, cur)

  if (pointers.size === 1 && movingGrid.value) {
    const wrap = (v: number) => ((v % grid.size) + grid.size) % grid.size
    grid.offsetX = wrap(grid.offsetX + (cur.x - prev.x) / scale.value)
    grid.offsetY = wrap(grid.offsetY + (cur.y - prev.y) / scale.value)
  } else if (pointers.size === 1) {
    tx.value += cur.x - prev.x
    ty.value += cur.y - prev.y
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()] as [{ x: number, y: number }, { x: number, y: number }]
    const dist = pinchDistance()
    if (lastDist) zoomAt(dist / lastDist, (a.x + b.x) / 2, (a.y + b.y) / 2)
    lastDist = dist
  }
}

function onPointerUp(e: PointerEvent) {
  pointers.delete(e.pointerId)
  lastDist = 0
}

function pinchDistance() {
  const [a, b] = [...pointers.values()] as [{ x: number, y: number }, { x: number, y: number }]
  return Math.hypot(a.x - b.x, a.y - b.y)
}
</script>
