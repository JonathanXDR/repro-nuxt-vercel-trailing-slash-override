<script setup lang="ts">
// Server-render timestamp. On a STATIC (prerendered) page this is frozen at
// build time; on a FUNCTION-rendered page it changes on every request.
const renderedAt = useState('index-rendered-at', () => new Date().toISOString())
</script>

<template>
  <div>
    <h1>home</h1>
    <p>renderedAt: {{ renderedAt }}</p>
    <ul>
      <li><NuxtLink to="/slash/">/slash/ (trailing slash)</NuxtLink></li>
      <li><NuxtLink to="/noslash">/noslash (no slash)</NuxtLink></li>
    </ul>
  </div>
</template>
