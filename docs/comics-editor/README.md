# Kamigen Comics Editor

Local authoring tool for layered comic compositions. Working name: **Kamigen Comics Editor**.

## Start

```bash
npm run editor
```

Open [http://127.0.0.1:9977/comics-editor/](http://127.0.0.1:9977/comics-editor/).

The authoring server binds to **localhost only**, validates paths, and writes only under:

- `art/comics/compositions/`
- `art/comics/library/` (imports + `assets.json`)
- `art/comics/exports/`
- `.comics-editor-autosave/` (recovery; gitignored)

It is **not** required for the deployed website.

## Layout

| Path | Role |
|------|------|
| `comics-editor/` | Local editor UI (excluded from public SEO) |
| `src/comics-editor/` | Shared composition + renderer modules |
| `art/comics/compositions/` | Editable composition JSON |
| `art/comics/library/` | Asset catalog + imports/placeholders |
| `art/comics/exports/` | PNG exports checked into Git when desired |
| `comics/composition-demo.html` | Public demo of shared renderer (build via `npm run pug`) |

## Demonstration

- Composition: `art/comics/compositions/demo-sample.json`
- Reader demo: `/comics/composition-demo.html` (after `npm run build` or `npm run pug`)
- Sample uses existing Kamigen character SVGs; dialogue is labelled non-canon.

## Page 8 faithful reconstruction

- Faithful page (published art crops): `art/comics/compositions/page_8_reconstruction.json`
- Jim rig test (labelled, not page art): `art/comics/compositions/jim_rig_test.json`
- Compare: `/comics/page_8_compare.html`
- Source audit: [PAGE_8_ACCEPTANCE.md](./PAGE_8_ACCEPTANCE.md)

## Tests

```bash
npm run test:comics-editor
```

## Manifold

See [MANIFOLD.md](./MANIFOLD.md). MIT-licensed inspiration for workspace UX; independent SVG/JSON implementation for comic production.
