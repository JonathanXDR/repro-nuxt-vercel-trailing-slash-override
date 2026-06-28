<script setup lang="ts">
// If `/slash/` is served from the prerendered static file, this timestamp is
// frozen (identical across requests). If it changes per request, the request
// was handled by the serverless function instead of the static file.
const renderedAt = useState('slash-rendered-at', () => new Date().toISOString())
</script>

<template>
  <div>
    <h1>slash page — route /slash/ (trailing slash)</h1>
    <p data-render="slash">renderedAt: {{ renderedAt }}</p>
  </div>
</template>
