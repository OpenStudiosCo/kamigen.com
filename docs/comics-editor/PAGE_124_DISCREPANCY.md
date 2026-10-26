# Page 124 — conversion discrepancy table

Published reference: https://kamigen.com/comics/page_124.html  
Sources: `comics-sources/Issue 05/Kamigen Page 124.afdesign` (+ Workflow Change copy), `Kamigen Page 124.svg` (Affinity export), VC `page124_af.vectorcraft` / PNG, extracted `art/comics/library/pages/page124/`.

Composition: `art/comics/compositions/page_124_editable.json`  
Editor: `http://127.0.0.1:9977/comics-editor/?path=art/comics/compositions/page_124_editable.json`  
Equal-size compares: `art/comics/library/pages/page124/compare/compare_ref_vs_after_595x842.png`, `compare_before_ref_after_595x842.png` (+ `pass3_*` crops).

Rebuild / improve:
- `python3 tools/page124/improve_page124.py` — Affinity baselines, figure split, silhouette FilB
- `python3 tools/page124/rebuild_decomposed.py` — dialogue shapes only (guards mid-row)

| Issue | Stage responsible | Fix | Verification | Remaining limitation |
|-------|-------------------|-----|--------------|----------------------|
| Jim patterned shirt → plain white | **Renderer + VC FilB loss**: SVG-as-`<image>` blocks nested fills; Affinity→VC emptied `FilB` | Clip Affinity Characters raster into clothing paths; **inline figure SVGs** via `svgCache` | `pass3_editor_jim_shirt.png` vs `pass3_ref_jim_shirt.png` — pattern present | Not a live Affinity pattern; clothing fill is shared raster (`characters_affinity_fill.png`). Upstream FilB importer still needed (`VECTORCRAFT_FILB.md`) |
| Only 3 of 5 top-panel characters | Dark silhouettes + missing FilB tonal fill on silhouette bodies | Active `figure_3,4,7,8,9`; silhouette Affinity-fill clips; labels corrected (7=frog, 8=red) | `pass3_editor_top_cast.png` — five figures | Silhouette faces still flatter than published; blend modes (`overlay` opacity 0.25) are soft in browser |
| Mid-right Jim/red backs | `figure_12` FilB clips misaligned | Panel-clipped Affinity-fill crops: `figure_midright_jim_back.svg`, `figure_midright_red_back.svg` | `pass3_editor_mid_right.png` | Raster fallback (not clean vectors from figure_12); hair edges show crop aliasing |
| Mid-row dialogue swapped | Earlier rebuild matched wrong Affinity DOM order / wrong published report (“shh left, crab center”) | Affinity **page-space text positions** + asserts in `improve_page124.py` / `rebuild_decomposed.py`: left=crab, centre=shh, right=Ahhh | Editor mid band + transcript | Affinity SVG text transforms alone (without resolving parent matrices) are unsafe |
| Lettering size / spacing / placement | Browser metrics vs Affinity glyph advances; prior bubble-centre text anchors | Affinity 12px / 16px leading; **left-aligned** `textX`/`textY` from Affinity baselines; `fontWeight:400`; Dialogue UI exposes size, line height, letter spacing, align, textX/Y | Soft match on `pass3_*_dialogue_top.png` | Not Affinity per-glyph `tspan` x advances; Laffayette metrics still browser-side |
| Combined character sheet as production layer | Early extract kept one Characters group | Sheet hidden; active per-figure layers; mid-center **split** into `figure_1_red` + `figure_1_jim`; “Enter group” path hide list | Layers panel / hide-one-character + round-trip test | Affinity subgroups unnamed — not poseable rigs; split is centroid-x clustering, not named source groups |
| Panel backgrounds | Affinity panel JPEGs soft vs VC/published | Per-panel Affinity JPEGs are active production BGs | Panel hide test | Softness / colour shift vs published print |

## Active editable inventory (production)

- **Panels (5):** Top, Mid-left, Mid-center, Mid-right, Bottom (+ hidden page-refs panel)
- **Backgrounds (5):** `panel_top.jpg`, `panel_window_{left,center,right}.jpg`, `panel_bottom.jpg`
- **Characters:** `figure_3,4,7,8,9` (top), `figure_2` (mid-left), `figure_1_red` + `figure_1_jim` (mid-center; combined `figure_1` hidden), `figure_10,11` + midright Jim/red backs (mid-right), `figure_5,6` (bottom)
- **Dialogue (6):** each owns `shapeSrc` bubble path + live text (`dialogue_1`…`6`) with Affinity baselines
- **Hidden refs:** VC import composite, combined characters sheet, published overlay, superseded `figure_1`

## Mid-row copy (authoritative)

Do **not** reintroduce “shh left, crab center”.

| Panel | Speaker | Text |
|-------|---------|------|
| Mid-left | Frog | That's / one big / crab... |
| Mid-center | Woman (+ Jim) | shh... hear that? / someone's coming... |
| Mid-right | Jim (backs) | Ahhh.. poop. |

Affinity Speech text baselines (page space) agree with published art.

## Stage checklist (appearance)

1. **Affinity `.afdesign`** — authoritative; not opened natively here  
2. **Affinity `.svg` export** — backgrounds + speech text; Characters = raster (patterns visible in raster) + vector strokes  
3. **VectorCraft import** — first loss of `FilB` patterns; effects skipped  
4. **VC PNG** — confirms white Jim shirt (import loss, not export-only)  
5. **Extracted `characters.svg` / `figure_*.svg`** — vector paths; FilB recovery + absolute fill hrefs  
6. **Editor / shared renderer** — SVG inlining + per-bubble shapes + multi-panel decomposition  

## Review passes

1. **Whole page:** `compare_ref_vs_after_595x842.png`, `compare_before_ref_after_595x842.png`  
2. **Detail:** `pass3_*` jim_shirt / top_cast / mid / mid_right / dialogue_top  
3. **Editing round-trip:** moved Jim, hid frog, nudged top BG, moved+resized dialogue_1, nudged mid-center red + `hiddenPartIds`; save/reopen confirmed; reference values restored; mid-row guard still holds  
