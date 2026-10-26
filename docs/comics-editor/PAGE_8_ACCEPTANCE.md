# Page 8 — faithful reconstruction

## Selection

Page 8 exercises three panels, Jim, captions, overlapping silhouettes and distinct environments.

## Source audit (what exists)

| File | Role |
|------|------|
| `art/comics/HD/Kamigen_Page 8.png` | Published page (2482×3509) — **used** |
| `art/comics/SD/Kamigen_Page 8.png` | Published preview |
| `art/comics/scripts/page_8.txt` | Script / dialogue |
| `new/src/assets/characters/Jim.svg` | Affinity-flattened character **reference sheet** (no limb groups; not page-8 bar Jim) |
| `art/comics/assets/Character - Jim-01.png` | Raster reference sheet |

**Searched in repo + `comics-sources/`:** no layered page-8 master (Issue 01 sources start at page 22). Instagram crop and published HD/SD PNGs only.

**Obstacle:** Panel crops reproduce appearance but are not editable composition. For a real editable page with live dialogue from Affinity, use **page 124** (`page_124_editable.json`) — see `SOURCE_MANIFEST.md`. Jim character work uses prepared `Jim.svg` paths (`char_jim_artwork`), not crops.

## Faithful reconstruction approach

Because no layered page source exists, the reconstruction **extracts the published artwork** nondestructively:

- Crops → `art/comics/library/extracted/page8/panel_*_art.png` (original lettering preserved)
- Caption-cleared crops → `panel_*_art_clear_caption.png` (available when swapping to live lettering)
- Composition → `art/comics/compositions/page_8_reconstruction.json` uses the lettered crops
- Editable caption layers exist with the exact published dialogue but are **hidden by default** so print lettering stays visible; unhide (and optionally switch the image to the cleared crop) to edit live text
- HD original is never modified

Dialogue in the composition matches the published page exactly (no test language in the comic).

## Two separate demos

| Demo | Path | Purpose |
|------|------|---------|
| Faithful page | `page_8_reconstruction.json` | Published art + editable captions |
| Rig test | `jim_rig_test.json` | Articulation / expressions only — **labelled, not page art** |

Do not degrade the faithful page to demonstrate posing.

## Compare

`/comics/page_8_compare.html` — published page vs reconstruction.

## Remaining honest gaps

1. **No vector page source** — reconstruction is cropped published rasters, not Affinity groups.
2. **Caption lettering** — re-set as editable text over cleared caption boxes; archived lettered crops keep the original hand lettering.
3. **Jim poseable rig** — derived cutouts for the separate rig test; not a substitute for page-8 Jim.
