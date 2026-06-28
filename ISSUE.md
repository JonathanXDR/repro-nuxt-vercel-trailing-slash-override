# Vercel preset emits trailing-slash override paths

## Environment

- Nitro: `2.13.4` (via Nuxt `4.4.8`)
- Node: `24.18.0`
- Preset: `vercel`

## Reproduction

- **Repo:** https://github.com/JonathanXDR/repro-nuxt-vercel-trailing-slash-override
- **Live demo:** [`/slash/`](https://repro-nuxt-vercel-trailing-slash-override-4ufpl8wq9.vercel.app/slash/) (broken) vs [`/noslash`](https://repro-nuxt-vercel-trailing-slash-override-4ufpl8wq9.vercel.app/noslash) (works)

`nuxt.config.ts` (no Nuxt modules needed):

```ts
export default defineNuxtConfig({
  nitro: { prerender: { crawlLinks: false, routes: ['/', '/slash/', '/noslash'] } },
})
```

```bash
NITRO_PRESET=vercel npm run build
node -e "console.log(require('./.vercel/output/config.json').overrides)"
npx vercel deploy --prebuilt   # then GET /slash/ and /noslash a few times
```

> StackBlitz/WebContainers can't run the Vercel build/runtime, so use a real `vercel build` + deploy to observe it.

## Describe the bug

A prerendered route with a **trailing slash** gets a Build Output `overrides` entry whose `path` keeps the slash, and Vercel does not serve the static file from such a path. The request falls through to the SSR function.

Generated `overrides`:

```jsonc
{
  "index.html":         { "path": "" },        // static ✓
  "noslash/index.html": { "path": "noslash" }, // static ✓
  "slash/index.html":   { "path": "slash/" }   // function ❌, trailing slash
}
```

Each page renders a server-side `useState(new Date().toISOString())` (frozen if static, fresh per request if the function runs):

| Route | override `path` | `x-vercel-cache` | timestamp over 3 requests | served by |
|---|---|---|---|---|
| `/slash/`  | `slash/`  | `MISS` | **changes each request** | **function** ❌ |
| `/noslash` | `noslash` | `HIT`  | frozen | static ✓ |

Changing **only** `slash`'s override from `slash` to `slash/` on the same build flips it from static to function, so the trailing slash is the sole cause.

### Root cause

`src/presets/vercel/utils.ts`, `generateBuildConfig()`:

```ts
{ path: route.replace(/^\//, '') }   // strips the leading slash, KEEPS the trailing slash
```

Prerender routes are stored verbatim, so a `/slash/` route becomes `{ path: "slash/" }`. Per the [Build Output API v3 spec](https://vercel.com/docs/build-output-api/v3/configuration) an override `path` is always slash-free (`blog.html → { path: "blog" }`). Trailing-slash behavior is expressed via 308 redirect `routes`, not the override `path`. So `{ path: "slash/" }` is off-spec.

### Suggested fix

Make the override `path` slash-free, either:

1. **Omit the override** for a `<dir>/index.html` (Vercel's directory-index already serves it at both `/dir` and `/dir/`), or
2. emit a clean `path` **plus** 308 trailing-slash redirect `routes` (e.g. `@vercel/routing-utils` `getTransformedRoutes({ trailingSlash })`).

Note: rewriting to `{ path: "slash" }` *alone* would leave the canonical `/slash/` unserved, since the preset emits no redirect routes. Likely also fixes #4242. Happy to open a PR.

## Additional context

Real-world trigger: a Nuxt site using `@nuxtjs/i18n` + `nuxt-site-config` with `trailingSlash: true` produces `{ "de/index.html": { "path": "de/" } }` and serves `/de/` from the function.

Related:

- #4242 (open, root `/` variant)
- #1651 / PR #500 (original "serve prerendered routes statically" fix)

## Logs

```sh
# /slash/  (override "slash/")  -> timestamp changes = function
req1 x-vercel-cache=MISS renderedAt=2026-06-28T14:20:44.124Z
req2 x-vercel-cache=MISS renderedAt=2026-06-28T14:20:44.563Z
req3 x-vercel-cache=MISS renderedAt=2026-06-28T14:20:45.019Z

# /noslash (override "noslash") -> timestamp frozen = static
req1-3 x-vercel-cache=HIT renderedAt=2026-06-28T14:20:06.367Z
```
