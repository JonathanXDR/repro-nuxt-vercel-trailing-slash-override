// https://nuxt.com/docs/api/configuration/nuxt-config
//
// Minimal reproduction for the Nitro Vercel-preset trailing-slash override bug.
//
// Both `/slash/` (trailing slash) and `/noslash` (no slash) are prerendered to
// static HTML. The Nitro Vercel preset writes `.vercel/output/config.json`
// `overrides` for each. For the trailing-slash route it emits
// `{ "slash/index.html": { "path": "slash/" } }` (note the trailing slash),
// which Vercel does NOT resolve for a request to `/slash/`, so the request
// falls through to the serverless function instead of the prerendered file.
// `/noslash` gets `{ "noslash.html": { "path": "noslash" } }` and is served
// statically as expected.
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  nitro: {
    prerender: {
      // crawlLinks normalizes discovered links via withoutTrailingSlash, which
      // masks the bug. With explicit routes and no crawler, the trailing slash
      // survives into `_prerenderedRoutes[].route` and then into the override.
      crawlLinks: false,
      routes: ['/', '/slash/', '/noslash'],
    },
  },
})
