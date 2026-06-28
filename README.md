# repro: Nitro Vercel preset emits trailing-slash override paths, so prerendered HTML is served by the function

Minimal reproduction for a **Nitro** (`nitropack`) Vercel-preset bug.

When a prerendered route's stored route keeps a **trailing slash**, the Vercel
preset writes a Build Output `overrides` entry whose `path` keeps the trailing
slash (e.g. `{ "slash/index.html": { "path": "slash/" } }`). Vercel does **not**
serve the prerendered static file for `/slash/` from such an override. The
request falls through to the serverless function instead of being served from the
CDN. A clean override path (`{ "path": "slash" }`) is served statically as
expected.

This defeats prerendering for trailing-slash routes (every hit invokes the
function) and, on any app whose function can error, turns a static page into a
runtime failure.

## Versions

- `nitropack` 2.13.4 (via `nuxt` 4.4.8)
- `node` 24.18.0
- preset: `vercel`

## What the repro contains

Two prerendered pages, each rendering a server-side `useState` timestamp (frozen
at build time when served statically, fresh per request when served by the
function):

- `/slash/`: explicit **trailing-slash** route, override `{ "path": "slash/" }`, **broken**
- `/noslash`: no-slash route, override `{ "path": "noslash" }`, **works** (control)

`nitro.prerender.crawlLinks` is `false` (the Nitro default) so the trailing slash
survives into `nitro._prerenderedRoutes[].route`. With `crawlLinks: true` the
crawler normalizes discovered links via `withoutTrailingSlash`, which can mask
the override, but real apps still hit this via explicit `prerender.routes` and
via modules that emit trailing-slash routes, e.g. `@nuxtjs/i18n` and
`nuxt-site-config` with `trailingSlash: true`.

## Reproduce

```bash
npm install
NITRO_PRESET=vercel npm run build

# Inspect the generated overrides (note the trailing slash on `slash`):
node -e "console.log(require('./.vercel/output/config.json').overrides)"
#   'slash/index.html':   { path: 'slash/' }     (trailing slash, bug)
#   'noslash/index.html': { path: 'noslash' }     (control)

# Deploy and observe (any Vercel project):
npx vercel deploy --prebuilt
```

Then request each route a few times:

- `GET /slash/`: `x-vercel-cache: MISS`, body timestamp **changes** each request, served by the **function**
- `GET /noslash`: `x-vercel-cache: HIT`, body timestamp **frozen**, served **statically**

## Live demo

https://repro-nuxt-vercel-trailing-slash-override-4ufpl8wq9.vercel.app

- `/slash/`: https://repro-nuxt-vercel-trailing-slash-override-4ufpl8wq9.vercel.app/slash/ (MISS, re-rendered)
- `/noslash`: https://repro-nuxt-vercel-trailing-slash-override-4ufpl8wq9.vercel.app/noslash (HIT, static)

## Root cause

`nitropack` Vercel preset, `src/presets/vercel/utils.ts` (`generateBuildConfig`):

```ts
overrides: {
  ...Object.fromEntries(
    (nitro._prerenderedRoutes?.filter(r => r.fileName !== r.route) || [])
      .map(({ route, fileName }) => [
        withoutLeadingSlash(fileName),
        { path: route.replace(/^\//, '') },   // strips leading slash, KEEPS trailing slash
      ]),
  ),
},
```

Per the Vercel Build Output API v3 spec the override `path` is "the URL path
where the static file will be accessible from" and must be clean (no trailing
slash, no extension). Trailing-slash policy is expressed via 308 redirect
`routes` (e.g. `@vercel/routing-utils` `getTransformedRoutes({ trailingSlash })`),
not by appending a slash to the override `path`. So `{ path: "slash/" }` is
off spec and mis-serves the file.

See `ISSUE.md` for the full write-up to file at https://github.com/nitrojs/nitro/issues.
