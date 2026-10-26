# SVG support notes

The Kamigen Comics Editor and shared renderer display SVG assets via nested `<image href="…">` (or inline fetch for export when needed). Aspect ratio is preserved by default using the asset’s intrinsic `width`/`height` or `viewBox`.

## Tested against repository artwork

- `new/src/assets/characters/*.svg` — Affinity/Serif-exported character art with gradients, clipPaths, and embedded raster via `xlink:href` image refs.
- Brand SVGs under `new/src/assets/`.

## Supported (expected to look correct)

- Basic shapes, paths, groups, transforms
- Solid fills and strokes
- Linear/radial gradients defined in the file
- Opacity / `fill-opacity` / `stroke-opacity`
- `clipPath` within the SVG
- Embedded images referenced by relative `xlink:href` / `href` **when those files remain next to the SVG**
- `viewBox` sizing

## Unsupported or fragile (not silently “fixed”)

| Feature | Behaviour |
|---------|-----------|
| External fonts inside SVG | May fall back to system fonts |
| SVG filters (`feGaussianBlur`, etc.) | Browser-dependent; prefer composition effects |
| SMIL / CSS animations in assets | Not part of the composition timeline; may run in browser |
| Scripts inside SVG | Stripped / not executed by design |
| Incomplete relative image links after moving files | Missing-asset indicator |
| Very large nested rasters | Performance cost; prefer library PNGs at production size |
| Text-to-path lettering vs live text | Asset text is art, not editable dialogue |

When an SVG cannot be represented faithfully in SVG export of a full page, the exporter reports the limitation instead of inventing geometry.
