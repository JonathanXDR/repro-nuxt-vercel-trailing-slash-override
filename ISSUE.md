# Vercel preset emits trailing-slash override paths (`{ path: "foo/" }`) → prerendered HTML is served by the function, not statically

> Draft for https://github.com/nitrojs/nitro/issues/new (uses the Nitro 🐞 Bug report template).
> Searched open + closed issues first: closest is **#4242** (open, root `/` empty-path variant); this trailing-slash sub-route variant is undocumented. Related: #1651 (closed, vercel-static preset, 404), #14888 / PR #500 (the original "serve prerendered routes statically" fix).

## Environment

- Nitro: `2.13.4` (via Nuxt `4.4.8`)
- Node: `24.18.0`
- Preset: `vercel`
- nitro config: `prerender: { crawlLinks: false, routes: ['/', '/slash/', '/noslash'] }`

## Reproduction

Repo: https://github.com/JonathanXDR/repro-nuxt-vercel-trailing-slash-override
(StackBlitz: https://stackblitz.com/github/JonathanXDR/repro-nuxt-vercel-trailing-slash-override — note: WebContainers can't exercise the Vercel build/runtime, so use `vercel build` + deploy to observe the bug.)

Live demo (deployed with `vercel deploy --prebuilt`, protection off):
- https://repro-nuxt-vercel-trailing-slash-override-4ufpl8wq9.vercel.app/slash/ — falls through to the function
- https://repro-nuxt-vercel-trailing-slash-override-4ufpl8wq9.vercel.app/noslash — served statically

Minimal config (no Nuxt modules involved):

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  nitro: { prerender: { crawlLinks: false, routes: ['/', '/slash/', '/noslash'] } },
})
```

Steps:

```bash
npm install
NITRO_PRESET=vercel npm run build
node -e "console.log(require('./.vercel/output/config.json').overrides)"
npx vercel deploy --prebuilt
# then GET /slash/ and /noslash a few times and compare x-vercel-cache + a per-render value
```

## Describe the bug

For a prerendered route whose stored route keeps a **trailing slash**, the Vercel
preset writes a Build Output `overrides` entry whose `path` **keeps the trailing
slash**. Vercel then does not serve the prerendered static file at that URL; the
request falls through to the serverless (SSR) function.

Generated `.vercel/output/config.json` `overrides` from the repro:

```jsonc
{
  "index.html":          { "path": "" },
  "noslash/index.html":  { "path": "noslash" },   // control — served statically
  "slash/index.html":    { "path": "slash/" }     // BUG — trailing slash, served by the function
}
```

Observed serving behavior (3 requests each; the page renders a server-side
`useState(new Date().toISOString())`):

| Route | override `path` | `x-vercel-cache` | per-render timestamp | served by |
|-------|-----------------|------------------|----------------------|-----------|
| `/slash/`  | `slash/`   | `MISS` | **changes every request** | **function** ❌ |
| `/noslash` | `noslash`  | `HIT`  | frozen at build time      | static ✓ |
| `/`        | `` (empty) | `HIT`  | frozen at build time      | static ✓ |

Controlled check: taking the same build and changing **only** `slash`'s override
from `{ path: "slash" }` to `{ path: "slash/" }` flips `/slash/` from static to
function — confirming the trailing slash in the `path` is the sole cause.

### Root cause

`src/presets/vercel/utils.ts`, `generateBuildConfig()`:

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

`route.replace(/^\//, '')` removes the leading slash but preserves a trailing one,
so a prerendered `route` of `/slash/` becomes `{ path: "slash/" }`. Prerender
routes are seeded verbatim (`new Set(nitro.options.prerender.routes)`), and
`generateRoute` stores `_route = { route }` unchanged, so any trailing slash on
the route (from explicit `prerender.routes`, or from modules like `@nuxtjs/i18n`
/ `nuxt-site-config` with `trailingSlash: true`) flows straight into the override
`path`.

Per the [Build Output API v3 spec](https://vercel.com/docs/build-output-api/v3/configuration),
an override `path` is "the URL path where the static file will be accessible from"
and is always clean (no extension, no trailing slash, e.g. `blog.html → { path: "blog" }`).
There is no top-level `trailingSlash`/`cleanUrls` in config.json v3; trailing-slash
policy is expressed as 308 redirect `routes` (e.g. `@vercel/routing-utils`
`getTransformedRoutes({ trailingSlash })`). So `{ path: "slash/" }` is off-spec.

### Suggested fix

The override `path` must not carry a trailing slash. Two correct directions
(note that naively rewriting to `{ path: "slash" }` alone would serve the file at
`/slash` but leave the **canonical** `/slash/` unserved on a `trailingSlash`
site, since the preset currently emits **no** trailing-slash redirect routes):

1. **Omit the override for a prerendered `<dir>/index.html` whose route is the
   directory** — Vercel's default directory-index already serves
   `slash/index.html` at both `/slash` and `/slash/`. (This matches the
   known-working behavior of simply deleting these overrides from config.json.)
2. **Or** emit a clean, slash-free override `path` **and** companion 308
   trailing-slash redirect `routes` (e.g. via `@vercel/routing-utils`
   `getTransformedRoutes({ trailingSlash })`) so `/slash` and `/slash/` both
   resolve to the static asset.

This likely also generalizes #4242 (root `/` empty-path variant). Happy to open a PR.

## Additional context

This is the same family as the open issue **#4242** (root `/` served by the
function via the empty-path override) and the original #14888 / PR #500 ("serve
prerendered routes statically"). #4242 only covers the root path and states
non-trailing-slash sub-routes work; this report covers the **trailing-slash**
override-path variant, which #4242 does not. Real-world trigger: a Nuxt site with
`@nuxtjs/i18n` + `nuxt-site-config` (`trailingSlash: true`) and `crawlLinks: true`
produces `{ "de/index.html": { "path": "de/" } }` and serves `/de/` from the
function for the same reason.

## Logs

```sh
# overrides from .vercel/output/config.json (NITRO_PRESET=vercel npm run build)
{
  'index.html': { path: '' },
  'noslash/index.html': { path: 'noslash' },
  'slash/index.html': { path: 'slash/' }
}

# /slash/  (override path "slash/")
req1 http=200 x-vercel-cache=MISS renderedAt=2026-06-28T14:20:44.124Z
req2 http=200 x-vercel-cache=MISS renderedAt=2026-06-28T14:20:44.563Z
req3 http=200 x-vercel-cache=MISS renderedAt=2026-06-28T14:20:45.019Z   # changes -> function

# /noslash  (override path "noslash")
req1 http=200 x-vercel-cache=HIT renderedAt=2026-06-28T14:20:06.367Z
req2 http=200 x-vercel-cache=HIT renderedAt=2026-06-28T14:20:06.367Z
req3 http=200 x-vercel-cache=HIT renderedAt=2026-06-28T14:20:06.367Z    # frozen -> static
```
