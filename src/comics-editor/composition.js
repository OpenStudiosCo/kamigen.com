import { createId } from './id.js';
import { defaultTail, normalizeTail } from './bubble-geometry.js';

export const FORMAT_NAME = 'kamigen-comic-composition';
export const FORMAT_VERSION = 2;

export const SUPPORTED_BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion'
];

const PAGE_KEYS = [
  'width', 'height', 'background', 'margin', 'guides', 'snap'
];

const PANEL_KEYS = [
  'id', 'name', 'x', 'y', 'width', 'height', 'gutter', 'border',
  'cornerRadius', 'background', 'clip', 'allowBleed', 'overlay', 'layers'
];

const LAYER_KEYS = [
  'id', 'type', 'name', 'x', 'y', 'width', 'height', 'rotation', 'opacity',
  'visible', 'locked', 'flipX', 'flipY', 'effects', 'assetId', 'src', 'sourceRect',
  'preserveAspectRatio', 'shape', 'shapeSrc', 'fill', 'stroke', 'strokeWidth', 'text',
  'role', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'textAlign',
  'lineHeight', 'colour', 'padding', 'cornerRadius', 'tail', 'translation',
  'textWrap', 'letterSpacing', 'textX', 'textY', 'hiddenPartIds',
  'overflowWarn', 'characterId', 'rigSrc', 'poseId', 'expressionId', 'partState', 'note'
];

function sortObject(obj, keyOrder) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const out = {};
  for (const key of keyOrder) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined) {
      out[key] = obj[key];
    }
  }
  for (const key of Object.keys(obj).sort()) {
    if (!Object.prototype.hasOwnProperty.call(out, key) && obj[key] !== undefined) {
      out[key] = obj[key];
    }
  }
  return out;
}

export function defaultEffects() {
  return {
    dropShadow: { enabled: false, colour: '#000000', opacity: 0.45, blur: 8, offsetX: 4, offsetY: 4 },
    outline: { enabled: false, colour: '#000000', width: 2 },
    blur: { enabled: false, radius: 0 },
    glow: { enabled: false, colour: '#ffe08a', blur: 12, opacity: 0.7 },
    tint: { enabled: false, colour: '#4a7c59', opacity: 0 },
    overlay: { enabled: false, kind: 'colour', colour: '#000000', opacity: 0.2, stops: null, src: null },
    blendMode: 'normal',
    pulseGlow: { enabled: false, colour: '#7ec8e3', minOpacity: 0.25, maxOpacity: 0.85, durationMs: 1800 }
  };
}

export function createEmptyComposition(opts = {}) {
  const now = new Date().toISOString();
  const id = opts.id || createId('comp');
  return {
    format: FORMAT_NAME,
    version: FORMAT_VERSION,
    id,
    title: opts.title || 'Untitled page',
    created: now,
    modified: now,
    page: {
      width: opts.width || 800,
      height: opts.height || 1200,
      background: opts.background || '#f4f0e6',
      margin: opts.margin != null ? opts.margin : 28,
      guides: true,
      snap: true
    },
    panels: [],
    transcript: [],
    readingOrder: []
  };
}

export function createPanel(partial = {}) {
  return {
    id: partial.id || createId('panel'),
    name: partial.name || 'Panel',
    x: partial.x != null ? partial.x : 40,
    y: partial.y != null ? partial.y : 40,
    width: partial.width != null ? partial.width : 320,
    height: partial.height != null ? partial.height : 280,
    gutter: partial.gutter != null ? partial.gutter : 12,
    border: partial.border || { width: 3, colour: '#1a1a1a' },
    cornerRadius: partial.cornerRadius != null ? partial.cornerRadius : 8,
    background: partial.background || '#ffffff',
    clip: partial.clip !== false,
    allowBleed: !!partial.allowBleed,
    overlay: partial.overlay || null,
    layers: partial.layers || []
  };
}

export function createImageLayer(partial = {}) {
  return {
    id: partial.id || createId('layer'),
    type: 'image',
    name: partial.name || 'Image',
    x: partial.x != null ? partial.x : 20,
    y: partial.y != null ? partial.y : 20,
    width: partial.width != null ? partial.width : 200,
    height: partial.height != null ? partial.height : 200,
    rotation: partial.rotation || 0,
    opacity: partial.opacity != null ? partial.opacity : 1,
    visible: partial.visible !== false,
    locked: !!partial.locked,
    flipX: !!partial.flipX,
    flipY: !!partial.flipY,
    assetId: partial.assetId || null,
    src: partial.src || '',
    // Optional crop into a shared raster/SVG (instance placement stays on the layer).
    sourceRect: partial.sourceRect || null,
    preserveAspectRatio: partial.preserveAspectRatio !== false,
    effects: Object.assign(defaultEffects(), partial.effects || {})
  };
}

export function createShapeLayer(partial = {}) {
  return {
    id: partial.id || createId('layer'),
    type: 'shape',
    name: partial.name || 'Shape',
    x: partial.x != null ? partial.x : 10,
    y: partial.y != null ? partial.y : 10,
    width: partial.width != null ? partial.width : 100,
    height: partial.height != null ? partial.height : 80,
    rotation: partial.rotation || 0,
    opacity: partial.opacity != null ? partial.opacity : 1,
    visible: partial.visible !== false,
    locked: !!partial.locked,
    flipX: !!partial.flipX,
    flipY: !!partial.flipY,
    shape: partial.shape || 'rect',
    fill: partial.fill || '#cccccc',
    stroke: partial.stroke || '#333333',
    strokeWidth: partial.strokeWidth != null ? partial.strokeWidth : 1,
    effects: Object.assign(defaultEffects(), partial.effects || {})
  };
}

export function createCharacterLayer(partial = {}) {
  return {
    id: partial.id || createId('layer'),
    type: 'character',
    name: partial.name || 'Character',
    x: partial.x != null ? partial.x : 40,
    y: partial.y != null ? partial.y : 40,
    width: partial.width != null ? partial.width : 200,
    height: partial.height != null ? partial.height : 360,
    rotation: partial.rotation || 0,
    opacity: partial.opacity != null ? partial.opacity : 1,
    visible: partial.visible !== false,
    locked: !!partial.locked,
    flipX: !!partial.flipX,
    flipY: !!partial.flipY,
    characterId: partial.characterId || null,
    rigSrc: partial.rigSrc || '',
    poseId: partial.poseId || 'standing',
    expressionId: partial.expressionId || 'neutral',
    partState: partial.partState || {},
    effects: Object.assign(defaultEffects(), partial.effects || {})
  };
}

export function createBubbleLayer(partial = {}) {
  return {
    id: partial.id || createId('layer'),
    type: 'bubble',
    name: partial.name || 'Bubble',
    x: partial.x != null ? partial.x : 40,
    y: partial.y != null ? partial.y : 40,
    width: partial.width != null ? partial.width : 220,
    height: partial.height != null ? partial.height : 100,
    rotation: partial.rotation || 0,
    opacity: partial.opacity != null ? partial.opacity : 1,
    visible: partial.visible !== false,
    locked: !!partial.locked,
    flipX: false,
    flipY: false,
    role: partial.role || 'speech',
    text: partial.text != null ? partial.text : '',
    translation: partial.translation || '',
    fontFamily: partial.fontFamily || '"Source Sans 3", "Noto Sans", sans-serif',
    fontSize: partial.fontSize != null ? partial.fontSize : 18,
    fontWeight: partial.fontWeight || '600',
    fontStyle: partial.fontStyle || 'normal',
    textAlign: partial.textAlign || 'center',
    lineHeight: partial.lineHeight != null ? partial.lineHeight : 1.25,
    colour: partial.colour || '#111111',
    padding: partial.padding != null ? partial.padding : 14,
    fill: partial.fill || '#ffffff',
    stroke: partial.stroke || '#111111',
    strokeWidth: partial.strokeWidth != null ? partial.strokeWidth : 2,
    cornerRadius: partial.cornerRadius != null ? partial.cornerRadius : 18,
    shape: partial.shape || (partial.role === 'thought' ? 'ellipse' : 'rounded'),
    shapeSrc: partial.shapeSrc || '',
    textWrap: partial.textWrap !== false,
    letterSpacing: partial.letterSpacing != null ? partial.letterSpacing : 0,
    textX: partial.textX,
    textY: partial.textY,
    tail: normalizeTail(
      partial.tail || defaultTail(partial.role || 'speech', partial.width != null ? partial.width : 220, partial.height != null ? partial.height : 100),
      partial.width != null ? partial.width : 220,
      partial.height != null ? partial.height : 100,
      partial.role || 'speech'
    ),
    overflowWarn: !!partial.overflowWarn,
    effects: Object.assign(defaultEffects(), partial.effects || {})
  };
}

/** Common comic grid presets in page coordinates. */
export function applyGridPreset(composition, presetId) {
  const page = composition.page;
  const m = page.margin || 28;
  const g = 16;
  const w = page.width - m * 2;
  const h = page.height - m * 2;
  const panels = [];

  function add(name, x, y, pw, ph) {
    panels.push(createPanel({ name, x: m + x, y: m + y, width: pw, height: ph, gutter: g }));
  }

  if (presetId === 'single') {
    add('Panel 1', 0, 0, w, h);
  } else if (presetId === 'two-horizontal') {
    const ph = (h - g) / 2;
    add('Panel 1', 0, 0, w, ph);
    add('Panel 2', 0, ph + g, w, ph);
  } else if (presetId === 'two-vertical') {
    const pw = (w - g) / 2;
    add('Panel 1', 0, 0, pw, h);
    add('Panel 2', pw + g, 0, pw, h);
  } else if (presetId === 'three-row') {
    const ph = (h - g * 2) / 3;
    add('Panel 1', 0, 0, w, ph);
    add('Panel 2', 0, ph + g, w, ph);
    add('Panel 3', 0, (ph + g) * 2, w, ph);
  } else if (presetId === 'four-grid') {
    const pw = (w - g) / 2;
    const ph = (h - g) / 2;
    add('Panel 1', 0, 0, pw, ph);
    add('Panel 2', pw + g, 0, pw, ph);
    add('Panel 3', 0, ph + g, pw, ph);
    add('Panel 4', pw + g, ph + g, pw, ph);
  } else if (presetId === 'six-grid') {
    const pw = (w - g) / 2;
    const ph = (h - g * 2) / 3;
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 2; col++) {
        add(`Panel ${row * 2 + col + 1}`, col * (pw + g), row * (ph + g), pw, ph);
      }
    }
  } else {
    throw new Error(`Unknown grid preset: ${presetId}`);
  }

  composition.panels = panels;
  composition.modified = new Date().toISOString();
  return composition;
}

export function validateComposition(data) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    return { ok: false, errors: ['Composition must be an object'] };
  }
  if (data.format !== FORMAT_NAME) {
    errors.push(`Expected format "${FORMAT_NAME}"`);
  }
  if (typeof data.version !== 'number') {
    errors.push('Missing numeric version');
  } else if (data.version > FORMAT_VERSION) {
    errors.push(`Unsupported composition version ${data.version}`);
  }
  if (!data.id) errors.push('Missing id');
  if (!data.page || typeof data.page.width !== 'number' || typeof data.page.height !== 'number') {
    errors.push('page.width and page.height are required');
  }
  if (!Array.isArray(data.panels)) {
    errors.push('panels must be an array');
  } else {
    const panelIds = new Set();
    data.panels.forEach((panel, i) => {
      if (!panel.id) errors.push(`panels[${i}] missing id`);
      else if (panelIds.has(panel.id)) errors.push(`Duplicate panel id ${panel.id}`);
      else panelIds.add(panel.id);
      if (!Array.isArray(panel.layers)) errors.push(`panels[${i}].layers must be an array`);
      else {
        const layerIds = new Set();
        panel.layers.forEach((layer, j) => {
          if (!layer.id) errors.push(`panels[${i}].layers[${j}] missing id`);
          else if (layerIds.has(layer.id)) errors.push(`Duplicate layer id ${layer.id}`);
          else layerIds.add(layer.id);
          if (!layer.type) errors.push(`layers[${j}] missing type`);
        });
      }
    });
  }
  if (data.transcript && !Array.isArray(data.transcript)) {
    errors.push('transcript must be an array');
  }
  return { ok: errors.length === 0, errors };
}

export function migrateComposition(data) {
  // v1 → v2: character fields optional; bump version when loaded.
  if (!data || typeof data !== 'object') return data;
  if (data.version == null) data.version = 1;
  if (data.version < 2) {
    data.version = 2;
  }
  (data.panels || []).forEach((panel) => {
    (panel.layers || []).forEach((layer) => {
      if (layer.type === 'character') {
        if (!layer.poseId) layer.poseId = 'standing';
        if (!layer.expressionId) layer.expressionId = 'neutral';
        if (!layer.partState) layer.partState = {};
      }
      if (layer.locked == null) layer.locked = false;
      if (layer.visible == null) layer.visible = true;
    });
  });
  return data;
}

export function normalizeComposition(data) {
  migrateComposition(data);
  const result = validateComposition(data);
  if (!result.ok) {
    const err = new Error(result.errors.join('; '));
    err.validation = result;
    throw err;
  }
  data.panels.forEach((panel) => {
    panel.layers = panel.layers.map((layer) => {
      if (!layer.effects) layer.effects = defaultEffects();
      else layer.effects = Object.assign(defaultEffects(), layer.effects);
      if (layer.type === 'character') {
        if (!layer.partState) layer.partState = {};
        if (!layer.poseId) layer.poseId = 'standing';
        if (!layer.expressionId) layer.expressionId = 'neutral';
      }
      return layer;
    });
  });
  if (!Array.isArray(data.transcript)) data.transcript = [];
  if (!Array.isArray(data.readingOrder)) data.readingOrder = [];
  return data;
}

/** Collect rig definition paths referenced by a composition. */
export function listCharacterRigPaths(composition) {
  const paths = new Set();
  (composition.panels || []).forEach((panel) => {
    (panel.layers || []).forEach((layer) => {
      if (layer.type === 'character' && layer.rigSrc) paths.add(layer.rigSrc);
    });
  });
  return Array.from(paths);
}

export function rebuildTranscript(composition) {
  const entries = [];
  const order = [];
  composition.panels.forEach((panel) => {
    panel.layers.forEach((layer) => {
      if (layer.type === 'bubble' || layer.type === 'text') {
        const id = `tr_${layer.id}`;
        entries.push({
          id,
          panelId: panel.id,
          layerId: layer.id,
          speaker: layer.role === 'caption' || layer.role === 'narration' ? 'NARRATOR' : (layer.name || 'SPEAKER'),
          text: layer.text || '',
          translation: layer.translation || ''
        });
        order.push(id);
      }
    });
  });
  composition.transcript = entries;
  composition.readingOrder = order;
  return composition;
}

function serializeLayer(layer) {
  const sorted = sortObject(layer, LAYER_KEYS);
  if (sorted.effects) {
    sorted.effects = JSON.parse(JSON.stringify(sorted.effects));
  }
  return sorted;
}

function serializePanel(panel) {
  const sorted = sortObject(panel, PANEL_KEYS);
  sorted.layers = (panel.layers || []).map(serializeLayer);
  return sorted;
}

/** Deterministic, readable JSON for Git. */
export function serializeComposition(composition) {
  const copy = {
    format: composition.format,
    version: composition.version,
    id: composition.id,
    title: composition.title,
    created: composition.created,
    modified: composition.modified || new Date().toISOString(),
    page: sortObject(composition.page, PAGE_KEYS),
    panels: (composition.panels || []).map(serializePanel),
    transcript: composition.transcript || [],
    readingOrder: composition.readingOrder || []
  };
  if (composition.notes != null) copy.notes = composition.notes;
  if (composition.gaps != null) copy.gaps = composition.gaps;
  return `${JSON.stringify(copy, null, 2)}\n`;
}

export function parseComposition(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    const err = new Error(`Malformed JSON: ${error.message}`);
    err.cause = error;
    throw err;
  }
  return normalizeComposition(data);
}

export function cloneComposition(composition) {
  return JSON.parse(JSON.stringify(composition));
}

export function findPanel(composition, panelId) {
  return composition.panels.find((p) => p.id === panelId) || null;
}

export function findLayer(composition, layerId) {
  for (const panel of composition.panels) {
    const layer = panel.layers.find((l) => l.id === layerId);
    if (layer) return { panel, layer };
  }
  return null;
}

export function reorderLayer(layers, layerId, action) {
  const index = layers.findIndex((l) => l.id === layerId);
  if (index < 0) return layers;
  const next = layers.slice();
  const [item] = next.splice(index, 1);
  if (action === 'front') next.push(item);
  else if (action === 'back') next.unshift(item);
  else if (action === 'forward' && index < layers.length - 1) next.splice(index + 1, 0, item);
  else if (action === 'backward' && index > 0) next.splice(index - 1, 0, item);
  else next.splice(index, 0, item);
  return next;
}

export function moveLayerIndex(layers, fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return layers;
  const next = layers.slice();
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

/** Replace asset on one instance; keep placement. */
export function replaceLayerVariant(layer, asset) {
  if (layer.type !== 'image') return layer;
  const next = Object.assign({}, layer);
  next.assetId = asset.id;
  next.src = asset.src;
  if (asset.name) next.name = asset.name;
  if (layer.preserveAspectRatio !== false && asset.width && asset.height && layer.width) {
    const ratio = asset.height / asset.width;
    next.height = Math.round(layer.width * ratio);
  }
  return next;
}
