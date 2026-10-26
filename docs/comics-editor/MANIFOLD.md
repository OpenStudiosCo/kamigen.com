# Manifold reference and attribution

## Identified project

The intended Manifold reference is **Open Studios’ Manifold** design tool:

- Site: https://manifold.paulbrzeski.com
- Source: https://github.com/OpenStudiosCo/manifold
- Licence: **MIT** (Copyright © 2017 Paul Brzeski) — see that repository’s `LICENSE`

Manifold is a hybrid 2D/3D experimental tool (Fabric.js canvas, Three.js preview, raster→vector tracing) for indie game and illustration workflows. Local checkout used during planning: `github-pages/manifold` alongside this monorepo tree.

## What we adopted

Ideas and UX patterns (not a line-by-line fork):

- Desktop workspace: asset **library**, central **canvas**, **layers** / details, top **toolbar**
- Layer list with forward/back ordering
- Library browsing of project assets
- Keyboard-driven editing habits and drop-oriented asset intake

## What we did not reuse

Manifold’s Fabric.js document model, Fomantic UI shell, Potrace/ImageTracer pipeline, and Three.js extrusion path are aimed at freeform illustration and 3D mesh prep. Kamigen Comics Editor needs:

- Versioned **composition JSON** checked into Git
- One **shared SVG renderer** for editor preview, public demo pages, and PNG export
- Panel grids, speech bubbles, transcripts, and opt-in web effects

Forking Fabric into the public reader would couple published pages to an editor runtime. Therefore this tool is an **independent implementation** inspired by Manifold’s useful production ideas, under Kamigen’s repository licence, with Manifold credited for concept/UX influence.

MIT licence text for Manifold is preserved at `docs/comics-editor/licenses/MANIFOLD-MIT.txt`.
