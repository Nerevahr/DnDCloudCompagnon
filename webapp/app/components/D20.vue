<template>
  <!-- d20 vu de face : hexagone, triangle central portant le résultat, arêtes de l'icosaèdre -->
  <svg
    :key="value"
    viewBox="0 0 100 100"
    class="d20"
    :class="{ 'd20--crit': value === 20, 'd20--fumble': value === 1 }"
    role="img"
    :aria-label="`d20 : ${value}`"
  >
    <polygon
      class="d20__body"
      points="50,3 91,26 91,74 50,97 9,74 9,26"
    />
    <g class="d20__edges">
      <polygon points="50,24 80,70 20,70" />
      <path d="M50 24 L9 26 M50 24 L91 26 M50 24 L50 3" />
      <path d="M80 70 L91 26 M80 70 L91 74 M80 70 L50 97" />
      <path d="M20 70 L9 26 M20 70 L9 74 M20 70 L50 97" />
    </g>
    <text
      class="d20__value"
      x="50"
      y="58"
      text-anchor="middle"
      dominant-baseline="middle"
      font-weight="700"
      :font-size="value >= 10 ? 24 : 28"
    >{{ value }}</text>
  </svg>
</template>

<script setup lang="ts">
defineProps<{ value: number }>()
</script>

<style scoped>
/* Couleurs via les variables de Nuxt UI : les utilitaires de couleur de remplissage et de contour du thème n'existent pas pour les SVG */
.d20 {
  --d20-line: var(--ui-border-accented);
  --d20-text: var(--ui-text-highlighted);
  animation: d20-roll 0.45s cubic-bezier(0.22, 1, 0.36, 1);
}
/* 20 naturel : succès critique ; 1 naturel : échec critique */
.d20--crit {
  --d20-line: var(--ui-success);
  --d20-text: var(--ui-success);
}
.d20--fumble {
  --d20-line: var(--ui-error);
  --d20-text: var(--ui-error);
}

.d20__body {
  fill: none;
  stroke: var(--d20-line);
  stroke-width: 3;
  stroke-linejoin: round;
}
.d20__edges {
  fill: none;
  stroke: var(--d20-line);
  stroke-width: 1.5;
  stroke-linejoin: round;
  stroke-linecap: round;
  opacity: 0.7;
}
.d20__value {
  fill: var(--d20-text);
}

/* L'élément est recréé à chaque nouvelle valeur (:key) : l'animation se rejoue à chaque lancer */
@keyframes d20-roll {
  0% { transform: rotate(-120deg) scale(0.6); opacity: 0; }
  100% { transform: rotate(0) scale(1); opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .d20 {
    animation: none;
  }
}
</style>
