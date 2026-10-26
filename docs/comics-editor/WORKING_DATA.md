# Comics editor — code vs working data

## Code (intended for Git)

- `comics-editor/` — editor shell, CSS, live `preview.html`
- `src/comics-editor/` — composition model, renderer, bubble geometry, export, rigs
- `src/comics-reader.js` — public reader entry
- `tools/comics-editor-server.js`, `tools/comics-editor-test.js`
- `tools/comics-editor-fixtures/` — synthetic tests (no HD extracts)
- `tools/jim-prep/`, `tools/page124/` — reproducible prep scripts
- Build wiring: `package.json`, `rollup.config.js` (comics-reader), related pug sources

## Working data (local, gitignored for this WIP)

- `art/comics/library/` — extracted/prepared assets, fonts copies, catalogs
- `art/comics/compositions/` — editable JSON pages
- `art/comics/exports/` — PNG/SVG exports from the editor
- `.comics-editor-autosave/`, `.comics-editor-preview/`, `.comics-editor-review/`

Existing tracked production artwork (e.g. `art/comics/HD/`, blog art) stays in Git and is **not** covered by these ignores.

## Preparing resources locally

```bash
npm run editor
# open http://127.0.0.1:9977/comics-editor/?composition=art/comics/compositions/page_124_editable.json
```

Page 124 rebuild (requires `comics-sources/`):

```bash
python3 tools/page124/improve_page124.py
python3 tools/page124/rebuild_decomposed.py
```

Shared-resource rule: place instances with `src` + optional `sourceRect` against one shared raster/SVG. Do not emit a new cropped file per placement of the same artwork.

## Tests

```bash
npm run test:comics-editor
```

Uses fixtures under `tools/comics-editor-fixtures/`. If local library files exist, optional catalog/page-8 checks also run.
