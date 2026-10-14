<template>
  <div class="relative flex h-[calc(100dvh-var(--bottom-nav-height))] overflow-hidden lg:h-[calc(100dvh-var(--ui-header-height))]">
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      class="hidden"
      @change="onFile"
    >

    <!-- Volet latéral gauche : déplié (sections) ou replié (seul le bouton reste) -->
    <aside
      class="flex shrink-0 flex-col border-r border-default bg-default"
      :class="panelOpen ? 'w-72' : 'w-14'"
    >
      <div
        class="flex-1 overflow-y-auto"
        :class="panelOpen ? 'p-4' : ''"
      >
        <div
          v-if="panelOpen"
          class="space-y-6"
        >
        <section>
          <h2
            class="mb-3 flex cursor-pointer items-center gap-2 text-sm font-semibold select-none"
            role="button"
            tabindex="0"
            :aria-expanded="!collapsed.grid"
            @click="collapsed.grid = !collapsed.grid"
            @keydown.enter="collapsed.grid = !collapsed.grid"
          >
            <UIcon
              :name="collapsed.grid ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
              class="size-4 text-muted"
            />
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
              @click.stop="grid.locked = !grid.locked"
            />
          </h2>
          <div v-show="!collapsed.grid">
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
          </div>
        </section>

        <section>
          <h2
            class="mb-3 flex cursor-pointer items-center gap-2 text-sm font-semibold select-none"
            role="button"
            tabindex="0"
            :aria-expanded="!collapsed.objects"
            @click="collapsed.objects = !collapsed.objects"
            @keydown.enter="collapsed.objects = !collapsed.objects"
          >
            <UIcon
              :name="collapsed.objects ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
              class="size-4 text-muted"
            />
            <UIcon
              name="i-lucide-shapes"
              class="size-4"
            />
            Objets
          </h2>
          <div v-show="!collapsed.objects">
          <div class="space-y-2">
            <div
              v-for="t in OBJECT_TYPES"
              :key="t.id"
              class="flex cursor-grab items-center gap-2 rounded-md border border-default px-3 py-2 text-sm hover:bg-elevated active:cursor-grabbing"
              :class="{ 'pointer-events-none opacity-50': !mapUrl }"
              draggable="true"
              title="Glisser sur la carte (ou cliquer pour ajouter au centre)"
              @dragstart="onObjectDragStart($event, t.id)"
              @click="addObject(t.id)"
            >
              <UIcon
                :name="t.icon"
                class="size-4 shrink-0"
                :class="t.color"
              />
              <span class="truncate">{{ t.label }}</span>
              <UIcon
                name="i-lucide-grip-vertical"
                class="ml-auto size-4 text-muted"
              />
            </div>
          </div>
          </div>
        </section>

        <section v-if="groups.length">
          <h2
            class="mb-3 flex cursor-pointer items-center gap-2 text-sm font-semibold select-none"
            role="button"
            tabindex="0"
            :aria-expanded="!collapsed.onmap"
            @click="collapsed.onmap = !collapsed.onmap"
            @keydown.enter="collapsed.onmap = !collapsed.onmap"
          >
            <UIcon
              :name="collapsed.onmap ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
              class="size-4 text-muted"
            />
            <UIcon
              name="i-lucide-layers"
              class="size-4"
            />
            Sur la carte
          </h2>
          <div v-show="!collapsed.onmap">
          <!-- Instances regroupées par type d'objet -->
          <div class="space-y-2">
            <div
              v-for="g in groups"
              :key="g.type.id"
            >
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-elevated"
                :aria-expanded="!closedGroups[g.type.id]"
                @click="closedGroups[g.type.id] = !closedGroups[g.type.id]"
              >
                <UIcon
                  :name="closedGroups[g.type.id] ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
                  class="size-4 shrink-0 text-muted"
                />
                <UIcon
                  :name="g.type.icon"
                  class="size-4 shrink-0"
                  :class="g.type.color"
                />
                <span class="truncate">{{ g.type.plural }}</span>
                <span class="ml-auto text-xs text-muted">{{ g.items.length }}</span>
              </button>
              <ul
                v-if="!closedGroups[g.type.id]"
                class="mt-1 ml-4 space-y-0.5 border-l border-default pl-2"
              >
                <li
                  v-for="(o, i) in g.items"
                  :key="o.id"
                  class="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-elevated"
                  :class="{ 'bg-elevated font-medium': o.id === selectedLight }"
                  @click="selectedLight = o.id"
                >
                  <UIcon
                    :name="g.type.icon"
                    class="size-3.5 shrink-0"
                    :class="g.type.color"
                  />
                  <UInput
                    v-if="editingLight === o.id"
                    v-model="editName"
                    size="xs"
                    class="min-w-0 flex-1"
                    autofocus
                    @click.stop
                    @keydown.enter.prevent="commitRename(o)"
                    @keydown.esc.prevent="editingLight = undefined"
                    @blur="commitRename(o)"
                  />
                  <span
                    v-else
                    class="min-w-0 flex-1 truncate"
                    title="Double-cliquer pour renommer"
                    @dblclick.stop="startRename(o, objName(o, g.type, i))"
                  >{{ objName(o, g.type, i) }}</span>
                  <UButton
                    v-if="editingLight !== o.id"
                    icon="i-lucide-pencil"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :aria-label="`Renommer ${objName(o, g.type, i)}`"
                    @click.stop="startRename(o, objName(o, g.type, i))"
                  />
                  <UButton
                    icon="i-lucide-trash-2"
                    color="secondary"
                    variant="soft"
                    size="xs"
                    :aria-label="`Supprimer ${objName(o, g.type, i)}`"
                    @click.stop="removeObject(g.type.id, o.id)"
                  />
                </li>
              </ul>
            </div>
          </div>
          </div>
        </section>
        </div>
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
        <div
          v-for="l in lights.filter(isLit)"
          :key="`glow-${l.id}`"
          class="pointer-events-none absolute rounded-full mix-blend-screen"
          :style="glowStyle(l)"
        />
        <UPopover
          v-for="l in previewing ? [] : lights"
          :key="l.id"
          :open="openLight === l.id"
          :content="{ side: 'top', sideOffset: 16 }"
          @update:open="onLightPopover(l.id, $event)"
        >
          <div
            class="absolute flex size-6 touch-none items-center justify-center rounded-full border-2 bg-warning text-white shadow"
            :class="[l.id === selectedLight ? 'border-primary' : 'border-white', l.on === false ? 'opacity-80 grayscale' : '', calibrating ? 'pointer-events-none' : 'cursor-move']"
            :style="{ left: `${l.x}px`, top: `${l.y}px`, transform: `translate(-50%, -50%) scale(${1 / scale})` }"
            @pointerdown.stop="onLightDown($event, l)"
            @pointermove="onLightMove($event, l)"
            @pointerup="onLightUp"
            @pointercancel="onLightUp"
          >
            <UIcon
              name="i-lucide-lightbulb"
              class="pointer-events-none size-3.5"
            />
          </div>
          <template #content>
            <div class="flex w-56 items-center gap-3 p-3">
              <UButton
                :icon="isLit(l) ? 'i-lucide-lightbulb' : 'i-lucide-lightbulb-off'"
                :color="isLit(l) ? 'warning' : 'neutral'"
                :variant="isLit(l) ? 'soft' : 'ghost'"
                size="xs"
                :aria-pressed="isLit(l)"
                :aria-label="isLit(l) ? 'Éteindre la lumière' : 'Allumer la lumière'"
                @click="l.on = !isLit(l)"
              />
              <USlider
                v-model="l.intensity"
                :min="5"
                :max="100"
                :step="5"
                :disabled="!isLit(l)"
                aria-label="Intensité"
              />
              <UButton
                icon="i-lucide-trash-2"
                color="secondary"
                variant="soft"
                size="xs"
                aria-label="Supprimer la lumière"
                @click="removeObject('light', l.id)"
              />
            </div>
          </template>
        </UPopover>
        <UPopover
          v-for="sh in previewing ? [] : shops"
          :key="sh.id"
          :open="openLight === sh.id"
          :content="{ side: 'top', sideOffset: 16 }"
          @update:open="onLightPopover(sh.id, $event)"
        >
          <div
            class="absolute flex size-6 touch-none items-center justify-center rounded-full border-2 bg-info text-white shadow"
            :class="[sh.id === selectedLight ? 'border-primary' : 'border-white', calibrating ? 'pointer-events-none' : 'cursor-move']"
            :style="{ left: `${sh.x}px`, top: `${sh.y}px`, transform: `translate(-50%, -50%) scale(${1 / scale})` }"
            @pointerdown.stop="onLightDown($event, sh)"
            @pointermove="onLightMove($event, sh)"
            @pointerup="onLightUp"
            @pointercancel="onLightUp"
          >
            <UIcon
              name="i-lucide-store"
              class="pointer-events-none size-3.5"
            />
          </div>
          <template #content>
            <div class="w-80 space-y-3 p-3">
              <div class="flex items-center gap-2">
                <UInput
                  v-model="sh.name"
                  placeholder="Nom du magasin"
                  icon="i-lucide-store"
                  class="min-w-0 flex-1"
                />
                <UButton
                  icon="i-lucide-trash-2"
                  color="secondary"
                  variant="soft"
                  aria-label="Supprimer le magasin"
                  @click="removeObject('shop', sh.id)"
                />
              </div>
              <div>
                <p class="mb-1 text-xs font-semibold text-muted">
                  Inventaire
                </p>
                <div
                  v-if="sh.inventory.length"
                  class="max-h-64 space-y-1.5 overflow-y-auto"
                >
                  <div
                    v-for="it in sh.inventory"
                    :key="it.id"
                    class="flex items-center gap-1"
                  >
                    <UInput
                      v-model="it.name"
                      placeholder="Article"
                      size="xs"
                      class="min-w-0 flex-1"
                    />
                    <UInput
                      v-model.number="it.qty"
                      type="number"
                      min="0"
                      size="xs"
                      class="w-14"
                      aria-label="Quantité"
                      title="Quantité"
                    />
                    <UInput
                      v-model.number="it.price"
                      type="number"
                      min="0"
                      size="xs"
                      class="w-16"
                      aria-label="Prix en pièces d'or"
                      title="Prix (po)"
                    />
                    <UButton
                      icon="i-lucide-x"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      aria-label="Retirer l'article"
                      @click="sh.inventory = sh.inventory.filter(x => x.id !== it.id)"
                    />
                  </div>
                </div>
                <p
                  v-else
                  class="text-xs text-muted"
                >
                  Inventaire vide.
                </p>
              </div>
              <UButton
                icon="i-lucide-plus"
                label="Ajouter un article"
                color="neutral"
                variant="subtle"
                size="xs"
                block
                @click="addShopItem(sh)"
              />
            </div>
          </template>
        </UPopover>
        <UPopover
          v-for="inf in previewing ? [] : infos"
          :key="inf.id"
          :open="openLight === inf.id"
          :content="{ side: 'top', sideOffset: 16 }"
          @update:open="onLightPopover(inf.id, $event)"
        >
          <div
            class="absolute flex size-6 touch-none items-center justify-center rounded-full border-2 bg-success text-white shadow"
            :class="[inf.id === selectedLight ? 'border-primary' : 'border-white', calibrating ? 'pointer-events-none' : 'cursor-move']"
            :style="{ left: `${inf.x}px`, top: `${inf.y}px`, transform: `translate(-50%, -50%) scale(${1 / scale})` }"
            @pointerdown.stop="onLightDown($event, inf)"
            @pointermove="onLightMove($event, inf)"
            @pointerup="onLightUp"
            @pointercancel="onLightUp"
            @pointerenter="hoveredInfo = inf.id"
            @pointerleave="hoveredInfo = undefined"
          >
            <UIcon
              name="i-lucide-info"
              class="pointer-events-none size-3.5"
            />
          </div>
          <template #content>
            <div class="w-72 space-y-3 p-3">
              <div class="flex items-center gap-2">
                <UInput
                  v-model="inf.name"
                  placeholder="Titre"
                  icon="i-lucide-info"
                  class="min-w-0 flex-1"
                />
                <UButton
                  icon="i-lucide-trash-2"
                  color="secondary"
                  variant="soft"
                  aria-label="Supprimer l'information"
                  @click="removeObject('info', inf.id)"
                />
              </div>
              <UTextarea
                v-model="inf.text"
                placeholder="Information pour le MJ…"
                :rows="5"
                autoresize
                :maxrows="12"
                class="w-full"
              />
            </div>
          </template>
        </UPopover>
        <!-- Titre affiché au survol d'un jeton d'information -->
        <template
          v-for="(inf, i) in previewing ? [] : infos"
          :key="`label-${inf.id}`"
        >
          <div
            v-if="hoveredInfo === inf.id && openLight !== inf.id"
            class="pointer-events-none absolute pb-4"
            :style="{ left: `${inf.x}px`, top: `${inf.y}px`, transform: `translate(-50%, -100%) scale(${1 / scale})`, transformOrigin: '50% 100%' }"
          >
            <div class="max-w-60 rounded-md bg-inverted px-2 py-1 text-xs font-medium whitespace-nowrap text-inverted shadow">
              {{ objName(inf, OBJECT_TYPES[2], i) }}
            </div>
          </div>
        </template>
        <span
          v-for="(pt, i) in calPoints"
          :key="i"
          class="pointer-events-none absolute rounded-full border-2 border-white bg-error"
          :style="{ left: `${pt.x}px`, top: `${pt.y}px`, width: `${12 / scale}px`, height: `${12 / scale}px`, transform: 'translate(-50%, -50%)' }"
        />
      </div>

      <div
        v-if="ambiance !== 'none'"
        class="ambiance pointer-events-none absolute inset-0 z-10 overflow-hidden"
        :class="`ambiance-${ambiance}`"
        :style="ambiance === 'fog' ? fogMask : {}"
      >
        <div
          class="tint"
          :style="ambiance === 'fog' ? {} : darkMask"
        />
        <canvas
          v-if="ambiance === 'rain' || ambiance === 'storm'"
          ref="rainCanvas"
          class="absolute inset-0 z-[1] size-full"
        />
      </div>

      <div
        v-if="calibrating"
        class="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-md bg-default/90 px-3 py-1.5 text-sm shadow"
      >
        Cliquez sur deux coins opposés d'une même case ({{ calPoints.length }}/2)
      </div>

      <div class="absolute top-3 right-3 z-20 flex flex-col gap-2">
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
        <UPopover
          v-model:open="gridOpen"
          :content="{ side: 'left', align: 'start' }"
        >
          <UButton
            icon="i-lucide-grid-3x3"
            :color="gridOpen ? 'primary' : 'neutral'"
            variant="subtle"
            aria-label="Réglages de la grille"
            @pointerdown.stop
          />
          <template #content>
            <div class="w-64 space-y-3 p-3">
              <USwitch
                v-model="grid.visible"
                label="Afficher la grille"
              />
              <UButton
                :icon="calibrating ? 'i-lucide-x' : 'i-lucide-crosshair'"
                :label="calibrating ? 'Annuler le calibrage' : 'Calibrer sur une case'"
                color="neutral"
                variant="subtle"
                block
                @click="toggleCalibration(); gridOpen = false"
              />
              <UFormField label="Nombre de cases en largeur">
                <UInputNumber
                  v-model="columns"
                  :min="1"
                  :max="500"
                  :step="1"
                  class="w-full"
                />
              </UFormField>
            </div>
          </template>
        </UPopover>
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
        <UPopover
          v-model:open="ambianceOpen"
          :content="{ side: 'left', align: 'start' }"
        >
          <UButton
            :icon="currentAmbiance.icon"
            :color="ambiance !== 'none' ? 'primary' : 'neutral'"
            variant="subtle"
            :aria-label="`Ambiance : ${currentAmbiance.label}`"
            @pointerdown.stop
          />
          <template #content>
            <div class="space-y-2 p-2">
              <div class="flex gap-1">
                <UButton
                  v-for="a in AMBIANCES"
                  :key="a.id"
                  :icon="a.icon"
                  :aria-label="a.label"
                  :title="a.label"
                  :color="ambiance === a.id ? 'primary' : 'neutral'"
                  :variant="ambiance === a.id ? 'soft' : 'ghost'"
                  :aria-pressed="ambiance === a.id"
                  @click="ambiance = a.id; ambianceOpen = false"
                />
              </div>
              <p class="text-xs text-muted">
                Aperçu uniquement, non enregistré.
              </p>
            </div>
          </template>
        </UPopover>
        <UButton
          :icon="previewing ? 'i-lucide-eye-off' : 'i-lucide-eye'"
          :color="previewing ? 'primary' : 'neutral'"
          variant="subtle"
          :aria-pressed="previewing"
          :aria-label="previewing ? 'Quitter l\'aperçu' : 'Aperçu (masque les jetons)'"
          :title="previewing ? 'Quitter l\'aperçu' : 'Aperçu (masque les jetons)'"
          @pointerdown.stop
          @click="previewing = !previewing; openLight = undefined"
        />
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
        :class="rightOpen ? 'p-4' : ''"
      >
        <div
          v-if="rightOpen"
          class="space-y-6"
        >
        <section>
          <h2
            class="mb-3 flex cursor-pointer items-center gap-2 text-sm font-semibold select-none"
            role="button"
            tabindex="0"
            :aria-expanded="!collapsed.folder"
            @click="collapsed.folder = !collapsed.folder"
            @keydown.enter="collapsed.folder = !collapsed.folder"
          >
            <UIcon
              :name="collapsed.folder ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
              class="size-4 text-muted"
            />
            <UIcon
              name="i-lucide-folder"
              class="size-4"
            />
            Dossier des cartes
          </h2>
          <div v-show="!collapsed.folder">
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
          </div>
        </section>

        <section>
          <h2
            class="mb-3 flex cursor-pointer items-center gap-2 text-sm font-semibold select-none"
            role="button"
            tabindex="0"
            :aria-expanded="!collapsed.maps"
            @click="collapsed.maps = !collapsed.maps"
            @keydown.enter="collapsed.maps = !collapsed.maps"
          >
            <UIcon
              :name="collapsed.maps ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
              class="size-4 text-muted"
            />
            <UIcon
              name="i-lucide-library"
              class="size-4"
            />
            Mes cartes
          </h2>
          <div v-show="!collapsed.maps">
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
          </div>
        </section>

        <section>
          <h2
            class="mb-3 flex cursor-pointer items-center gap-2 text-sm font-semibold select-none"
            role="button"
            tabindex="0"
            :aria-expanded="!collapsed.map"
            @click="collapsed.map = !collapsed.map"
            @keydown.enter="collapsed.map = !collapsed.map"
          >
            <UIcon
              :name="collapsed.map ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
              class="size-4 text-muted"
            />
            <UIcon
              name="i-lucide-map"
              class="size-4"
            />
            Carte
          </h2>
          <div v-show="!collapsed.map">
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
            <div class="flex items-center gap-2">
              <UButton
                icon="i-lucide-save"
                label="Enregistrer"
                block
                class="flex-1"
                :disabled="!mapUrl"
                @click="saveMap"
              />
              <UIcon
                v-if="dirty"
                name="i-lucide-diff"
                class="size-5 shrink-0 text-warning"
                title="Modifications non enregistrées"
                aria-label="Modifications non enregistrées"
              />
            </div>
          </div>
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
interface SavedMap { id: string, name: string, gridSize: number, gridOffsetX?: number, gridOffsetY?: number, imagePath: string, lights?: Light[], shops?: Shop[], infos?: Info[] }

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
    imagePath: imagePath.value,
    infos: infos.value.map(i => ({ ...i })),
    shops: shops.value.map(s => ({ ...s, inventory: s.inventory.map(i => ({ ...i })) })),
    lights: lights.value.map(({ id, x, y, intensity, on, name }) => ({ id, x, y, intensity, on, name }))
  }
  const i = list.findIndex(m => m.id === entry.id)
  if (i >= 0) list[i] = entry
  else list.push(entry)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    maps.value = list
    savedSnapshot.value = currentSnapshot.value
    toast.add({ title: 'Carte enregistrée', description: entry.name, icon: 'i-lucide-check' })
  } catch {
    toast.add({ title: 'Échec de l\'enregistrement', color: 'error', icon: 'i-lucide-triangle-alert' })
  }
}
// Ambiance : calque purement visuel, jamais enregistré avec la carte
const AMBIANCES = [
  { id: 'none', label: 'Aucune', icon: 'i-lucide-sun' },
  { id: 'night', label: 'Nuit', icon: 'i-lucide-moon' },
  { id: 'dusk', label: 'Crépuscule', icon: 'i-lucide-sunset' },
  { id: 'rain', label: 'Pluie', icon: 'i-lucide-cloud-rain' },
  { id: 'storm', label: 'Orage', icon: 'i-lucide-cloud-lightning' },
  { id: 'snow', label: 'Neige', icon: 'i-lucide-snowflake' },
  { id: 'fog', label: 'Brouillard', icon: 'i-lucide-cloud-fog' }
] as const
const ambiance = ref<typeof AMBIANCES[number]['id']>('none')
const ambianceOpen = ref(false)
const gridOpen = ref(false)
const currentAmbiance = computed(() => AMBIANCES.find(a => a.id === ambiance.value) ?? AMBIANCES[0])

// Pluie : gouttes aléatoires (longueur, vitesse, opacité variables), rafales de vent et éclaboussures
const rainCanvas = ref<HTMLCanvasElement>()
let rainFrame = 0
let stopRain: (() => void) | undefined

function startRain(canvas: HTMLCanvasElement, heavy: boolean) {
  const ctx = canvas.getContext('2d')!
  const dpr = window.devicePixelRatio || 1
  let w = 0
  let h = 0
  const resize = () => {
    w = canvas.clientWidth
    h = canvas.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  resize()
  const ro = new ResizeObserver(resize)
  ro.observe(canvas)

  interface Drop { x: number, y: number, len: number, speed: number, alpha: number, width: number }
  const spawn = (fromTop = false): Drop => {
    const depth = Math.random() // 0 = loin, 1 = proche
    return {
      x: Math.random() * (w + 200) - 100,
      y: fromTop ? -Math.random() * 60 : Math.random() * h,
      len: 8 + depth * 22,
      speed: 500 + depth * 900,
      alpha: 0.15 + depth * 0.4,
      width: 0.6 + depth * 1.1
    }
  }
  const count = () => Math.round(Math.min(900, Math.max(120, (w * h) / (heavy ? 1800 : 3200))))
  let drops = Array.from({ length: count() }, () => spawn())
  const splashes: { x: number, y: number, age: number }[] = []

  let last = performance.now()
  let t = 0
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    t += dt
    // Vent : dérive lente + rafales irrégulières
    const wind = 0.22 + Math.sin(t * 0.35) * 0.08 + Math.sin(t * 1.3) * 0.04
    if (drops.length < count()) drops.push(...Array.from({ length: count() - drops.length }, () => spawn(true)))
    ctx.clearRect(0, 0, w, h)
    ctx.lineCap = 'round'
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i]!
      d.y += d.speed * dt
      d.x += d.speed * wind * dt
      if (d.y > h) {
        if (d.alpha > 0.4 && Math.random() < 0.5) splashes.push({ x: d.x, y: h - Math.random() * 40, age: 0 })
        drops[i] = spawn(true)
        continue
      }
      ctx.strokeStyle = `rgba(200, 220, 255, ${d.alpha})`
      ctx.lineWidth = d.width
      ctx.beginPath()
      ctx.moveTo(d.x, d.y)
      ctx.lineTo(d.x - d.len * wind, d.y - d.len)
      ctx.stroke()
    }
    for (let i = splashes.length - 1; i >= 0; i--) {
      const s = splashes[i]!
      s.age += dt
      if (s.age > 0.25) {
        splashes.splice(i, 1)
        continue
      }
      ctx.strokeStyle = `rgba(210, 228, 255, ${0.35 * (1 - s.age / 0.25)})`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.ellipse(s.x, s.y, 2 + s.age * 26, 1 + s.age * 8, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    rainFrame = requestAnimationFrame(frame)
  }
  rainFrame = requestAnimationFrame(frame)
  return () => {
    cancelAnimationFrame(rainFrame)
    ro.disconnect()
  }
}

watch([ambiance, rainCanvas], async ([a, canvas]) => {
  stopRain?.()
  stopRain = undefined
  if (!canvas || (a !== 'rain' && a !== 'storm')) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  stopRain = startRain(canvas, a === 'storm')
}, { flush: 'post' })
onBeforeUnmount(() => stopRain?.())

// Objets posés sur la carte (enregistrés avec elle)
interface Token { id: string, x: number, y: number, name?: string }
interface Light extends Token { intensity: number, on?: boolean }
interface ShopItem { id: string, name: string, qty: number, price: number }
interface Shop extends Token { inventory: ShopItem[] }
interface Info extends Token { text: string }
const OBJECT_MIME = 'application/x-dnd-object'
type ObjectKind = 'light' | 'shop' | 'info'
const OBJECT_TYPES = [
  { id: 'light', label: 'Source de lumière', plural: 'Sources de lumière', base: 'Lumière', icon: 'i-lucide-lightbulb', color: 'text-warning' },
  { id: 'shop', label: 'Magasin', plural: 'Magasins', base: 'Magasin', icon: 'i-lucide-store', color: 'text-info' },
  { id: 'info', label: 'Information', plural: 'Informations', base: 'Information', icon: 'i-lucide-info', color: 'text-success' }
] as const
const lights = ref<Light[]>([])
const shops = ref<Shop[]>([])
const infos = ref<Info[]>([])
const hoveredInfo = ref<string>()
const selectedLight = ref<string>()
const collapsed = reactive<Record<string, boolean>>({})
const closedGroups = reactive<Record<string, boolean>>({})
// Aperçu : masque les jetons mais garde halos, assombrissement et ambiance
const previewing = ref(false)

function onObjectDragStart(e: DragEvent, kind: ObjectKind) {
  if (!e.dataTransfer) return
  e.dataTransfer.setData(OBJECT_MIME, kind)
  e.dataTransfer.effectAllowed = 'copy'
}

// `at` : point en pixels écran dans la zone ; par défaut le centre
function addObject(kind: ObjectKind, at?: { x: number, y: number }) {
  const el = viewport.value
  if (!el) return
  const p = at ?? { x: el.clientWidth / 2, y: el.clientHeight / 2 }
  const base = { id: crypto.randomUUID(), x: (p.x - tx.value) / scale.value, y: (p.y - ty.value) / scale.value }
  if (kind === 'light') lights.value.push({ ...base, intensity: 60 })
  else if (kind === 'shop') shops.value.push({ ...base, inventory: [] })
  else infos.value.push({ ...base, text: '' })
  selectedLight.value = base.id
}

function removeObject(kind: ObjectKind, id: string) {
  if (kind === 'light') lights.value = lights.value.filter(l => l.id !== id)
  else if (kind === 'shop') shops.value = shops.value.filter(s => s.id !== id)
  else infos.value = infos.value.filter(i => i.id !== id)
  if (openLight.value === id) openLight.value = undefined
}

function addShopItem(sh: Shop) {
  sh.inventory.push({ id: crypto.randomUUID(), name: '', qty: 1, price: 0 })
}

// Objets regroupés par type pour l'arbre « Sur la carte »
const groups = computed(() => [
  { type: OBJECT_TYPES[0], items: lights.value as Token[] },
  { type: OBJECT_TYPES[1], items: shops.value as Token[] },
  { type: OBJECT_TYPES[2], items: infos.value as Token[] }
].filter(g => g.items.length))

// Un simple clic sur le jeton ouvre le réglage d'intensité ; un glisser le déplace
const openLight = ref<string>()
let draggingLight: string | undefined
let lightMoved = false
function onLightPopover(id: string, open: boolean) {
  if (!open) openLight.value = openLight.value === id ? undefined : openLight.value
  else if (!lightMoved) openLight.value = id
}
function onLightDown(e: PointerEvent, l: Token) {
  selectedLight.value = l.id
  draggingLight = l.id
  lightMoved = false
  lightStart = localPoint(e)
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
let lightStart = { x: 0, y: 0 }
function onLightMove(e: PointerEvent, l: Token) {
  if (draggingLight !== l.id) return
  const p = localPoint(e)
  if (!lightMoved && Math.hypot(p.x - lightStart.x, p.y - lightStart.y) < 4) return
  lightMoved = true
  openLight.value = undefined
  l.x = (p.x - tx.value) / scale.value
  l.y = (p.y - ty.value) / scale.value
}
function onLightUp() {
  draggingLight = undefined
}

// Rayon d'éclairage en pixels image : proportionnel à la taille des cases
const lightRadius = (l: Light) => grid.size * (1 + (l.intensity / 100) * 7)

// Renommage des instances dans l'arbre
const editingLight = ref<string>()
const editName = ref('')
const objName = (o: Token, type: typeof OBJECT_TYPES[number], i: number) => o.name || `${type.base} ${i + 1}`
function startRename(o: Token, current: string) {
  editName.value = current
  editingLight.value = o.id
}
function commitRename(l: Token) {
  if (editingLight.value !== l.id) return
  l.name = editName.value.trim() || undefined
  editingLight.value = undefined
}

const isLit = (l: Light) => l.on !== false

function glowStyle(l: Light) {
  const r = lightRadius(l)
  const a = 0.15 + (l.intensity / 100) * 0.35
  return {
    left: `${l.x - r}px`,
    top: `${l.y - r}px`,
    width: `${r * 2}px`,
    height: `${r * 2}px`,
    background: `radial-gradient(circle, rgb(255 190 100 / ${a}) 0%, rgb(255 160 60 / ${a * 0.4}) 45%, transparent 70%)`
  }
}

// Perce un calque autour de chaque lumière (intersection des masques).
// `floor` : opacité résiduelle au centre (0 = totalement dégagé, 1 = aucun effet)
function buildMask(floor: number) {
  if (!lights.value.some(isLit)) return {}
  const layers = lights.value.filter(isLit).map((l) => {
    const i = l.intensity / 100
    const r = lightRadius(l) * scale.value
    const x = l.x * scale.value + tx.value
    const y = l.y * scale.value + ty.value
    const core = floor + (1 - floor) * Math.max(0, 1 - i * 1.25)
    return `radial-gradient(circle ${r}px at ${x}px ${y}px, rgb(0 0 0 / ${core}) 0%, rgb(0 0 0 / ${Math.min(1, core + 0.2)}) 30%, #000 100%)`
  }).join(', ')
  return { maskImage: layers, WebkitMaskImage: layers, maskComposite: 'intersect', WebkitMaskComposite: 'source-in' }
}
// Le brouillard résiste davantage à la lumière que l'obscurité
const darkMask = computed(() => buildMask(0))
const fogMask = computed(() => buildMask(0.35))

// Modifications non enregistrées : on compare l'état courant au dernier état enregistré/ouvert
const currentSnapshot = computed(() => JSON.stringify([
  mapName.value, grid.size, grid.offsetX, grid.offsetY, imagePath.value, lights.value, shops.value, infos.value
]))
const savedSnapshot = ref<string>()
const dirty = computed(() => !!mapUrl.value && currentSnapshot.value !== savedSnapshot.value)

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
  lights.value = []
  shops.value = []
  infos.value = []
  savedSnapshot.value = undefined
  selectedLight.value = openLight.value = undefined
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
  lights.value = (m.lights ?? []).map(l => ({ ...l }))
  infos.value = (m.infos ?? []).map(i => ({ ...i }))
  shops.value = (m.shops ?? []).map(s => ({ ...s, inventory: s.inventory.map(i => ({ ...i })) }))
  selectedLight.value = openLight.value = undefined
  mapId.value = m.id
  mapName.value = m.name
  imagePath.value = name
  grid.size = m.gridSize
  grid.offsetX = m.gridOffsetX ?? 0
  grid.offsetY = m.gridOffsetY ?? 0
  savedSnapshot.value = currentSnapshot.value
}

function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  setMap(input.files?.[0])
  input.value = ''
}

function onDrop(e: DragEvent) {
  const kind = e.dataTransfer?.getData(OBJECT_MIME)
  if (kind) {
    if (viewport.value && (kind === 'light' || kind === 'shop' || kind === 'info')) addObject(kind, localPoint(e))
    return
  }
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

function localPoint(e: MouseEvent) {
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

<style scoped>
.ambiance::before,
.ambiance::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
}
.ambiance > .tint {
  position: absolute;
  inset: 0;
}

.ambiance-night > .tint {
  background: radial-gradient(ellipse at center, rgb(10 20 70 / 0.5), rgb(2 5 30 / 0.78));
}
.ambiance-dusk > .tint {
  background: linear-gradient(to bottom, rgb(255 110 40 / 0.3), rgb(120 40 130 / 0.38));
}

/* Pluie / orage : teinte + éclairs (les gouttes sont dessinées sur le canvas) */
.ambiance-rain > .tint,
.ambiance-storm > .tint {
  background: rgb(25 40 70 / 0.28);
}
.ambiance-storm > .tint {
  background: rgb(15 20 45 / 0.5);
  animation: lightning 7s infinite;
}
@keyframes lightning {
  0%, 92%, 96%, 100% { background-color: rgb(15 20 45 / 0.5); }
  93% { background-color: rgb(220 230 255 / 0.55); }
  94% { background-color: rgb(15 20 45 / 0.5); }
  95% { background-color: rgb(220 230 255 / 0.4); }
}

/* Neige */
.ambiance-snow > .tint {
  background: rgb(190 210 235 / 0.14);
}
.ambiance-snow::before {
  background-image:
    radial-gradient(circle, rgb(255 255 255 / 0.9) 0 2px, transparent 3px),
    radial-gradient(circle, rgb(255 255 255 / 0.7) 0 1.5px, transparent 2.5px);
  background-size: 90px 90px, 140px 140px;
  background-position: 0 0, 40px 60px;
  animation: snow-fall 6s linear infinite;
}
.ambiance-snow::after {
  background-image: radial-gradient(circle, rgb(255 255 255 / 0.6) 0 1px, transparent 2px);
  background-size: 55px 55px;
  animation: snow-fall 3.5s linear infinite;
}
@keyframes snow-fall {
  to { background-position: 30px 140px, 70px 200px; }
}

/* Brouillard */
.ambiance-fog > .tint {
  background: rgb(200 210 215 / 0.28);
}
.ambiance-fog::before,
.ambiance-fog::after {
  inset: -20%;
  background:
    radial-gradient(ellipse 40% 30% at 20% 30%, rgb(235 240 245 / 0.55), transparent),
    radial-gradient(ellipse 45% 35% at 70% 60%, rgb(235 240 245 / 0.5), transparent),
    radial-gradient(ellipse 35% 30% at 45% 85%, rgb(235 240 245 / 0.45), transparent);
  filter: blur(24px);
  animation: fog-drift 24s ease-in-out infinite alternate;
}
.ambiance-fog::after {
  transform: scaleX(-1);
  animation-duration: 34s;
  animation-direction: alternate-reverse;
}
@keyframes fog-drift {
  from { translate: -6% 0; }
  to { translate: 6% 3%; }
}

@media (prefers-reduced-motion: reduce) {
  .ambiance,
  .ambiance::before,
  .ambiance::after {
    animation: none !important;
  }
}
</style>
