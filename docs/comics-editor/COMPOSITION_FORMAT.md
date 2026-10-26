# Kamigen comic composition format

Versioned JSON for editable comic pages. Readable by hand and by the shared renderer.

## Envelope

```json
{
  "format": "kamigen-comic-composition",
  "version": 1,
  "id": "comp_demo_sample",
  "title": "Editor sample (non-canon)",
  "created": "2026-10-18T00:00:00.000Z",
  "modified": "2026-10-18T00:00:00.000Z",
  "page": { },
  "panels": [ ],
  "transcript": [ ],
  "readingOrder": [ ]
}
```

- `format` — constant identifier.
- `version` — integer schema version. Loaders must reject unsupported majors.
- `id` — stable composition id (filename stem may match).
- `page` — authored coordinate space (not CSS pixels).
- Stable element `id` values must not be rewritten on unrelated edits.
- Asset references use repository-relative paths and `assetId` keys from the library catalog. Do not embed base64 image data.

## Page

| Field | Type | Notes |
|-------|------|--------|
| `width`, `height` | number | Authored units (default 800×1200). |
| `background` | colour string | Page fill. |
| `margin` | number | Outer margin hint for presets/guides. |
| `guides` | boolean | Editor guides preference (ignored by reader). |
| `snap` | boolean | Editor snap preference. |

Display scales the whole page uniformly. Panel layout is not reflowed per viewport.

## Panels

Ordered list. Each panel:

| Field | Type | Notes |
|-------|------|--------|
| `id` | string | Stable. |
| `name` | string | Optional label. |
| `x`, `y`, `width`, `height` | number | Page coordinates. |
| `gutter` | number | Visual inset hint (layout presets). |
| `border` | `{ width, colour }` | Panel stroke. |
| `cornerRadius` | number | Rounded rectangle. |
| `background` | colour | Panel fill. |
| `clip` | boolean | Clip layers to panel bounds (default `true`). |
| `allowBleed` | boolean | When true with `clip:false`, artwork may extend outside. |
| `overlay` | effect overlay \| null | Affects whole panel under text/bubbles. |
| `layers` | layer[] | Bottom → top (index 0 is back). |

## Layers

Common fields: `id`, `type`, `name`, `x`, `y`, `width`, `height`, `rotation`, `opacity`, `visible`, `locked`, `flipX`, `flipY`, `effects`.

### `image`

- `assetId`, `src` (repo-relative path), `preserveAspectRatio` (default true).

### `shape`

- `shape`: `rect` \| `ellipse`
- `fill`, `stroke`, `strokeWidth`

### `text` / `bubble`

- `text` — editable string; `\n` for manual breaks.
- `role`: `speech` \| `thought` \| `caption` \| `narration` \| `note`
- `fontFamily`, `fontSize`, `fontWeight`, `fontStyle`, `textAlign`, `lineHeight`, `colour`
- `padding`, `fill`, `stroke`, `strokeWidth`, `cornerRadius`
- `tail` (speech/thought): `{ enabled, x, y, direction }` in layer-local coords for tip.
- `translation` — optional secondary string (cultural note / translation).
- `overflowWarn` — editor may set when text exceeds box; reader ignores.

Bubbles move as one element (shape + tail + text).

### Effects (per layer or panel overlay)

Named, non-executable settings:

- `dropShadow`: `{ enabled, colour, opacity, blur, offsetX, offsetY }`
- `outline`: `{ enabled, colour, width }`
- `blur`: `{ enabled, radius }`
- `glow`: `{ enabled, colour, blur, opacity }`
- `tint`: `{ enabled, colour, opacity }`
- `overlay`: `{ enabled, kind: "colour"\|"gradient"\|"image", ... }`
- `blendMode`: CSS blend mode name from the supported set
- `pulseGlow` (opt-in web): `{ enabled, colour, minOpacity, maxOpacity, durationMs }` — still appearance when `prefers-reduced-motion`

## Transcript and reading order

`transcript` entries: `{ id, panelId, layerId?, speaker?, text, translation? }`.

`readingOrder`: array of transcript or layer ids for accessibility outside the visual layout.

## Serialization rules

- Pretty-print with 2-space indent and trailing newline.
- Deterministic key order within objects where practical (writers sort known keys).
- Omit undefined; keep `null` only when meaningful.
- Do not rewrite unrelated panels/layers when saving a change.
