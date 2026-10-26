# VectorCraft local patches (Kamigen)

Pinned upstream: [storytold/vectorcraft](https://github.com/storytold/vectorcraft) tag **`v0.13.1`** (`904f0fe5227bd987d55319e89a38b4b8f046998c`).

Source checkout (gitignored binary release remains under `tools/vendor/vectorcraft/`):

```text
tools/vendor/vectorcraft-src/   # git clone --branch v0.13.1
```

## Affinity `FilB` (bitmap / pattern fills)

**Symptom (page 124):** Jim’s patterned shirt becomes a hole (`Paint::None`) so the page reads as plain white clothing. VectorCraft import warns:

`Affinity: not imported or approximated: bitmap and pattern fills (left empty)`

**First failure stage:** Affinity `.afdesign` → VectorCraft import (`crates/affinity/src/paint.rs`, `FilB` arm), not SVG export.

```rust
// crates/affinity/src/paint.rs  (v0.13.1)
b"FilB" => {
    r.warn("bitmap and pattern fills (left empty)");
    Some(Paint::None)
}
```

**Patch status:** A faithful `FilB` → `Paint::Pattern` / image-fill importer needs Affinity’s bitmap-fill object layout (tile bitmap id, pattern transform, clip). Not implemented in this pin without a regression fixture from a minimal Affinity `FilB` sample.

**Kamigen fallback (page 124):** `art/comics/library/pages/page124/characters_affinity_fill.png` is the Affinity SVG export’s Characters raster (`#_Image16`), page-aligned. Empty clothing paths in `characters.svg` are filled by clipping that raster to the path geometry (`class="kce-recovered-filb-fill"`). Surrounding strokes/gradients stay vector-editable.

## Rebuild notes

Do not edit the installed `vectorcraft-cli` binary in place. Any importer change should be a forked commit on `vectorcraft-src` plus `cargo build --release` of the CLI, with this README updated to the fork SHA.
