# Preparing a poseable character

## Artwork reality check

Kamigen character SVGs under `new/src/assets/characters/` are flattened Affinity/Serif exports. They typically contain:

- Ungrouped paths and gradients
- Clip paths and embedded rasters
- No stable limb / eye / mouth group ids

They are suitable as **static artwork** or **reference sheets**, not as production cutout rigs.

## Asset kinds

| Kind | Use |
|------|-----|
| `static` | Single SVG/PNG in a panel (props, backgrounds, legacy characters) |
| `reference-sheet` | Shown in the library as reference only — not added as a poseable instance |
| `poseable` | `character.json` + part/face SVGs under `art/comics/library/characters/<id>/` |

## Steps to add another poseable character

1. Keep the original SVG untouched as the reference sheet.
2. Create `art/comics/library/characters/<slug>/`.
3. Draw or separate parts into `parts/*.svg` (torso, head, arms, legs, hands, feet as needed).
4. Create face overlays in `faces/*.svg` if using `expressionMode: "faceSwap"`.
5. Write `character.json` with parts, pivots, parent links, pose library, and expressions.
6. Register the character in `art/comics/library/assets.json` with `"kind": "poseable"` and `"characterDef": "art/comics/library/characters/<slug>/character.json"`.
7. Mark the original SVG asset as `"kind": "reference-sheet"` so it is not offered as a fake poseable.

## What the editor requires

- Stable part ids and parent relationships
- Pivot points in part local coordinates
- `parentAttach` (or torso `joints` map) for attachment
- Optional rotation limits
- Poses as local part rotations (not page coordinates)
- Expressions that the artwork can actually show

## Current poseable library

- **Jim artwork** (`char_jim_artwork`, `kind: groupedSvg`) — **primary.** Actual paths from `Jim.svg` with one articulated arm (`neutral` / `arm_raised` / `arm_wave`). No expression controls (source has a single mouth). See `art/comics/library/characters/jim/prep/PREP.md`.
- **Jim cutout** (`char_jim_poseable`) — legacy geometric experiment only. Not production acceptance.

## Source recovery

See `docs/comics-editor/SOURCE_MANIFEST.md`. Affinity/AI pages open via local VectorCraft CLI; page 8 has no layered master in `comics-sources/` — use page 124 for editable reconstruction.
