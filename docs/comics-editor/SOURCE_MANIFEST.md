# Comics source manifest

Working copies and conversions live under `art/comics/work/source-import/` (not originals).  
Tooling: VectorCraft CLI `0.13.1` at `tools/vendor/vectorcraft/` (local binary; do not upload sources).

## Inventory summary

| Format | Count (approx) | Readable here? | Route |
|--------|----------------|----------------|-------|
| `.ai` (PDF-compatible) | ~114 | Yes (partial) | VectorCraft `info` / `convert` — PDF stream + live type; **editing-data layers blocked when file has symbols** |
| `.afdesign` | ~20 | Yes if complete | VectorCraft native Affinity reader |
| `.afphoto` | ~14 | Yes (by content) | VectorCraft (opens; often photo composites) |
| `.vectorcraft` | 2 | Yes if complete | Native JSON (+ trailing image blobs) |
| `.svg` | 5+ in sources | Yes | Direct / VectorCraft |
| `.psd` | 1 | Merged only | VectorCraft → single image |
| `.7z` | 1 | Not extracted | `p7zip` not installed; needs local unpack |
| Published PNG/JPG | many | Yes | Comparison references |

## Page 8

**No layered page-8 master** in `comics-sources/`. Issue 01 sources begin at page 22–30. Available: `art/comics/HD/Kamigen_Page 8.png`, Instagram `Page 8-9-01.png`. Panel crops remain comparison-only — not an editable reconstruction.

## Useful / blocked files

| File | Format | Contents | Status |
|------|--------|----------|--------|
| `new/src/assets/characters/Jim.svg` | SVG | Jim master | **Opened** — primary character source |
| `Issue 05/.../Kamigen Page 124.afdesign` | Affinity | Full page, Characters + Speech | **Opened** via VectorCraft |
| `Issue 05/Workflow Change.../Kamigen Page 128.afdesign` | Affinity (57MB) | Rich page, 23 text objs | **Opened** — heavy import warnings |
| `Issue 05/Kamigen Page 124.svg` | SVG export | Backgrounds + Speech text | **Opened** — Characters mostly rasterised in this export |
| `Issue 01/Kamigen Page 25.ai` etc. | AI/PDF | Pages with Jim mentions | **Opened** PDF part; layers from editing data **not** read (symbols) |
| `Issue 05/Kamigen Page 12x.afdesign` (many ~12MB) | Affinity | Truncated Dropbox sizes | **Blocked** — damaged/truncated |
| `Issue 05/Kamigen Page 134.vectorcraft` | VectorCraft | Truncated at 12MB | **Blocked** — JSON EOF |
| `Issue 05/Kamigen Page Blank.vectorcraft` | VectorCraft | Near-empty template | Opened (not useful art) |
| `Assets/Helios Escape Pod.afdesign` | Affinity | Prop paths | **Opened** cleanly |
| `.../Kamigen Page 133.psd` | PSD | Merged raster | Opened as image only |

## Conversion fidelity (verified routes)

### Illustrator `.ai`
- **Best route:** `vectorcraft-cli convert in.ai out.svg|png|vectorcraft`
- Survives: paths, many clips, **live text** (font fallback if missing — Cardenio Modern → Source Sans 3)
- Lost / limited: Illustrator editing-data layer tree when symbols present; private art outside artboards

### Affinity `.afdesign`
- **Best route:** VectorCraft native import → `.vectorcraft` / `.svg` / `.png`
- Survives: layers, groups, artboards, curves, many fills/gradients, clips, masks, text, embedded images
- Lost / warned: bitmap/pattern fills, layer effects, huge pixel layers (>64MP), some blend modes, outlined text, paragraph spacing; fonts (Laffayette Comic Pro, Bisaya MBF) missing locally
- Affinity does **not** write back from VectorCraft

### VectorCraft `.vectorcraft`
- Native; Page Blank OK; Page 134 **corrupt** (re-export from Affinity/AI needed)

## Character: Jim

Prepared from **`Jim.svg`** actual paths → `art/comics/library/characters/jim/prep/` (`char_jim_artwork`).  
One articulated arm. **No expression variants** in source — controls not exposed.

## Editable page chosen: 124

Composition: `art/comics/compositions/page_124_editable.json`  
Assets: `art/comics/library/pages/page124/`

## Export you may need to perform

1. **Re-sync truncated Affinity files** (Issue 05 pages at exactly 12–12.8MB) from Dropbox/original disk — then VectorCraft can open them.
2. **Re-save `Kamigen Page 134.vectorcraft`** (or export SVG from VectorCraft) — current file is truncated mid-JSON.
3. **Optional Affinity → SVG** for page 8 if a master exists elsewhere: File → Export → SVG, keep text as text, preserve layers/groups.
4. ~~Install fonts~~ — done: `comics-sources/fonts/` copied to `art/comics/library/fonts/` and `~/.local/share/fonts/kamigen-comics/` (VectorCraft now resolves Laffayette / Cardenio / Bisaya as **exact**).
5. Unpack `Kamigen Page 128.7z` locally if it holds a complete Affinity/Krita source.

## Do not

- Upload unpublished sources to third-party converters  
- Treat panel crops or the geometric cutout Jim as production acceptance  
- Hide live lettering behind baked-in lettering and call the page done


## Page 124 fidelity (2026-10-18)

- Pattern fills (`FilB`) empty at VectorCraft import — see `PAGE_124_DISCREPANCY.md` and `VECTORCRAFT_FILB.md`.
- Recovery: Affinity Characters raster clipped into empty clothing paths (`characters_affinity_fill.png`).
- Speech: hide extracted oval layer; live ellipse bubbles in composition.
- Characters split into `pages/page124/characters/figure_*.svg` (not poseable rigs).
