<script setup lang="ts">
// Control case (no trailing slash). Expected to be served from the prerendered
// static file, so this timestamp stays frozen across requests.
const renderedAt = useState('noslash-rendered-at', () => new Date().toISOString())
</script>

<template>
  <div>
    <h1>noslash page — route /noslash (no trailing slash)</h1>
    <p data-render="noslash">renderedAt: {{ renderedAt }}</p>
  </div>
</template>
