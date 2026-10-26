#!/usr/bin/env node
/**
 * Focused checks for composition serialization, bubble geometry, layer ordering.
 * Does not require committing large extracted comic assets — uses fixtures under
 * tools/comics-editor-fixtures/. Local artwork verification is separate.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const FIXTURES = path.join(ROOT, 'tools', 'comics-editor-fixtures');

async function loadModule(rel) {
  return import(pathToFileURL(path.join(ROOT, rel)).href);
}

async function run() {
  const mod = await loadModule('src/comics-editor/composition.js');
  const geom = await loadModule('src/comics-editor/bubble-geometry.js');
  const {
    applyGridPreset,
    createEmptyComposition,
    createImageLayer,
    createBubbleLayer,
    parseComposition,
    reorderLayer,
    replaceLayerVariant,
    serializeComposition,
    validateComposition,
    rebuildTranscript,
    FORMAT_NAME
  } = mod;

  // Serialization / validation
  const comp = createEmptyComposition({ id: 'test_comp', title: 'Test' });
  applyGridPreset(comp, 'three-row');
  assert.strictEqual(comp.panels.length, 3, 'three-row preset yields 3 panels');
  const layer = createImageLayer({
    id: 'layer_a',
    name: 'A',
    assetId: 'fixture_a',
    src: 'tools/comics-editor-fixtures/placeholder-a.svg',
    width: 100,
    height: 100
  });
  const layerB = createImageLayer({
    id: 'layer_b',
    name: 'B',
    assetId: 'fixture_b',
    src: 'tools/comics-editor-fixtures/placeholder-b.svg',
    width: 80,
    height: 80,
    x: 10,
    y: 10,
    sourceRect: { x: 0, y: 0, width: 40, height: 40, assetWidth: 80, assetHeight: 80 }
  });
  comp.panels[0].layers.push(layer, layerB);
  const bubble = createBubbleLayer({
    id: 'bubble_fx',
    role: 'speech',
    text: 'Hello',
    width: 160,
    height: 70
  });
  assert.ok(bubble.tail.enabled);
  assert.ok(bubble.tail.tipY > bubble.height);
  comp.panels[0].layers.push(bubble);
  rebuildTranscript(comp);

  const json = serializeComposition(comp);
  assert.ok(json.includes(FORMAT_NAME));
  assert.ok(json.endsWith('\n'));
  const roundTrip = parseComposition(json);
  assert.strictEqual(roundTrip.id, 'test_comp');
  assert.strictEqual(roundTrip.panels[0].layers.length, 3);
  assert.ok(roundTrip.panels[0].layers[1].sourceRect, 'sourceRect survives serialize');
  assert.ok(roundTrip.panels[0].layers[2].tail.baseWidth, 'tail model survives serialize');

  // Layer ordering
  let layers = [layer, layerB];
  layers = reorderLayer(layers, 'layer_a', 'front');
  assert.deepStrictEqual(layers.map((l) => l.id), ['layer_b', 'layer_a']);
  layers = reorderLayer(layers, 'layer_a', 'back');
  assert.deepStrictEqual(layers.map((l) => l.id), ['layer_a', 'layer_b']);

  // Variant replace preserves placement
  const replaced = replaceLayerVariant(layers[1], {
    id: 'fixture_b',
    src: 'tools/comics-editor-fixtures/placeholder-b.svg',
    name: 'B',
    width: 1080,
    height: 1080
  });
  assert.strictEqual(replaced.x, layers[1].x);
  assert.strictEqual(replaced.width, layers[1].width);

  // Fixture composition validates without extracted library art
  const fixturePath = path.join(FIXTURES, 'minimal-composition.json');
  const sample = parseComposition(fs.readFileSync(fixturePath, 'utf8'));
  const check = validateComposition(sample);
  assert.ok(check.ok, check.errors.join('; '));
  assert.ok(sample.panels.some((p) => p.layers.some((l) => l.type === 'bubble')));

  const bad = validateComposition({ format: 'nope', version: 1 });
  assert.ok(!bad.ok);

  // Bubble geometry: continuous path + resize policy
  const d = geom.buildSpeechBubblePath(200, 90, 20, {
    enabled: true,
    tipX: 70,
    tipY: 120,
    attach: 0.12,
    baseWidth: 30,
    curve: 0.3
  });
  assert.ok(d.includes('M '), 'path starts');
  assert.ok(d.trim().endsWith('Z'), 'path closed');
  assert.ok(!/NaN/.test(d), 'path has no NaN');

  const scaled = geom.scaleTailForBodyResize(
    { enabled: true, tipX: 100, tipY: 140, attach: 0.2, baseWidth: 28, curve: 0.4 },
    200,
    100,
    300,
    150
  );
  assert.ok(Math.abs(scaled.tipX - 150) < 1e-6);
  assert.ok(Math.abs(scaled.tipY - 210) < 1e-6);
  assert.strictEqual(scaled.attach, 0.2);
  assert.strictEqual(scaled.baseWidth, 28);

  // Character rig fixture (no dependency on art/comics/library)
  const rigMod = await loadModule('src/comics-editor/character-rig.js');
  const jimDef = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'jim-cutout.json'), 'utf8'));
  const resolved = rigMod.resolvePartTransforms(jimDef, rigMod.defaultPartState(jimDef));
  const byId = Object.fromEntries(resolved.map((r) => [r.id, r]));
  assert.ok(byId.torso && byId.head, 'torso and head resolve');
  assert.ok(Math.hypot(byId.head.pivotX - 100, byId.head.pivotY - 108) < 1e-6);
  assert.ok(
    Math.hypot(byId.arm_l_lower.pivotX - byId.arm_l_upper.jointX, byId.arm_l_lower.pivotY - byId.arm_l_upper.jointY) < 1e-6
  );
  const posed = Object.fromEntries(
    rigMod.resolvePartTransforms(jimDef, rigMod.applyPoseToState(jimDef, 'waving', {})).map((r) => [r.id, r])
  );
  assert.ok(
    Math.hypot(
      posed.arm_l_lower.pivotX - posed.arm_l_upper.jointX,
      posed.arm_l_lower.pivotY - posed.arm_l_upper.jointY
    ) < 1e-6
  );

  // Optional local-library checks (skip when working data is absent / gitignored)
  const catalogPath = path.join(ROOT, 'art/comics/library/assets.json');
  const p8Path = path.join(ROOT, 'art/comics/compositions/page_8_reconstruction.json');
  if (fs.existsSync(catalogPath) && fs.existsSync(p8Path)) {
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    catalog.assets.forEach((asset) => {
      if (asset.deprecated) return;
      const abs = path.join(ROOT, asset.src);
      assert.ok(fs.existsSync(abs), `missing asset file: ${asset.src}`);
    });
    const p8 = parseComposition(fs.readFileSync(p8Path, 'utf8'));
    assert.ok(!/recon\/page8/i.test(JSON.stringify(p8)));
    console.log('comics-editor-test: local library checks passed');
  } else {
    console.log('comics-editor-test: skipped local library checks (working art not present)');
  }

  console.log('comics-editor-test: all checks passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
