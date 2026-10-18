# Kamigen website theme

This document describes the production theme introduced in October 2026. The
approved standalone `home.html` remains a visual reference, but it is no longer
the source of the live homepage.

## Source of truth

- `src/templates/layout.pug` owns baseline document metadata and fonts.
- `src/templates/scripts.pug` owns shared browser code and deferred analytics.
- `src/templates/website.pug` owns the shared masthead, accessible mobile
  navigation, main landmark and footer.
- `src/templates/home.pug` owns homepage content and its island illustration.
- `src/templates/wiki.pug` owns the World/Production sidebar used by wiki and
  blog pages.
- `src/templates/comic_reader.pug` owns all comic page navigation, artwork,
  transcripts and comments.
- `src/templates/game-vendor-scripts.pug` owns the shared legacy WebGL runtime
  dependencies used by both game entry points.
- `src/styles/website.styl` owns design tokens, components, responsive rules and
  legacy editorial-layout compatibility.
- `src/site.js` owns shared navigation, motion controls and optional live-island
  loading. Rollup compiles it to `dist/site.js`.
- `src/jumbotron.js` owns the opt-in island scene. Rollup compiles it to
  `dist/jumbotron.js`; do not edit the generated bundle directly.
- `tools/generate-site-metadata.js` adds route-specific canonical and social
  metadata to generated pages, then rebuilds `sitemap.xml`, `robots.txt` and
  `llms.txt` from the public Pug page sources.

Generated public HTML is ignored by Git and should not be edited directly.
`npm run build` recreates it from Pug sources. Files in `dist/` are also build
outputs, but remain committed for the current static deployment workflow.

The game is the only regular page that loads Semantic UI, jQuery, Three.js and
the WebGL vendor scripts. Marketing, editorial and comic-reader pages must not
add that stack globally. Disqus loads only when its comments region approaches
the viewport; analytics waits until the load event and an idle period.

## Design principles

The theme uses the approved ocean, gold, cyan and magenta palette with strong
Bebas Neue display type and readable Source Sans 3 body copy. Light editorial
sections provide contrast with deep-ocean story and reader surfaces. Material
references are limited to the collection's woven band and the atlas photograph
so they retain meaning rather than becoming decoration.

All regular sections use `--measure` and `--inset` for shared alignment. Long
articles use `--reading`. Full-bleed art may extend outside those constraints,
but its text remains aligned to them.

## Interaction requirements

- The mobile menu is a real button with `aria-expanded` and `aria-controls`.
  It traps interaction by making the page content inert, closes on Escape and
  restores focus to the trigger.
- The homepage can pause ambient bird, water and island motion.
- Reduced-motion preferences disable continuous motion and transitions.
- The 3D island is opt-in. The still image remains visible until a canvas is
  ready, remains on failure, and replacing the iframe document stops rendering.
- Comic artwork keeps its natural aspect ratio and page-to-page links remain
  the primary reading action.

## Build and review

From the repository root:

```sh
npm test
```

This performs a clean source build and validates metadata, duplicate IDs, image
alternative text and local links in every public page. Use `npm run build` when
validation is not required, or `npm run validate` to inspect an existing build.

`npm run pug` also runs the metadata generator. Use `npm run seo` only when
generated HTML already exists and just the crawler output needs refreshing.
All build and preview tools are installed locally by `npm install`; no global
packages or elevated permissions are required.

Review at minimum:

- `/` at desktop, tablet and mobile widths
- `/comics.html`, one issue index and pages 1 and 133
- `/blog.html` and a long article with embedded media
- `/wiki.html`, characters, locations and image galleries
- `/game.html`, `/game2.html` and `/shop.html`

Check keyboard navigation, visible focus, menu Escape behavior, horizontal
overflow, natural artwork proportions and both motion preferences.

Run Lighthouse against a production-like HTTP server with caching and
compression enabled. The repository's `npm run dev` server deliberately sends
development caching headers, so its cache-policy findings are not representative
of deployment.
