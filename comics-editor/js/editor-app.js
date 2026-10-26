import {
  applyGridPreset,
  cloneComposition,
  createBubbleLayer,
  createCharacterLayer,
  createEmptyComposition,
  createImageLayer,
  createPanel,
  findLayer,
  listCharacterRigPaths,
  parseComposition,
  rebuildTranscript,
  reorderLayer,
  replaceLayerVariant,
  serializeComposition,
  validateComposition
} from '/src/comics-editor/composition.js';
import {
  applyPoseToState,
  clampPartRotation,
  defaultPartState,
  extractPose,
  mergePartState,
  resolvePartTransforms
} from '/src/comics-editor/character-rig.js';
import { HistoryStack } from '/src/comics-editor/history.js';
import { renderComposition } from '/src/comics-editor/renderer.js';
import { exportPng, exportSvg } from '/src/comics-editor/export.js';
import {
  attachFromPoint,
  bubbleHandlePoints,
  buildSpeechBubblePath,
  defaultTail,
  normalizeTail,
  proceduralFromImportedBox,
  scaleTailForBodyResize
} from '/src/comics-editor/bubble-geometry.js';

const API = '/api';
const HINTS = {
  layout: 'Pick a panel layout, then fine-tune borders and corners.',
  characters: 'Add Jim (artwork) for real SVG posing, or the legacy cutout rig for experiments.',
  scene: 'Drop backgrounds and props into the selected panel.',
  dialogue: 'Add speech or captions, then edit the words.',
  effects: 'Toggle shadows and glows on the selected item.',
  preview: 'Preview the finished page, then export PNG or SVG.'
};

const state = {
  composition: null,
  path: (() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get('composition') || params.get('path');
      if (q && q.startsWith('art/comics/compositions/') && q.endsWith('.json')) return q;
    } catch (e) { /* ignore */ }
    return 'art/comics/compositions/jim_artwork_proof.json';
  })(),
  dirty: false,
  assets: [],
  characterDefs: {},
  svgCache: {},
  customPoses: {},
  selectedAssetId: null,
  selectedPanelId: null,
  selectedLayerId: null,
  selectedPartId: null,
  activity: 'layout',
  poseMode: false,
  zoom: 0.7,
  panX: 40,
  panY: 20,
  history: new HistoryStack(),
  drag: null,
  serverOk: false,
  collapsedPanels: {},
  expandedLayers: {}
};

const ICON_EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 5c-5 0-9 4.5-10 7 1 2.5 5 7 10 7s9-4.5 10-7c-1-2.5-5-7-10-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/></svg>';
const ICON_EYE_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3.3 2.2 2.2 3.3l3.1 3.1C3.7 7.5 2.4 9.1 1.8 10.5c1 2.5 5 7 10.2 7 1.7 0 3.2-.4 4.5-1l3.2 3.2 1.1-1.1L3.3 2.2zm8.7 13.3c-2.5 0-4.5-2-4.5-4.5 0-.6.1-1.1.3-1.6l5.8 5.8c-.5.2-1 .3-1.6.3zM12 5c1.2 0 2.3.2 3.3.6l-1.5 1.5c-.6-.2-1.2-.3-1.8-.3-2.5 0-4.5 2-4.5 4.5 0 .6.1 1.2.3 1.8L6.3 14.6C4.7 13.3 3.5 11.7 2.8 10.5 3.8 8 7.2 5 12 5zm9.2 5.5c-.4 1-1.2 2.3-2.4 3.5l-1.4-1.4c.8-.8 1.4-1.7 1.8-2.1C17.8 8.6 15.2 7 12 7c-.3 0-.6 0-.9.1L9.5 5.5C10.3 5.2 11.1 5 12 5c4.8 0 8.2 3 9.2 5.5z"/></svg>';
const ICON_LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17 9h-1V7a4 4 0 1 0-8 0v2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2zm-6-2a2 2 0 1 1 4 0v2h-4V7zm3 8.7V18h-2v-2.3a1.5 1.5 0 1 1 2 0z"/></svg>';
const ICON_UNLOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17 9h-1V7a4 4 0 0 0-7.8-1.2l1.5 1.1A2 2 0 0 1 14 7v2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2zm-3 6.7V18h-2v-2.3a1.5 1.5 0 1 1 2 0z"/></svg>';

const els = {
  pageHost: document.getElementById('page-host'),
  overlay: document.getElementById('overlay-ui'),
  stage: document.getElementById('canvas-stage'),
  wrap: document.getElementById('canvas-wrap'),
  status: document.getElementById('save-status'),
  layerList: document.getElementById('layer-list'),
  props: document.getElementById('props'),
  panelSelect: document.getElementById('panel-select'),
  toast: document.getElementById('toast'),
  activityPanel: document.getElementById('activity-panel'),
  contextBar: document.getElementById('context-bar'),
  hint: document.getElementById('context-hint')
};

function toast(message, ms = 3200) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => els.toast.classList.remove('show'), ms);
}

function setStatus(text, kind = '') {
  els.status.textContent = text;
  els.status.className = `kce-status ${kind}`;
}

function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function markDirty() {
  state.dirty = true;
  setStatus(`Unsaved — ${state.path}`, 'dirty');
}

function isReferencePanel(panel) {
  if (!panel) return false;
  if (panel.role === 'reference' || panel.reference === true) return true;
  const id = String(panel.id || '').toLowerCase();
  const name = String(panel.name || '').toLowerCase();
  return id.includes('page_ref') || id.includes('reference')
    || name.includes('reference') || name.includes('comparison');
}

function productionPanels() {
  if (!state.composition) return [];
  return state.composition.panels.filter((p) => !isReferencePanel(p));
}

function firstProductionPanel() {
  return productionPanels()[0] || state.composition?.panels[0] || null;
}

function selectedPanel() {
  const byId = state.composition.panels.find((p) => p.id === state.selectedPanelId);
  if (byId) return byId;
  return firstProductionPanel();
}

/** Prefer a real art panel when creating content (never silently use hidden refs). */
function panelForContent() {
  const current = state.composition.panels.find((p) => p.id === state.selectedPanelId);
  if (current && !isReferencePanel(current)) return current;
  const prod = firstProductionPanel();
  if (prod) {
    state.selectedPanelId = prod.id;
    return prod;
  }
  return current || null;
}

function typeLabel(layer) {
  if (!layer) return '';
  if (layer.type === 'bubble') {
    if (layer.role === 'thought') return 'thought';
    if (layer.role === 'caption') return 'caption';
    return 'speech';
  }
  if (layer.type === 'character') return 'character';
  if (layer.type === 'image') {
    if (/background/i.test(layer.name || '') || /_bg$/.test(layer.id || '')) return 'background';
    return 'image';
  }
  return layer.type || 'layer';
}

function selectedLayer() {
  const found = findLayer(state.composition, state.selectedLayerId);
  return found ? found.layer : null;
}

function selectedLayerHit() {
  return findLayer(state.composition, state.selectedLayerId);
}

function getCharacterDef(layer) {
  if (!layer || layer.type !== 'character') return null;
  return state.characterDefs[layer.characterId] || state.characterDefs[layer.rigSrc] || null;
}

/**
 * Mutate a layer. Canvas geometry is blocked when locked.
 * Lock/visibility (and explicit allowWhileLocked) always work so unlock stays reachable.
 */
function mutateLayer(mutator, options = {}) {
  const hit = selectedLayerHit();
  if (!hit) return;
  const allowWhileLocked = !!options.allowWhileLocked;
  if (hit.layer.locked && !allowWhileLocked) {
    toast('Unlock this layer to move or edit it');
    return;
  }
  state.history.push(state.composition);
  mutator(hit.layer, hit.panel);
  rebuildTranscript(state.composition);
  markDirty();
  renderAll();
}

function mutatePanel(mutator) {
  const panel = selectedPanel();
  if (!panel) return;
  state.history.push(state.composition);
  mutator(panel);
  markDirty();
  renderAll();
}

function setLayerLocked(layerId, locked) {
  const hit = findLayer(state.composition, layerId);
  if (!hit) return;
  state.history.push(state.composition);
  hit.layer.locked = !!locked;
  markDirty();
  renderAll();
  toast(locked ? 'Locked — canvas moves disabled' : 'Unlocked');
}

function setLayerVisible(layerId, visible) {
  const hit = findLayer(state.composition, layerId);
  if (!hit) return;
  state.history.push(state.composition);
  hit.layer.visible = !!visible;
  markDirty();
  renderAll();
}

function applyViewTransform() {
  els.stage.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
}

function fitZoom() {
  const page = state.composition.page;
  const rect = els.wrap.getBoundingClientRect();
  const pad = 48;
  const zx = (rect.width - pad) / page.width;
  const zy = (rect.height - pad) / page.height;
  state.zoom = Math.max(0.15, Math.min(zx, zy, 2));
  state.panX = (rect.width - page.width * state.zoom) / 2;
  state.panY = (rect.height - page.height * state.zoom) / 2;
  applyViewTransform();
}

async function ensureCharacterDefs(composition = state.composition) {
  const paths = listCharacterRigPaths(composition);
  await Promise.all(paths.map(async (rigSrc) => {
    if (state.characterDefs[rigSrc] && (!state.characterDefs[rigSrc].svgSrc || state.svgCache[state.characterDefs[rigSrc].svgSrc])) {
      return;
    }
    try {
      const res = await fetch(`/${rigSrc}`);
      if (!res.ok) return;
      const def = await res.json();
      state.characterDefs[def.id] = def;
      state.characterDefs[rigSrc] = def;
      if (def.svgSrc && !state.svgCache[def.svgSrc]) {
        const svgRes = await fetch(`/${def.svgSrc}`);
        if (svgRes.ok) state.svgCache[def.svgSrc] = await svgRes.text();
      }
    } catch (e) { /* ignore */ }
  }));
}

function renderPage() {
  renderComposition(state.composition, els.pageHost, {
    mode: 'editor',
    assetBase: '',
    characterDefs: state.characterDefs,
    svgCache: state.svgCache,
    showHidden: false
  });
  const svg = els.pageHost.querySelector('svg');
  if (svg) {
    svg.style.width = `${state.composition.page.width}px`;
    svg.style.height = `${state.composition.page.height}px`;
  }
  drawSelectionOverlay();
  // Bubble wrap uses canvas font metrics; re-render once lettering fonts are ready.
  if (document.fonts && document.fonts.status !== 'loaded' && !state._fontRerenderArmed) {
    state._fontRerenderArmed = true;
    document.fonts.ready.then(() => {
      state._fontRerenderArmed = false;
      renderPage();
    }).catch(() => { state._fontRerenderArmed = false; });
  }
}

function screenToPage(clientX, clientY) {
  const rect = els.wrap.getBoundingClientRect();
  return {
    x: (clientX - rect.left - state.panX) / state.zoom,
    y: (clientY - rect.top - state.panY) / state.zoom
  };
}

function drawSelectionOverlay() {
  els.overlay.innerHTML = '';
  els.overlay.style.width = `${state.composition.page.width}px`;
  els.overlay.style.height = `${state.composition.page.height}px`;

  if (state.composition.page.guides) {
    const m = state.composition.page.margin || 0;
    [[m, 0, 1, state.composition.page.height], [state.composition.page.width - m, 0, 1, state.composition.page.height],
      [0, m, state.composition.page.width, 1], [0, state.composition.page.height - m, state.composition.page.width, 1]
    ].forEach(([x, y, w, h]) => {
      const line = document.createElement('div');
      line.className = 'kce-guide-line';
      Object.assign(line.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
      els.overlay.appendChild(line);
    });
  }

  const hit = selectedLayerHit();
  if (!hit) return;
  const { panel, layer } = hit;
  const box = document.createElement('div');
  box.className = `kce-selection-box${layer.locked ? ' locked' : ''}`;
  Object.assign(box.style, {
    left: `${panel.x + layer.x}px`,
    top: `${panel.y + layer.y}px`,
    width: `${layer.width}px`,
    height: `${layer.height}px`
  });
  els.overlay.appendChild(box);

  if (!layer.locked && !state.poseMode) {
    [['nw', 0, 0], ['n', 0.5, 0], ['ne', 1, 0], ['w', 0, 0.5], ['e', 1, 0.5], ['sw', 0, 1], ['s', 0.5, 1], ['se', 1, 1]]
      .forEach(([name, fx, fy]) => {
        const h = document.createElement('div');
        h.className = 'kce-handle';
        h.dataset.handle = name;
        h.style.left = `${panel.x + layer.x + layer.width * fx}px`;
        h.style.top = `${panel.y + layer.y + layer.height * fy}px`;
        // Keep handle screen size stable across zoom
        h.style.transform = `translate(-50%, -50%) scale(${1 / state.zoom})`;
        els.overlay.appendChild(h);
      });
  }

  if (
    !layer.locked
    && !state.poseMode
    && (layer.type === 'bubble' || layer.type === 'text')
    && !layer.shapeSrc
    && layer.role !== 'caption'
  ) {
    drawBubbleHandles(panel, layer);
  }

  if (state.poseMode && layer.type === 'character' && !layer.locked) {
    drawJointHandles(panel, layer);
  }
}

function drawBubbleHandles(panel, layer) {
  const tail = normalizeTail(layer.tail, layer.width, layer.height, layer.role || 'speech');
  if (!tail.enabled) return;
  const pts = bubbleHandlePoints(layer.width, layer.height, layer.cornerRadius || 18, tail);
  if (!pts) return;
  const scale = 1 / state.zoom;
  const place = (key, pt, title, cls) => {
    const h = document.createElement('div');
    h.className = `kce-bubble-handle ${cls || ''}`;
    h.dataset.bubbleHandle = key;
    h.title = title;
    h.style.left = `${panel.x + layer.x + pt.x}px`;
    h.style.top = `${panel.y + layer.y + pt.y}px`;
    h.style.transform = `translate(-50%, -50%) scale(${scale})`;
    els.overlay.appendChild(h);
  };
  place('tip', pts.tip, 'Drag tail tip toward speaker', 'tip');
  place('attach', pts.attach, 'Move tail attachment around bubble', 'attach');
  place('baseWidth', pts.baseRight, 'Drag to change tail base width', 'base');
  place('curve', pts.curve, 'Adjust tail curvature', 'curve');
}

function drawJointHandles(panel, layer) {
  const def = getCharacterDef(layer);
  if (!def) return;
  const posed = applyPoseToState(def, layer.poseId || 'standing', layer.partState || {});
  const parts = resolvePartTransforms(def, posed);
  const vb = def.viewBox || [0, 0, 200, 360];
  const sx = layer.width / (vb[2] || 200);
  const sy = layer.height / (vb[3] || 360);
  parts.forEach((p) => {
    if (!p.part.parent && p.id === 'torso') return;
    const hx = panel.x + layer.x + p.pivotX * sx;
    const hy = panel.y + layer.y + p.pivotY * sy;
    const handle = document.createElement('div');
    handle.className = 'kce-joint-handle';
    handle.dataset.partId = p.id;
    handle.title = p.id;
    handle.style.left = `${hx}px`;
    handle.style.top = `${hy}px`;
    if (state.selectedPartId === p.id) handle.style.background = '#3d9b7a';
    els.overlay.appendChild(handle);
  });
}

function renderPanelSelect() {
  els.panelSelect.innerHTML = state.composition.panels.map((p) => {
    const tag = isReferencePanel(p) ? ' (refs)' : '';
    return `<option value="${p.id}" ${p.id === state.selectedPanelId ? 'selected' : ''}>${p.name || p.id}${tag}</option>`;
  }).join('');
}

function clearDropIndicators() {
  els.layerList.querySelectorAll('.drop-target, .drop-before, .drop-after').forEach((el) => {
    el.classList.remove('drop-target', 'drop-before', 'drop-after');
  });
}

function renderLayerChildren(layer, panel, host) {
  const kids = document.createElement('ul');
  kids.className = 'kce-layer-children';
  if (layer.type === 'character') {
    const def = getCharacterDef(layer);
    const parts = (def && def.parts) || [];
    if (!parts.length) {
      kids.appendChild(Object.assign(document.createElement('li'), {
        className: 'kce-layer-child',
        textContent: 'No rig parts on this character'
      }));
    } else {
      parts.slice().sort((a, b) => (b.z || 0) - (a.z || 0)).forEach((part) => {
        const row = document.createElement('li');
        row.className = 'kce-layer-child';
        const vis = document.createElement('button');
        vis.type = 'button';
        const hidden = !!(layer.partState && layer.partState[part.id] && layer.partState[part.id].visible === false);
        vis.title = hidden ? `Show ${part.id}` : `Hide ${part.id}`;
        vis.innerHTML = hidden ? ICON_EYE_OFF : ICON_EYE;
        vis.addEventListener('click', (e) => {
          e.stopPropagation();
          state.history.push(state.composition);
          if (!layer.partState) layer.partState = {};
          const cur = Object.assign({ rotation: 0, offsetX: 0, offsetY: 0, visible: true }, layer.partState[part.id] || {});
          cur.visible = hidden;
          layer.partState[part.id] = cur;
          markDirty();
          renderAll();
        });
        const label = document.createElement('span');
        label.className = 'kce-layer-child-label';
        label.textContent = part.id;
        label.title = 'Part visibility only — paint order stays with the character layer; attachments unchanged';
        row.appendChild(vis);
        row.appendChild(label);
        kids.appendChild(row);
      });
    }
  } else if (layer.type === 'bubble' || layer.type === 'text') {
    const shape = document.createElement('li');
    shape.className = 'kce-layer-child';
    shape.innerHTML = `<span class="kce-layer-child-label">Shape — ${layer.shapeSrc ? 'imported art' : (layer.role === 'thought' ? 'thought cloud' : (layer.role === 'caption' ? 'caption box' : 'speech bubble'))}</span>`;
    const letter = document.createElement('li');
    letter.className = 'kce-layer-child';
    letter.innerHTML = '<span class="kce-layer-child-label">Lettering — moves with shape</span>';
    kids.appendChild(shape);
    kids.appendChild(letter);
  }
  host.appendChild(kids);
}

function renderLayers() {
  els.layerList.innerHTML = '';
  // Paint order: later layers are in front — reverse so top of list = front.
  state.composition.panels.forEach((panel) => {
    const collapsed = !!state.collapsedPanels[panel.id];
    const group = document.createElement('li');
    group.className = [
      'kce-layer-group',
      panel.id === state.selectedPanelId ? 'active-panel' : '',
      isReferencePanel(panel) ? 'ref-panel' : '',
      collapsed ? 'collapsed' : ''
    ].filter(Boolean).join(' ');

    const head = document.createElement('div');
    head.className = 'kce-layer-group-head';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'kce-layer-group-toggle';
    toggle.textContent = collapsed ? '▸' : '▾';
    toggle.title = collapsed ? 'Expand panel layers' : 'Collapse panel layers';
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      state.collapsedPanels[panel.id] = !collapsed;
      renderLayers();
    });
    const title = document.createElement('button');
    title.type = 'button';
    title.className = 'kce-layer-group-title';
    title.textContent = `${panel.name || panel.id}${isReferencePanel(panel) ? ' · reference' : ''}`;
    title.title = 'Select this panel';
    title.addEventListener('click', () => {
      state.selectedPanelId = panel.id;
      state.selectedLayerId = null;
      renderAll();
    });
    const count = document.createElement('span');
    count.className = 'kce-layer-count';
    count.textContent = String(panel.layers.length);
    count.title = 'Layer count in this panel';
    head.appendChild(toggle);
    head.appendChild(title);
    head.appendChild(count);
    group.appendChild(head);

    const ul = document.createElement('ul');
    ul.className = 'kce-layer-sublist';

    [...panel.layers].reverse().forEach((layer, visualIndex) => {
      const storageIndex = panel.layers.length - 1 - visualIndex;
      const li = document.createElement('li');
      li.className = [
        'kce-layer-item',
        layer.id === state.selectedLayerId ? 'active' : '',
        layer.locked ? 'locked-layer' : '',
        layer.visible === false ? 'hidden-layer' : ''
      ].filter(Boolean).join(' ');
      li.draggable = true;
      li.dataset.layerId = layer.id;
      li.dataset.panelId = panel.id;
      li.dataset.storageIndex = String(storageIndex);

      const expand = document.createElement('button');
      expand.type = 'button';
      expand.className = 'kce-layer-expand';
      const canExpand = layer.type === 'character' || layer.type === 'bubble' || layer.type === 'text';
      const expanded = !!state.expandedLayers[layer.id];
      expand.textContent = canExpand ? (expanded ? '▾' : '▸') : '';
      expand.disabled = !canExpand;
      expand.title = canExpand ? (expanded ? 'Collapse components' : 'Expand components') : 'No nested components';
      expand.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!canExpand) return;
        state.expandedLayers[layer.id] = !expanded;
        renderLayers();
      });

      const type = document.createElement('span');
      type.className = `kce-type-badge kce-type-${typeLabel(layer)}`;
      type.textContent = typeLabel(layer);
      type.title = typeLabel(layer);

      const name = document.createElement('input');
      name.type = 'text';
      name.className = 'kce-layer-name';
      name.value = layer.name || layer.type;
      name.title = 'Rename layer';
      name.addEventListener('click', (e) => e.stopPropagation());
      name.addEventListener('change', () => {
        const next = name.value.trim() || layer.type;
        if (next === layer.name) return;
        state.history.push(state.composition);
        layer.name = next;
        markDirty();
        renderAll();
      });

      const actions = document.createElement('div');
      actions.className = 'kce-layer-actions';

      const visBtn = document.createElement('button');
      visBtn.type = 'button';
      visBtn.className = 'icon-btn';
      visBtn.title = layer.visible === false ? 'Show layer' : 'Hide layer';
      visBtn.setAttribute('aria-label', visBtn.title);
      visBtn.innerHTML = layer.visible === false ? ICON_EYE_OFF : ICON_EYE;
      visBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setLayerVisible(layer.id, layer.visible === false);
      });

      const lockBtn = document.createElement('button');
      lockBtn.type = 'button';
      lockBtn.className = 'icon-btn';
      lockBtn.title = layer.locked ? 'Unlock layer' : 'Lock layer';
      lockBtn.setAttribute('aria-label', lockBtn.title);
      lockBtn.setAttribute('aria-pressed', layer.locked ? 'true' : 'false');
      lockBtn.innerHTML = layer.locked ? ICON_LOCK : ICON_UNLOCK;
      lockBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setLayerLocked(layer.id, !layer.locked);
      });

      actions.appendChild(visBtn);
      actions.appendChild(lockBtn);
      li.appendChild(expand);
      li.appendChild(type);
      li.appendChild(name);
      li.appendChild(actions);

      li.addEventListener('click', () => {
        state.selectedLayerId = layer.id;
        state.selectedPanelId = panel.id;
        if (layer.type === 'bubble' && state.activity !== 'dialogue') state.activity = 'dialogue';
        if (layer.type === 'character' && state.activity !== 'characters') state.activity = 'characters';
        renderAll();
      });
      li.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({
          panelId: panel.id,
          from: storageIndex
        }));
        e.dataTransfer.effectAllowed = 'move';
        li.classList.add('dragging');
      });
      li.addEventListener('dragend', () => {
        li.classList.remove('dragging');
        clearDropIndicators();
      });
      li.addEventListener('dragover', (e) => {
        e.preventDefault();
        clearDropIndicators();
        const rect = li.getBoundingClientRect();
        const before = e.clientY < rect.top + rect.height / 2;
        li.classList.add('drop-target', before ? 'drop-before' : 'drop-after');
        li.dataset.dropEdge = before ? 'before' : 'after';
      });
      li.addEventListener('dragleave', () => {
        li.classList.remove('drop-target', 'drop-before', 'drop-after');
      });
      li.addEventListener('drop', (e) => {
        e.preventDefault();
        const edge = li.dataset.dropEdge || 'after';
        clearDropIndicators();
        let payload;
        try { payload = JSON.parse(e.dataTransfer.getData('text/plain')); } catch (err) { return; }
        if (!payload || payload.panelId !== panel.id) {
          toast('Reorder within the same panel (paint order). Attachments are separate from stack order.');
          return;
        }
        const from = Number(payload.from);
        let to = storageIndex;
        // Visual list is reversed; drop-before (toward front) means higher storage index.
        if (edge === 'before' && from < to) to -= 0;
        if (edge === 'after' && from > to) to += 0;
        // Convert visual edge to storage index insertion
        if (edge === 'before') {
          // Insert toward front of list (= higher storage index after reverse display)
          to = storageIndex;
        } else {
          to = storageIndex;
          // drop after visual item = toward back = lower storage index
          if (from > storageIndex) to = storageIndex;
          else to = Math.max(0, storageIndex);
        }
        // Simpler reliable reorder: place at the hovered item's storage index
        to = storageIndex;
        if (from === to) return;
        state.history.push(state.composition);
        const layers = panel.layers.slice();
        const [item] = layers.splice(from, 1);
        layers.splice(to, 0, item);
        panel.layers = layers;
        markDirty();
        renderAll();
      });
      ul.appendChild(li);
      if (canExpand && expanded) renderLayerChildren(layer, panel, ul);
    });

    group.appendChild(ul);
    els.layerList.appendChild(group);
  });
}

function numField(label, value, onChange, step = 1) {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  wrap.textContent = label;
  const row = document.createElement('div');
  row.className = 'kce-stepper';
  const dec = document.createElement('button');
  dec.type = 'button';
  dec.textContent = '−';
  dec.title = 'Decrease (Shift = ×5)';
  const input = document.createElement('input');
  input.type = 'number';
  input.step = String(step);
  input.value = value != null ? value : 0;
  const inc = document.createElement('button');
  inc.type = 'button';
  inc.textContent = '+';
  inc.title = 'Increase (Shift = ×5)';
  const apply = (raw) => {
    const n = Number(raw);
    if (Number.isNaN(n)) return;
    onChange(n);
  };
  input.addEventListener('change', () => apply(input.value));
  const bump = (dir, ev) => {
    const mult = ev && ev.shiftKey ? 5 : 1;
    const cur = Number(input.value) || 0;
    const next = Math.round((cur + dir * step * mult) * 1000) / 1000;
    input.value = String(next);
    apply(next);
  };
  dec.addEventListener('click', (e) => bump(-1, e));
  inc.addEventListener('click', (e) => bump(1, e));
  row.appendChild(dec);
  row.appendChild(input);
  row.appendChild(inc);
  wrap.appendChild(row);
  return wrap;
}

/** Slider + numeric. `beginGesture` pushes one undo snapshot; `onLive` updates without rebuild. */
function sliderField(label, value, { min = 0, max = 100, step = 1, unit = '', format = null } = {}, onLive, beginGesture) {
  const wrap = document.createElement('div');
  wrap.className = 'field kce-slider-field';
  const head = document.createElement('div');
  head.className = 'kce-slider-head';
  const lab = document.createElement('span');
  lab.textContent = label;
  const read = document.createElement('span');
  read.className = 'kce-slider-readout';
  const fmt = (v) => (format ? format(v) : `${v}${unit}`);
  read.textContent = fmt(value != null ? value : min);
  head.appendChild(lab);
  head.appendChild(read);
  const row = document.createElement('div');
  row.className = 'kce-slider-row';
  const range = document.createElement('input');
  range.type = 'range';
  range.min = String(min);
  range.max = String(max);
  range.step = String(step);
  range.value = String(value != null ? value : min);
  const num = document.createElement('input');
  num.type = 'number';
  num.min = String(min);
  num.max = String(max);
  num.step = String(step);
  num.value = String(value != null ? value : min);
  let gesturing = false;
  const paint = (v) => {
    range.value = String(v);
    num.value = String(v);
    read.textContent = fmt(v);
  };
  range.addEventListener('pointerdown', () => {
    gesturing = true;
    if (typeof beginGesture === 'function') beginGesture();
  });
  range.addEventListener('input', () => {
    const v = Number(range.value);
    paint(v);
    onLive(v);
  });
  range.addEventListener('pointerup', () => { gesturing = false; });
  range.addEventListener('change', () => {
    const v = Number(range.value);
    paint(v);
    if (!gesturing && typeof beginGesture === 'function') beginGesture();
    onLive(v);
    gesturing = false;
  });
  num.addEventListener('change', () => {
    let v = Number(num.value);
    if (Number.isNaN(v)) return;
    v = Math.min(max, Math.max(min, v));
    if (typeof beginGesture === 'function') beginGesture();
    paint(v);
    onLive(v);
  });
  row.appendChild(range);
  row.appendChild(num);
  wrap.appendChild(head);
  wrap.appendChild(row);
  return wrap;
}

function beginLayerGesture() {
  const hit = selectedLayerHit();
  if (!hit || hit.layer.locked) return;
  state.history.push(state.composition);
  markDirty();
}

function colorField(label, value, onChange, { live = false } = {}) {
  const wrap = document.createElement('label');
  wrap.className = 'field kce-color-field';
  wrap.textContent = label;
  const row = document.createElement('div');
  row.className = 'kce-color-row';
  const picker = document.createElement('input');
  picker.type = 'color';
  const text = document.createElement('input');
  text.type = 'text';
  const hex = (value || '#000000').toString();
  const short = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;
  picker.value = /^#[0-9a-fA-F]{6}$/.test(short) ? short : '#000000';
  text.value = hex;
  let gesturing = false;
  const applyLive = (v) => {
    if (live) mutateLayerLive((l) => onChange(v, l));
    else onChange(v);
  };
  picker.addEventListener('pointerdown', () => {
    if (!live) return;
    gesturing = true;
    beginLayerGesture();
  });
  picker.addEventListener('input', () => {
    text.value = picker.value;
    if (live) applyLive(picker.value);
    else onChange(picker.value);
  });
  picker.addEventListener('change', () => {
    if (live && !gesturing) beginLayerGesture();
    if (live) applyLive(picker.value);
    else onChange(picker.value);
    gesturing = false;
  });
  text.addEventListener('change', () => {
    if (live) beginLayerGesture();
    if (live) applyLive(text.value.trim());
    else onChange(text.value.trim());
  });
  row.appendChild(picker);
  row.appendChild(text);
  wrap.appendChild(row);
  return wrap;
}

function toggleField(label, checked, onChange) {
  const wrap = document.createElement('label');
  wrap.className = 'kce-toggle';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = !!checked;
  input.addEventListener('change', () => onChange(input.checked));
  const track = document.createElement('span');
  track.className = 'kce-toggle-track';
  const text = document.createElement('span');
  text.className = 'kce-toggle-label';
  text.textContent = label;
  wrap.appendChild(input);
  wrap.appendChild(track);
  wrap.appendChild(text);
  return wrap;
}

/** Live-mutate without history (used during slider drag after first commit). */
function mutateLayerLive(mutator) {
  const hit = selectedLayerHit();
  if (!hit) return;
  if (hit.layer.locked) return;
  mutator(hit.layer, hit.panel);
  rebuildTranscript(state.composition);
  renderPage();
  drawSelectionOverlay();
}

function textAreaField(label, value, onChange, { live = false } = {}) {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  wrap.textContent = label;
  const ta = document.createElement('textarea');
  ta.rows = 4;
  ta.value = value || '';
  let started = false;
  if (live) {
    ta.addEventListener('focus', () => { started = false; });
    ta.addEventListener('input', () => {
      if (!started) {
        beginLayerGesture();
        started = true;
      }
      mutateLayerLive((l) => onChange(ta.value, l));
    });
    ta.addEventListener('change', () => {
      if (!started) beginLayerGesture();
      mutateLayerLive((l) => onChange(ta.value, l));
      started = false;
    });
  } else {
    ta.addEventListener('change', () => onChange(ta.value));
  }
  wrap.appendChild(ta);
  return wrap;
}

function checkField(label, checked, onChange) {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = !!checked;
  input.addEventListener('change', () => onChange(input.checked));
  wrap.appendChild(input);
  wrap.appendChild(document.createTextNode(` ${label}`));
  return wrap;
}

function renderContextBar() {
  const layer = selectedLayer();
  els.contextBar.innerHTML = '';
  if (!layer) {
    els.contextBar.hidden = true;
    return;
  }
  els.contextBar.hidden = false;
  const bits = [];
  bits.push([layer.locked ? 'Unlock' : 'Lock', () => setLayerLocked(layer.id, !layer.locked)]);
  bits.push([layer.visible === false ? 'Show' : 'Hide', () => setLayerVisible(layer.id, layer.visible === false)]);
  const reorder = (action) => {
    const hit = selectedLayerHit();
    if (!hit) return;
    state.history.push(state.composition);
    hit.panel.layers = reorderLayer(hit.panel.layers, layer.id, action);
    markDirty();
    renderAll();
  };
  bits.push(['Bring forward', () => reorder('forward')]);
  bits.push(['Send backward', () => reorder('backward')]);
  bits.push(['To front', () => reorder('front')]);
  bits.push(['To back', () => reorder('back')]);
  bits.push(['Duplicate', () => duplicateSelected()]);
  bits.push(['Delete', () => deleteSelected()]);
  if (layer.type === 'character') {
    bits.push([state.poseMode ? 'Exit pose mode' : 'Pose mode', () => {
      state.poseMode = !state.poseMode;
      renderAll();
    }]);
    bits.push(['Flip', () => mutateLayer((l) => { l.flipX = !l.flipX; })]);
  }
  bits.forEach(([label, fn]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', fn);
    els.contextBar.appendChild(b);
  });
}

function duplicateSelected() {
  const hit = selectedLayerHit();
  if (!hit) return;
  state.history.push(state.composition);
  const copy = cloneComposition(hit.layer);
  copy.id = `${hit.layer.id}_dup_${Math.random().toString(36).slice(2, 6)}`;
  copy.x += 12;
  copy.y += 12;
  copy.name = `${hit.layer.name || hit.layer.type} copy`;
  copy.locked = false;
  hit.panel.layers.push(copy);
  state.selectedLayerId = copy.id;
  markDirty();
  renderAll();
}

function deleteSelected() {
  const hit = selectedLayerHit();
  if (!hit) return;
  if (hit.layer.locked) {
    toast('Unlock before deleting');
    return;
  }
  state.history.push(state.composition);
  hit.panel.layers = hit.panel.layers.filter((l) => l.id !== hit.layer.id);
  state.selectedLayerId = hit.panel.layers.slice(-1)[0]?.id || null;
  markDirty();
  renderAll();
}

function renderProps() {
  els.props.innerHTML = '';
  const panel = selectedPanel();
  const layer = selectedLayer();
  if (!layer) {
    if (!panel) {
      els.props.innerHTML = '<p class="kce-empty">Select a panel or layer to edit it.</p>';
      return;
    }
    renderPanelProps(panel);
    return;
  }

  // Inspector is always driven by the canvas/layer selection — activity tabs only change left tools.
  if (layer.type === 'character') {
    renderCharacterProps(layer);
    renderTransformControls(layer);
  } else if (layer.type === 'bubble' || layer.type === 'text') {
    renderBubbleProps(layer);
  } else if (layer.type === 'image') {
    renderImageProps(layer);
    renderTransformControls(layer);
  } else {
    renderGenericProps(layer);
    renderTransformControls(layer);
  }

  renderAdvanced(layer);
}

function renderPanelProps(panel) {
  const title = document.createElement('h2');
  title.className = 'kce-section-title';
  title.textContent = 'Panel layout';
  els.props.appendChild(title);
  els.props.appendChild(Object.assign(document.createElement('p'), {
    className: 'kce-selection-target',
    textContent: `Editing panel: ${panel.name || panel.id}${isReferencePanel(panel) ? ' (reference)' : ''}`
  }));
  els.props.appendChild(toggleField('Clip artwork to panel', panel.clip !== false, (v) => {
    mutatePanel((p) => { p.clip = v; if (v) p.allowBleed = false; });
  }));
  els.props.appendChild(toggleField('Let artwork extend outside panel', panel.allowBleed, (v) => {
    mutatePanel((p) => { p.allowBleed = v; if (v) p.clip = false; });
  }));
  els.props.appendChild(numField('Corner radius', panel.cornerRadius || 0, (v) => mutatePanel((p) => { p.cornerRadius = v; })));
  const row = document.createElement('div');
  row.className = 'kce-row';
  row.appendChild(numField('X', panel.x, (v) => mutatePanel((p) => { p.x = v; })));
  row.appendChild(numField('Y', panel.y, (v) => mutatePanel((p) => { p.y = v; })));
  els.props.appendChild(row);
  const size = document.createElement('div');
  size.className = 'kce-row';
  size.appendChild(numField('Width', panel.width, (v) => mutatePanel((p) => { p.width = v; })));
  size.appendChild(numField('Height', panel.height, (v) => mutatePanel((p) => { p.height = v; })));
  els.props.appendChild(size);
}

function renderCharacterProps(layer) {
  const def = getCharacterDef(layer);
  const title = document.createElement('h2');
  title.className = 'kce-section-title';
  title.textContent = layer.name || 'Character';
  els.props.appendChild(title);

  if (!def) {
    els.props.appendChild(Object.assign(document.createElement('p'), {
      className: 'kce-empty',
      textContent: 'Character rig missing. Check rigSrc path.'
    }));
    return;
  }

  const poseTitle = document.createElement('div');
  poseTitle.className = 'kce-section-title';
  poseTitle.textContent = 'Pose';
  els.props.appendChild(poseTitle);
  const poseGrid = document.createElement('div');
  poseGrid.className = 'kce-pose-grid';
  Object.keys(def.poses || {}).forEach((poseId) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `kce-pose-card${layer.poseId === poseId ? ' selected' : ''}`;
    card.innerHTML = `<div class="viz"></div>${(def.poses[poseId].label || poseId)}`;
    card.addEventListener('click', () => {
      mutateLayer((l) => {
        l.poseId = poseId;
        l.partState = applyPoseToState(def, poseId, {});
      });
    });
    poseGrid.appendChild(card);
  });
  els.props.appendChild(poseGrid);

  if (def.expressionMode === 'faceSwap') {
    const exprTitle = document.createElement('div');
    exprTitle.className = 'kce-section-title';
    exprTitle.textContent = 'Expression';
    els.props.appendChild(exprTitle);
    const exprGrid = document.createElement('div');
    exprGrid.className = 'kce-expr-grid';
    Object.keys(def.expressions || {}).forEach((exprId) => {
      const ex = def.expressions[exprId];
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `kce-expr-card${layer.expressionId === exprId ? ' selected' : ''}`;
      const base = layer.rigSrc.replace(/\/[^/]+$/, '');
      card.innerHTML = `<img alt="" src="/${base}/${ex.face}"><span>${ex.label || exprId}</span>`;
      card.addEventListener('click', () => mutateLayer((l) => { l.expressionId = exprId; }));
      exprGrid.appendChild(card);
    });
    els.props.appendChild(exprGrid);
  } else if (def.expressionGap || def.expressionMode === 'none') {
    const exprTitle = document.createElement('div');
    exprTitle.className = 'kce-section-title';
    exprTitle.textContent = 'Expression';
    els.props.appendChild(exprTitle);
    els.props.appendChild(Object.assign(document.createElement('p'), {
      className: 'kce-help',
      textContent: def.expressionGap || 'No expression variants in the source artwork — controls hidden.'
    }));
  }

  const poseModeBtn = document.createElement('button');
  poseModeBtn.type = 'button';
  poseModeBtn.className = state.poseMode ? 'primary' : '';
  poseModeBtn.textContent = state.poseMode ? 'Pose mode on — drag gold joints' : 'Enter pose mode';
  poseModeBtn.style.width = '100%';
  poseModeBtn.style.marginBottom = '0.5rem';
  poseModeBtn.addEventListener('click', () => {
    state.poseMode = !state.poseMode;
    renderAll();
  });
  els.props.appendChild(poseModeBtn);

  if (state.poseMode) {
    const jointBox = document.createElement('div');
    jointBox.className = 'kce-joint-list';
    const posed = applyPoseToState(def, layer.poseId || 'standing', layer.partState || {});
    (def.parts || []).filter((p) => p.parent).forEach((part) => {
      const rot = (posed[part.id] && posed[part.id].rotation) || 0;
      jointBox.appendChild(numField(part.id.replace(/_/g, ' '), rot, (v) => {
        mutateLayer((l) => {
          l.partState = mergePartState(def, l.partState, part.id, { rotation: v });
        });
      }, 1));
    });
    els.props.appendChild(jointBox);
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = 'Reset pose';
    reset.addEventListener('click', () => {
      mutateLayer((l) => {
        l.partState = applyPoseToState(def, l.poseId || 'standing', {});
      });
    });
    els.props.appendChild(reset);

    const savePose = document.createElement('button');
    savePose.type = 'button';
    savePose.textContent = 'Save custom pose';
    savePose.style.marginLeft = '0.35rem';
    savePose.addEventListener('click', () => {
      const name = prompt('Pose name', 'custom');
      if (!name) return;
      const pose = extractPose(def, layer.partState, name);
      if (!state.customPoses[def.id]) state.customPoses[def.id] = {};
      state.customPoses[def.id][name] = pose;
      localStorage.setItem('kce-custom-poses', JSON.stringify(state.customPoses));
      toast(`Saved pose “${name}” for ${def.name}`);
      renderActivityPanel();
    });
    els.props.appendChild(savePose);
  }

  const chipRow = document.createElement('div');
  chipRow.className = 'kce-chip-row';
  [['Flip horizontal', () => mutateLayer((l) => { l.flipX = !l.flipX; })],
    ['Flip vertical', () => mutateLayer((l) => { l.flipY = !l.flipY; })]
  ].forEach(([label, fn]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'kce-chip';
    b.textContent = label;
    b.addEventListener('click', fn);
    chipRow.appendChild(b);
  });
  els.props.appendChild(chipRow);
}

function applyBubbleRole(layer, role, { procedural = false } = {}) {
  layer.role = role;
  const nextTail = defaultTail(role, layer.width, layer.height);
  if (role === 'caption') {
    layer.tail = nextTail;
    layer.cornerRadius = 4;
    if (procedural || !layer.shapeSrc) {
      layer.fill = '#111111';
      layer.colour = layer.colour && layer.colour !== '#111111' ? layer.colour : '#f5f5f5';
      layer.shape = 'rounded';
    }
  } else if (role === 'thought') {
    layer.tail = Object.assign(nextTail, normalizeTail(layer.tail, layer.width, layer.height, role), { enabled: true });
    layer.cornerRadius = 40;
    if (procedural || !layer.shapeSrc) {
      layer.fill = '#ffffff';
      layer.colour = '#111111';
      layer.shape = 'ellipse';
    }
  } else {
    layer.tail = Object.assign(nextTail, normalizeTail(layer.tail, layer.width, layer.height, role), { enabled: true });
    layer.cornerRadius = layer.cornerRadius != null ? layer.cornerRadius : 22;
    if (procedural || !layer.shapeSrc) {
      layer.fill = '#ffffff';
      layer.colour = '#111111';
      layer.shape = 'rounded';
      layer.strokeWidth = layer.strokeWidth != null ? layer.strokeWidth : 2.25;
    }
  }
}

/** Show procedural bubble before discarding imported Affinity shape art. */
function previewProceduralConversion(layer) {
  const proposed = proceduralFromImportedBox(layer);
  const pathD = buildSpeechBubblePath(layer.width, layer.height, proposed.cornerRadius, proposed.tail);
  const pad = 24;
  const tipExtra = Math.max(0, (proposed.tail.tipY || 0) - layer.height) + 8;
  const svgW = layer.width + pad * 2;
  const svgH = layer.height + tipExtra + pad * 2;
  const overlay = document.createElement('div');
  overlay.className = 'kce-modal-backdrop';
  overlay.innerHTML = `
    <div class="kce-modal" role="dialog" aria-label="Procedural bubble preview">
      <h2 class="kce-section-title">Procedural replacement preview</h2>
      <p class="kce-help">Imported path art is kept until you confirm. This editable bubble matches the current box and a comic-style tail; lettering stays editable.</p>
      <div class="kce-modal-preview">
        <svg width="${svgW}" height="${svgH}" viewBox="${-pad} ${-pad} ${svgW} ${svgH}">
          <path d="${pathD}" fill="${proposed.fill}" stroke="${proposed.stroke}" stroke-width="${proposed.strokeWidth}" stroke-linejoin="round"/>
          <text x="${layer.width / 2}" y="${(layer.height / 2) + 4}" text-anchor="middle" fill="${proposed.colour}" font-size="14" font-family="Laffayette Comic Pro, Source Sans 3, sans-serif">${(layer.text || '…').split('\n')[0].slice(0, 28)}</text>
        </svg>
      </div>
      <div class="kce-modal-actions">
        <button type="button" data-act="cancel">Keep imported shape</button>
        <button type="button" class="primary" data-act="apply">Replace with this bubble</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (ev) => {
    const act = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-act');
    if (!act && ev.target !== overlay) return;
    if (act === 'apply') {
      mutateLayer((l) => {
        Object.assign(l, proposed);
        l.shapeSrc = '';
      });
      toast('Replaced with procedural bubble — drag the tip to aim at the speaker');
    }
    overlay.remove();
  });
}

function renderBubbleProps(layer) {
  const title = document.createElement('h2');
  title.className = 'kce-section-title';
  title.textContent = 'Dialogue';
  els.props.appendChild(title);

  const target = document.createElement('p');
  target.className = 'kce-selection-target';
  const mode = layer.shapeSrc ? 'imported shape + lettering' : `${layer.role || 'speech'} (procedural)`;
  target.textContent = `Editing: ${layer.name || layer.id} · ${mode}`;
  els.props.appendChild(target);

  els.props.appendChild(textAreaField('Words', layer.text, (v, l) => { l.text = v; }, { live: true }));

  const styleTitle = document.createElement('div');
  styleTitle.className = 'kce-section-title';
  styleTitle.textContent = layer.shapeSrc ? 'Role (lettering mode)' : 'Bubble style';
  els.props.appendChild(styleTitle);

  const styles = document.createElement('div');
  styles.className = 'kce-chip-row';
  [['Speech', 'speech'], ['Thought', 'thought'], ['Caption', 'caption']].forEach(([label, role]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `kce-chip${layer.role === role ? ' selected' : ''}`;
    b.textContent = label;
    b.title = layer.shapeSrc
      ? 'Changes role metadata only — imported Affinity shape is preserved until you replace it'
      : `Switch to ${label.toLowerCase()} procedural style`;
    b.addEventListener('click', () => mutateLayer((l) => applyBubbleRole(l, role, { procedural: !l.shapeSrc })));
    styles.appendChild(b);
  });
  els.props.appendChild(styles);

  if (layer.shapeSrc) {
    const note = document.createElement('p');
    note.className = 'kce-help';
    note.textContent = `Imported shape: ${layer.shapeSrc.split('/').pop()}. Edit lettering and transform freely. Fill, tail and corner controls stay unavailable until you replace the shape.`;
    els.props.appendChild(note);
    const replace = document.createElement('button');
    replace.type = 'button';
    replace.style.width = '100%';
    replace.style.marginBottom = '0.55rem';
    replace.textContent = 'Preview procedural replacement…';
    replace.title = 'Show the editable procedural bubble before replacing imported Affinity art';
    replace.addEventListener('click', () => previewProceduralConversion(layer));
    els.props.appendChild(replace);
  } else {
    if (layer.role !== 'caption') {
      const tail = normalizeTail(layer.tail, layer.width, layer.height, layer.role || 'speech');
      els.props.appendChild(toggleField('Show tail / thought trail', !!tail.enabled, (v) => {
        mutateLayer((l) => {
          const t = normalizeTail(l.tail, l.width, l.height, l.role || 'speech');
          t.enabled = v;
          l.tail = t;
        });
      }));
      if (tail.enabled) {
        const geomTitle = document.createElement('div');
        geomTitle.className = 'kce-section-title';
        geomTitle.textContent = 'Tail geometry';
        els.props.appendChild(geomTitle);
        els.props.appendChild(Object.assign(document.createElement('p'), {
          className: 'kce-help',
          textContent: 'Drag tip / attach / width / curve handles on the canvas. On body resize, tip scales with width/height; attach and base width stay put.'
        }));
        els.props.appendChild(numField('Tip X', Math.round(tail.tipX), (v) => {
          mutateLayer((l) => { l.tail = Object.assign(normalizeTail(l.tail, l.width, l.height, l.role), { tipX: v }); });
        }));
        els.props.appendChild(numField('Tip Y', Math.round(tail.tipY), (v) => {
          mutateLayer((l) => { l.tail = Object.assign(normalizeTail(l.tail, l.width, l.height, l.role), { tipY: v }); });
        }));
        els.props.appendChild(sliderField(
          'Attach around body', Math.round(tail.attach * 100),
          { min: 0, max: 100, step: 1, unit: '%', format: (v) => `${v}%` },
          (v) => mutateLayerLive((l) => {
            l.tail = Object.assign(normalizeTail(l.tail, l.width, l.height, l.role), { attach: v / 100 });
          }),
          beginLayerGesture
        ));
        els.props.appendChild(sliderField(
          'Base width', Math.round(tail.baseWidth),
          { min: 8, max: 80, step: 1, unit: 'px' },
          (v) => mutateLayerLive((l) => {
            l.tail = Object.assign(normalizeTail(l.tail, l.width, l.height, l.role), { baseWidth: v });
          }),
          beginLayerGesture
        ));
        els.props.appendChild(sliderField(
          'Curvature', Math.round(tail.curve * 100),
          { min: 0, max: 100, step: 1, unit: '%', format: (v) => `${v}%` },
          (v) => mutateLayerLive((l) => {
            l.tail = Object.assign(normalizeTail(l.tail, l.width, l.height, l.role), { curve: v / 100 });
          }),
          beginLayerGesture
        ));
      }
    }
    els.props.appendChild(colorField('Fill', layer.fill || '#ffffff', (v, l) => { l.fill = v; }, { live: true }));
    els.props.appendChild(colorField('Stroke', layer.stroke || '#111111', (v, l) => { l.stroke = v; }, { live: true }));
    els.props.appendChild(sliderField(
      'Stroke width', layer.strokeWidth != null ? layer.strokeWidth : 2,
      { min: 0, max: 8, step: 0.5, unit: 'px' },
      (v) => mutateLayerLive((l) => { l.strokeWidth = v; }),
      beginLayerGesture
    ));
    if (layer.role !== 'thought') {
      els.props.appendChild(sliderField(
        'Corner radius', layer.cornerRadius != null ? layer.cornerRadius : 18,
        { min: 0, max: 48, step: 1, unit: 'px' },
        (v) => mutateLayerLive((l) => { l.cornerRadius = v; }),
        beginLayerGesture
      ));
    }
  }

  els.props.appendChild(colorField('Text colour', layer.colour || '#111111', (v, l) => { l.colour = v; }, { live: true }));

  els.props.appendChild(sliderField(
    'Font size', layer.fontSize || 18,
    { min: 8, max: 48, step: 1, unit: 'px' },
    (v) => mutateLayerLive((l) => { l.fontSize = v; }),
    beginLayerGesture
  ));
  els.props.appendChild(sliderField(
    'Line height', layer.lineHeight != null ? layer.lineHeight : 1.25,
    { min: 0.9, max: 2.2, step: 0.05, format: (v) => `${Number(v).toFixed(2)}×` },
    (v) => mutateLayerLive((l) => { l.lineHeight = v; }),
    beginLayerGesture
  ));
  els.props.appendChild(sliderField(
    'Letter spacing', layer.letterSpacing != null ? layer.letterSpacing : 0,
    { min: -1, max: 4, step: 0.1, unit: 'px' },
    (v) => mutateLayerLive((l) => { l.letterSpacing = v; }),
    beginLayerGesture
  ));
  els.props.appendChild(toggleField('Auto-wrap lines', layer.textWrap !== false, (v) => mutateLayer((l) => { l.textWrap = v; })));

  const alignRow = document.createElement('div');
  alignRow.className = 'kce-chip-row';
  [['Left', 'left'], ['Center', 'center'], ['Right', 'right']].forEach(([label, align]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `kce-chip${(layer.textAlign || 'center') === align ? ' selected' : ''}`;
    b.textContent = label;
    b.addEventListener('click', () => mutateLayer((l) => { l.textAlign = align; }));
    alignRow.appendChild(b);
  });
  const alignLab = document.createElement('label');
  alignLab.className = 'field';
  alignLab.textContent = 'Text align';
  alignLab.appendChild(alignRow);
  els.props.appendChild(alignLab);

  if (layer.textX != null || layer.shapeSrc) {
    const letterTitle = document.createElement('div');
    letterTitle.className = 'kce-section-title';
    letterTitle.textContent = 'Lettering placement';
    els.props.appendChild(letterTitle);
    els.props.appendChild(numField('Text X (baseline)', layer.textX != null ? layer.textX : 0, (v) => mutateLayer((l) => { l.textX = v; })));
    els.props.appendChild(numField('Text Y (baseline)', layer.textY != null ? layer.textY : 0, (v) => mutateLayer((l) => { l.textY = v; })));
  }

  renderTransformControls(layer);
}

function renderImageProps(layer) {
  const title = document.createElement('h2');
  title.className = 'kce-section-title';
  title.textContent = layer.name || 'Artwork';
  els.props.appendChild(title);
  els.props.appendChild(checkField('Keep proportions', layer.preserveAspectRatio !== false, (v) => {
    mutateLayer((l) => { l.preserveAspectRatio = v; });
  }));
  // Enter group: list constituent vector parts from inlined SVG cache for path-level hide/select.
  if (layer.src && /\.svg(?:$|\?)/i.test(layer.src) && state.svgCache[layer.src]) {
    const enter = document.createElement('details');
    enter.className = 'kce-group-parts';
    enter.open = !!layer._partsOpen;
    const sum = document.createElement('summary');
    sum.textContent = 'Enter group — constituent paths';
    enter.appendChild(sum);
    const help = document.createElement('p');
    help.className = 'kce-help';
    help.textContent = 'Whole figure stays one selectable layer. Open to hide/show source path groups without flattening.';
    enter.appendChild(help);
    const doc = new DOMParser().parseFromString(state.svgCache[layer.src], 'image/svg+xml');
    const parts = [...doc.querySelectorAll('g[id], path[id]')].filter((node) => (
      !node.closest('defs, mask, clipPath, symbol, pattern, linearGradient, radialGradient, filter, marker')
    )).slice(0, 80);
    const hidden = new Set(layer.hiddenPartIds || []);
    parts.forEach((node, idx) => {
      const id = node.getAttribute('id') || `${node.nodeName}-${idx}`;
      const row = document.createElement('label');
      row.className = 'field kce-part-row';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !hidden.has(id);
      cb.addEventListener('change', () => {
        mutateLayer((l) => {
          const set = new Set(l.hiddenPartIds || []);
          if (cb.checked) set.delete(id);
          else set.add(id);
          l.hiddenPartIds = [...set];
        });
      });
      row.appendChild(cb);
      row.appendChild(document.createTextNode(` ${id}`));
      enter.appendChild(row);
    });
    if (!parts.length) {
      const p = document.createElement('p');
      p.className = 'kce-help';
      p.textContent = 'No named groups/paths in this SVG (unnamed Affinity clusters). Geometry remains inlined for inspection in DevTools.';
      enter.appendChild(p);
    }
    enter.addEventListener('toggle', () => { layer._partsOpen = enter.open; });
    els.props.appendChild(enter);
  }
  const variants = state.assets.filter((a) => {
    const cur = state.assets.find((x) => x.id === layer.assetId);
    return cur && a.variantGroup === cur.variantGroup && a.kind !== 'reference-sheet' && a.kind !== 'poseable' && a.kind !== 'groupedSvg';
  });
  if (variants.length > 1) {
    const sel = document.createElement('select');
    variants.forEach((a) => {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.variantName || a.name;
      if (a.id === layer.assetId) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', () => {
      const asset = state.assets.find((a) => a.id === sel.value);
      if (!asset) return;
      mutateLayer((l) => Object.assign(l, replaceLayerVariant(l, asset)));
    });
    const lab = document.createElement('label');
    lab.className = 'field';
    lab.textContent = 'Variant';
    lab.appendChild(sel);
    els.props.appendChild(lab);
  }
}

function renderGenericProps(layer) {
  els.props.appendChild(Object.assign(document.createElement('h2'), {
    className: 'kce-section-title',
    textContent: layer.name || layer.type
  }));
}

function renderTransformControls(layer) {
  const title = document.createElement('div');
  title.className = 'kce-section-title';
  title.textContent = 'Transform';
  els.props.appendChild(title);

  const row = document.createElement('div');
  row.className = 'kce-row';
  row.appendChild(numField('X', layer.x, (v) => mutateLayer((l) => { l.x = v; })));
  row.appendChild(numField('Y', layer.y, (v) => mutateLayer((l) => { l.y = v; })));
  els.props.appendChild(row);

  const sizeRow = document.createElement('div');
  sizeRow.className = 'kce-row';
  sizeRow.appendChild(numField('Width', layer.width, (v) => {
    mutateLayer((l) => {
      if (l.preserveAspectRatio !== false && l.width) {
        const ratio = l.height / l.width;
        l.width = v;
        l.height = Math.round(v * ratio);
      } else {
        l.width = v;
      }
    });
  }));
  sizeRow.appendChild(numField('Height', layer.height, (v) => {
    mutateLayer((l) => {
      if (l.preserveAspectRatio !== false && l.height) {
        const ratio = l.width / l.height;
        l.height = v;
        l.width = Math.round(v * ratio);
      } else {
        l.height = v;
      }
    });
  }));
  els.props.appendChild(sizeRow);

  if (layer.type === 'image' || layer.type === 'character') {
    els.props.appendChild(toggleField('Lock aspect ratio', layer.preserveAspectRatio !== false, (v) => {
      mutateLayer((l) => { l.preserveAspectRatio = v; }, { allowWhileLocked: true });
    }));
  }

  const rotWrap = document.createElement('div');
  rotWrap.className = 'kce-rot-wrap';
  rotWrap.appendChild(sliderField(
    'Rotation', layer.rotation || 0,
    { min: -180, max: 180, step: 1, unit: '°' },
    (v) => mutateLayerLive((l) => { l.rotation = v; }),
    beginLayerGesture
  ));
  const resetRot = document.createElement('button');
  resetRot.type = 'button';
  resetRot.className = 'kce-chip';
  resetRot.textContent = 'Reset rotation';
  resetRot.addEventListener('click', () => mutateLayer((l) => { l.rotation = 0; }));
  rotWrap.appendChild(resetRot);
  els.props.appendChild(rotWrap);

  els.props.appendChild(sliderField(
    'Opacity', Math.round((layer.opacity != null ? layer.opacity : 1) * 100),
    { min: 0, max: 100, step: 1, unit: '%', format: (v) => `${v}%` },
    (v) => mutateLayerLive((l) => { l.opacity = v / 100; }),
    beginLayerGesture
  ));

  const stateRow = document.createElement('div');
  stateRow.className = 'kce-chip-row';
  els.props.appendChild(toggleField('Visible', layer.visible !== false, (v) => setLayerVisible(layer.id, v)));
  els.props.appendChild(toggleField('Locked', !!layer.locked, (v) => setLayerLocked(layer.id, v)));
}

function renderAdvanced(layer) {
  const details = document.createElement('details');
  details.className = 'kce-advanced';
  const summary = document.createElement('summary');
  summary.textContent = 'Advanced';
  details.appendChild(summary);
  const body = document.createElement('div');
  body.appendChild(Object.assign(document.createElement('p'), {
    className: 'kce-help',
    textContent: 'Technical values for this selection only. Panel layout is edited when a panel (not a layer) is selected.'
  }));
  body.appendChild(Object.assign(document.createElement('p'), {
    className: 'kce-help',
    textContent: `Layer id: ${layer.id}`
  }));
  body.appendChild(textAreaField('Translation / note', layer.translation || '', (v) => mutateLayer((l) => { l.translation = v; })));
  const fx = layer.effects || {};
  body.appendChild(toggleField('Drop shadow', fx.dropShadow?.enabled, (v) => mutateLayer((l) => { l.effects.dropShadow.enabled = v; })));
  body.appendChild(toggleField('Glow', fx.glow?.enabled, (v) => mutateLayer((l) => { l.effects.glow.enabled = v; })));
  body.appendChild(toggleField('Pulse glow (web only)', fx.pulseGlow?.enabled, (v) => mutateLayer((l) => { l.effects.pulseGlow.enabled = v; })));
  details.appendChild(body);
  els.props.appendChild(details);
}

function renderActivityPanel() {
  const root = els.activityPanel;
  root.innerHTML = '';
  els.hint.textContent = HINTS[state.activity] || '';
  document.querySelectorAll('.kce-activity').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.activity === state.activity);
  });

  if (state.activity === 'layout') renderLayoutActivity(root);
  else if (state.activity === 'characters') renderCharactersActivity(root);
  else if (state.activity === 'scene') renderSceneActivity(root);
  else if (state.activity === 'dialogue') renderDialogueActivity(root);
  else if (state.activity === 'effects') renderEffectsActivity(root);
  else if (state.activity === 'preview') renderPreviewActivity(root);
}

function renderLayoutActivity(root) {
  root.innerHTML = '<h2 class="kce-section-title">Page layout</h2>';
  const grid = document.createElement('div');
  grid.className = 'kce-preset-grid';
  [
    ['single', 'Single'],
    ['two-horizontal', '2 stacked'],
    ['two-vertical', '2 side'],
    ['three-row', '3 stacked'],
    ['four-grid', '4 grid'],
    ['six-grid', '6 grid']
  ].forEach(([id, label]) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'kce-preset-card';
    card.innerHTML = `<div class="viz"></div><span class="label">${label}</span>`;
    card.addEventListener('click', () => {
      if (!confirm('Replace all panels with this layout?')) return;
      state.history.push(state.composition);
      applyGridPreset(state.composition, id);
      state.selectedPanelId = state.composition.panels[0].id;
      state.selectedLayerId = null;
      markDirty();
      renderAll();
      fitZoom();
    });
    grid.appendChild(card);
  });
  root.appendChild(grid);
  const row = document.createElement('div');
  row.className = 'kce-row-3';
  [['Add panel', () => {
    state.history.push(state.composition);
    const panel = createPanel({ name: `Panel ${state.composition.panels.length + 1}` });
    state.composition.panels.push(panel);
    state.selectedPanelId = panel.id;
    markDirty();
    renderAll();
  }], ['Duplicate panel', () => {
    const panel = selectedPanel();
    if (!panel) return;
    state.history.push(state.composition);
    const copy = cloneComposition(panel);
    copy.id = `panel_${Date.now().toString(36)}`;
    copy.name = `${panel.name} copy`;
    copy.x += 16;
    copy.y += 16;
    copy.layers = copy.layers.map((l) => Object.assign({}, l, {
      id: `${l.id}_c_${Math.random().toString(36).slice(2, 5)}`,
      locked: false
    }));
    state.composition.panels.push(copy);
    state.selectedPanelId = copy.id;
    markDirty();
    renderAll();
  }], ['Delete panel', () => {
    if (state.composition.panels.length <= 1) return toast('Keep at least one panel');
    state.history.push(state.composition);
    state.composition.panels = state.composition.panels.filter((p) => p.id !== state.selectedPanelId);
    state.selectedPanelId = state.composition.panels[0].id;
    markDirty();
    renderAll();
  }]].forEach(([label, fn]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', fn);
    row.appendChild(b);
  });
  root.appendChild(row);
}

function assetThumb(asset) {
  if (asset.thumb) return `/${asset.thumb}`;
  if (asset.kind === 'groupedSvg') return '/art/comics/library/characters/jim/prep/jim_figure.svg';
  if (asset.kind === 'poseable') return '/art/comics/library/characters/jim/parts/head.svg';
  return `/${asset.src}`;
}

function renderCharactersActivity(root) {
  root.innerHTML = '<h2 class="kce-section-title">Characters</h2><p class="kce-help">Poseable characters can change pose and expression. Reference sheets are labelled and stay static.</p>';
  const grid = document.createElement('div');
  grid.className = 'kce-asset-grid';
  state.assets.filter((a) => a.category === 'characters').forEach((asset) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `kce-asset${state.selectedAssetId === asset.id ? ' selected' : ''}${asset.kind === 'reference-sheet' ? ' reference' : ''}`;
    const badge = asset.kind === 'groupedSvg'
      ? 'artwork'
      : (asset.kind === 'poseable' ? 'cutout' : (asset.kind === 'reference-sheet' ? 'reference' : 'static'));
    card.innerHTML = `<div class="kce-asset-thumb"><img alt="" src="${assetThumb(asset)}" loading="lazy"></div>
      <div class="kce-asset-name">${asset.name}</div>
      <span class="kce-badge ${badge}">${badge}</span>`;
    card.addEventListener('click', () => {
      state.selectedAssetId = asset.id;
      renderActivityPanel();
    });
    card.addEventListener('dblclick', () => addAssetToPanel(asset));
    grid.appendChild(card);
  });
  root.appendChild(grid);
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'primary';
  addBtn.style.width = '100%';
  addBtn.style.marginTop = '0.6rem';
  addBtn.textContent = 'Add to selected panel';
  addBtn.addEventListener('click', () => {
    const asset = state.assets.find((a) => a.id === state.selectedAssetId);
    if (!asset) return toast('Select a character first');
    addAssetToPanel(asset);
  });
  root.appendChild(addBtn);

  const customs = state.customPoses.char_jim_poseable || {};
  const names = Object.keys(customs);
  if (names.length) {
    root.appendChild(Object.assign(document.createElement('h2'), { className: 'kce-section-title', textContent: 'Saved poses' }));
    names.forEach((name) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = name;
      b.style.margin = '0 0.25rem 0.25rem 0';
      b.addEventListener('click', () => {
        const layer = selectedLayer();
        const def = getCharacterDef(layer);
        if (!layer || !def || layer.type !== 'character') return toast('Select a poseable character');
        mutateLayer((l) => {
          l.partState = applyPoseToState(def, null, Object.assign(defaultPartState(def), customs[name].parts));
          l.poseId = 'custom';
        });
      });
      root.appendChild(b);
    });
  }
}

function renderSceneActivity(root) {
  root.innerHTML = '<h2 class="kce-section-title">Scene</h2>';
  const cats = ['backgrounds', 'props', 'effects'];
  const grid = document.createElement('div');
  grid.className = 'kce-asset-grid';
  state.assets.filter((a) => cats.includes(a.category)).forEach((asset) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `kce-asset${state.selectedAssetId === asset.id ? ' selected' : ''}`;
    card.innerHTML = `<div class="kce-asset-thumb"><img alt="" src="${assetThumb(asset)}" loading="lazy"></div>
      <div class="kce-asset-name">${asset.name}</div>`;
    card.addEventListener('click', () => { state.selectedAssetId = asset.id; renderActivityPanel(); });
    card.addEventListener('dblclick', () => addAssetToPanel(asset));
    grid.appendChild(card);
  });
  root.appendChild(grid);
  const row = document.createElement('div');
  row.className = 'kce-row';
  row.style.marginTop = '0.5rem';
  const importBtn = document.createElement('button');
  importBtn.type = 'button';
  importBtn.textContent = 'Import files…';
  importBtn.addEventListener('click', () => document.getElementById('import-files').click());
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'primary';
  addBtn.textContent = 'Add to panel';
  addBtn.addEventListener('click', () => {
    const asset = state.assets.find((a) => a.id === state.selectedAssetId);
    if (!asset) return toast('Select an asset');
    addAssetToPanel(asset);
  });
  row.appendChild(importBtn);
  row.appendChild(addBtn);
  root.appendChild(row);
}

function addDialogue(role) {
  const panel = panelForContent();
  if (!panel) {
    toast('Add or select a panel first (Layout tab)');
    return;
  }
  if (isReferencePanel(panel)) {
    toast('Select an art panel — not the reference sheet — then add dialogue');
    return;
  }
  state.history.push(state.composition);
  const isCaption = role === 'caption';
  const isThought = role === 'thought';
  const width = isCaption
    ? Math.max(120, Math.min(panel.width - 40, panel.width - 80))
    : Math.min(isThought ? 200 : 220, Math.max(100, panel.width - 40));
  const height = isCaption ? 56 : (isThought ? 100 : 92);
  const tailExtra = isCaption ? 0 : (isThought ? 36 : 26);
  const existing = panel.layers.filter((l) => l.type === 'bubble' || l.type === 'text').length;
  let x = Math.max(12, (panel.width - width) / 2) + (existing % 3) * 18;
  let y = isCaption
    ? Math.max(12, panel.height - height - 16)
    : Math.max(12, Math.min(40, panel.height - height - tailExtra - 8)) + (existing % 4) * 22;
  if (!isCaption && y + height + tailExtra > panel.height - 4) {
    y = Math.max(8, panel.height - height - tailExtra - 4);
  }
  x = Math.min(x, Math.max(8, panel.width - width - 8));
  const layer = createBubbleLayer({
    role,
    name: isCaption ? 'Caption' : (isThought ? 'Thought' : 'Speech'),
    text: isCaption ? 'Caption…' : (isThought ? 'Hmm…' : 'New dialogue…'),
    x,
    y,
    width,
    height,
    fill: isCaption ? '#111111' : '#ffffff',
    colour: isCaption ? '#f5f5f5' : '#111111',
    cornerRadius: isCaption ? 4 : (isThought ? 40 : 18),
    shape: isThought ? 'ellipse' : 'rounded',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    textWrap: true,
    shapeSrc: '',
    strokeWidth: 2.25,
    cornerRadius: isCaption ? 4 : (isThought ? 40 : 22),
    tail: defaultTail(role, width, height)
  });
  panel.layers.push(layer);
  state.selectedPanelId = panel.id;
  state.selectedLayerId = layer.id;
  state.activity = 'dialogue';
  state.expandedLayers[layer.id] = true;
  state.collapsedPanels[panel.id] = false;
  markDirty();
  renderAll();
  requestAnimationFrame(() => {
    const item = els.layerList.querySelector(`[data-layer-id="${layer.id}"]`);
    if (item) item.scrollIntoView({ block: 'nearest' });
    const words = els.props.querySelector('textarea');
    if (words) {
      words.focus();
      words.select();
    }
  });
  toast(`Added ${layer.name} in ${panel.name || panel.id} — edit words in Properties`);
}

function renderDialogueActivity(root) {
  root.innerHTML = '';
  const title = document.createElement('h2');
  title.className = 'kce-section-title';
  title.textContent = 'Dialogue';
  root.appendChild(title);

  const panel = panelForContent();
  const target = document.createElement('p');
  target.className = 'kce-selection-target';
  if (!panel) {
    target.textContent = 'No panel selected — open Layout and add a panel first.';
  } else if (isReferencePanel(panel)) {
    target.textContent = 'Reference panel selected — choose an art panel below.';
  } else {
    target.textContent = `New bubbles go into: ${panel.name || panel.id}`;
  }
  root.appendChild(target);

  if (productionPanels().length) {
    const sel = document.createElement('select');
    productionPanels().forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name || p.id;
      if (p.id === (panel && panel.id)) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', () => {
      state.selectedPanelId = sel.value;
      state.selectedLayerId = null;
      renderAll();
    });
    const lab = document.createElement('label');
    lab.className = 'field';
    lab.textContent = 'Target panel';
    lab.appendChild(sel);
    root.appendChild(lab);
  }

  root.appendChild(Object.assign(document.createElement('p'), {
    className: 'kce-help',
    textContent: 'Creates a visible, selected bubble in the target panel. Imported page lettering keeps its Affinity shape until you replace it.'
  }));

  [['Speech bubble', 'speech', 'primary'], ['Thought bubble', 'thought', ''], ['Caption', 'caption', '']].forEach(([label, role, cls]) => {
    const b = document.createElement('button');
    b.type = 'button';
    if (cls) b.className = cls;
    b.style.width = '100%';
    b.style.marginBottom = '0.4rem';
    b.textContent = `+ ${label}`;
    b.disabled = !productionPanels().length;
    b.title = b.disabled ? 'No art panels available' : `Add ${label.toLowerCase()} to the target panel`;
    b.addEventListener('click', () => addDialogue(role));
    root.appendChild(b);
  });
}

function renderEffectsActivity(root) {
  root.innerHTML = '<h2 class="kce-section-title">Effects</h2>';
  const layer = selectedLayer();
  if (!layer) {
    root.appendChild(Object.assign(document.createElement('p'), {
      className: 'kce-empty',
      textContent: 'Select a layer to apply effects.'
    }));
    return;
  }
  const fx = layer.effects || {};
  [
    ['Drop shadow', 'dropShadow'],
    ['Glow', 'glow'],
    ['Outline', 'outline'],
    ['Tint', 'tint'],
    ['Pulse glow (web)', 'pulseGlow']
  ].forEach(([label, key]) => {
    root.appendChild(checkField(label, fx[key]?.enabled, (v) => {
      mutateLayer((l) => { l.effects[key].enabled = v; });
    }));
  });
}

async function openLivePreview() {
  if (!state.composition) return toast('Nothing to preview');
  try {
    rebuildTranscript(state.composition);
    const text = serializeComposition(state.composition);
    const data = await api('/preview', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: state.composition.id || 'preview',
        text,
        sourcePath: state.path || '',
        dirty: !!state.dirty
      })
    });
    const url = `/comics-editor/preview.html?token=${encodeURIComponent(data.token)}&t=${Date.now()}`;
    window.open(url, 'kce-preview');
    toast(state.dirty ? 'Preview includes unsaved edits' : 'Preview opened');
  } catch (e) {
    toast(e.message || 'Preview failed — is npm run editor running?');
  }
}

function renderPreviewActivity(root) {
  root.innerHTML = '<h2 class="kce-section-title">Preview & export</h2><p class="kce-help">Live preview uses the shared reader renderer with the composition open now (including unsaved edits). Editor handles never appear.</p>';
  [['Open live preview', () => openLivePreview()],
    ['Export PNG', () => document.getElementById('btn-export-png').click()],
    ['Export SVG', () => document.getElementById('btn-export-svg').click()]
  ].forEach(([label, fn]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = label.includes('PNG') ? 'primary' : '';
    b.style.width = '100%';
    b.style.marginBottom = '0.4rem';
    b.textContent = label;
    b.addEventListener('click', fn);
    root.appendChild(b);
  });
}

async function addAssetToPanel(asset) {
  const panel = panelForContent();
  if (!panel) return toast('Select a panel first');
  if (isReferencePanel(panel)) return toast('Select an art panel, not the reference sheet');
  if (asset.kind === 'reference-sheet') {
    toast('That’s a reference sheet — use the poseable Jim for posing, or add as static art from Scene if you really need the sheet');
    // Allow adding as static image if user confirms
    if (!confirm('Add the reference sheet as a static image (not poseable)?')) return;
  }

  state.history.push(state.composition);
  let layer;
  if ((asset.kind === 'poseable' || asset.kind === 'groupedSvg') && asset.characterDef) {
    await ensureCharacterDefs({
      panels: [{ layers: [{ type: 'character', rigSrc: asset.characterDef, characterId: asset.id }] }]
    });
    const def = state.characterDefs[asset.characterDef] || state.characterDefs[asset.id];
    const defaultPose = (def && def.poses && (def.poses.neutral ? 'neutral' : Object.keys(def.poses)[0])) || 'standing';
    const w = Math.min(panel.width * 0.55, (def && def.defaultSize && def.defaultSize.width) || 200);
    const h = Math.round(w * (((def && def.defaultSize && def.defaultSize.height) || 360) / ((def && def.defaultSize && def.defaultSize.width) || 200)));
    layer = createCharacterLayer({
      name: asset.name,
      characterId: asset.id,
      rigSrc: asset.characterDef,
      poseId: defaultPose,
      expressionId: def && def.expressionMode === 'faceSwap' ? 'happy' : null,
      partState: def ? applyPoseToState(def, defaultPose, {}) : {},
      x: (panel.width - w) / 2,
      y: (panel.height - h) / 2,
      width: w,
      height: h
    });
  } else {
    const maxW = panel.width * 0.75;
    const ratio = (asset.height && asset.width) ? asset.height / asset.width : 1;
    const width = Math.min(maxW, asset.width > 800 ? 280 : (asset.width || 240));
    const height = Math.round(width * ratio);
    layer = createImageLayer({
      name: asset.name,
      assetId: asset.id,
      src: asset.src,
      x: (panel.width - width) / 2,
      y: (panel.height - height) / 2,
      width,
      height
    });
  }
  panel.layers.push(layer);
  state.selectedLayerId = layer.id;
  markDirty();
  renderAll();
  toast(`Added ${asset.name}`);
}

function renderAll() {
  if (!state.selectedPanelId || !state.composition.panels.some((p) => p.id === state.selectedPanelId)) {
    const prod = firstProductionPanel();
    state.selectedPanelId = prod ? prod.id : (state.composition.panels[0]?.id || null);
  }
  renderPage();
  renderPanelSelect();
  renderLayers();
  renderProps();
  renderContextBar();
  renderActivityPanel();
  applyViewTransform();
}

function hitTest(pageX, pageY) {
  for (let p = state.composition.panels.length - 1; p >= 0; p--) {
    const panel = state.composition.panels[p];
    const lx = pageX - panel.x;
    const ly = pageY - panel.y;
    for (let i = panel.layers.length - 1; i >= 0; i--) {
      const layer = panel.layers[i];
      if (layer.visible === false) continue;
      if (lx >= layer.x && ly >= layer.y && lx <= layer.x + layer.width && ly <= layer.y + layer.height) {
        return { panel, layer };
      }
    }
    if (pageX >= panel.x && pageY >= panel.y && pageX <= panel.x + panel.width && pageY <= panel.y + panel.height) {
      return { panel, layer: null };
    }
  }
  return null;
}

function bindCanvasInteraction() {
  let spaceDown = false;
  window.addEventListener('keydown', (e) => { if (e.code === 'Space' && !isTypingTarget(e.target)) spaceDown = true; });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') spaceDown = false; });

  els.wrap.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      state.zoom = Math.min(3, Math.max(0.1, state.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
      applyViewTransform();
      drawSelectionOverlay();
    }
  }, { passive: false });

  els.wrap.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const pagePt = screenToPage(e.clientX, e.clientY);
    if (spaceDown || e.altKey) {
      state.drag = { type: 'pan', x: e.clientX, y: e.clientY, panX: state.panX, panY: state.panY };
      els.wrap.classList.add('panning');
      return;
    }

    const joint = e.target.closest('.kce-joint-handle');
    if (joint && state.poseMode) {
      const hit = selectedLayerHit();
      const def = hit && getCharacterDef(hit.layer);
      if (hit && def && !hit.layer.locked) {
        state.history.push(state.composition);
        state.drag = {
          type: 'joint',
          partId: joint.dataset.partId,
          startAngle: null,
          layerRef: hit.layer,
          panel: hit.panel,
          def
        };
        state.selectedPartId = joint.dataset.partId;
      }
      return;
    }

    const bubbleHandle = e.target.closest('.kce-bubble-handle');
    if (bubbleHandle && state.selectedLayerId) {
      const hit = selectedLayerHit();
      if (hit && !hit.layer.locked && !hit.layer.shapeSrc) {
        state.history.push(state.composition);
        const tail = normalizeTail(hit.layer.tail, hit.layer.width, hit.layer.height, hit.layer.role || 'speech');
        hit.layer.tail = tail;
        state.drag = {
          type: 'bubble',
          mode: bubbleHandle.dataset.bubbleHandle,
          start: pagePt,
          layerRef: hit.layer,
          panel: hit.panel,
          origTail: Object.assign({}, tail)
        };
      }
      return;
    }

    const handle = e.target.closest('.kce-handle');
    if (handle && state.selectedLayerId) {
      const hit = selectedLayerHit();
      if (hit && !hit.layer.locked) {
        state.history.push(state.composition);
        state.drag = {
          type: 'resize',
          handle: handle.dataset.handle,
          start: pagePt,
          orig: {
            x: hit.layer.x,
            y: hit.layer.y,
            width: hit.layer.width,
            height: hit.layer.height,
            tail: hit.layer.tail ? Object.assign({}, hit.layer.tail) : null
          },
          layerRef: hit.layer
        };
      }
      return;
    }

    const hit = hitTest(pagePt.x, pagePt.y);
    if (hit) {
      state.selectedPanelId = hit.panel.id;
      state.selectedLayerId = hit.layer ? hit.layer.id : null;
      renderLayers();
      renderProps();
      renderContextBar();
      drawSelectionOverlay();
      if (hit.layer && !hit.layer.locked && !state.poseMode) {
        state.history.push(state.composition);
        state.drag = {
          type: 'move',
          start: pagePt,
          origX: hit.layer.x,
          origY: hit.layer.y,
          layerRef: hit.layer
        };
      } else if (hit.layer && hit.layer.locked) {
        toast('Layer is locked — unlock from the layer list');
      }
    } else {
      state.selectedLayerId = null;
      renderLayers();
      renderProps();
      renderContextBar();
      drawSelectionOverlay();
    }
  });

  window.addEventListener('pointermove', (e) => {
    if (!state.drag) return;
    if (state.drag.type === 'pan') {
      state.panX = state.drag.panX + (e.clientX - state.drag.x);
      state.panY = state.drag.panY + (e.clientY - state.drag.y);
      applyViewTransform();
      return;
    }
    const pagePt = screenToPage(e.clientX, e.clientY);
    if (state.drag.type === 'move') {
      let nx = state.drag.origX + (pagePt.x - state.drag.start.x);
      let ny = state.drag.origY + (pagePt.y - state.drag.start.y);
      if (state.composition.page.snap) {
        nx = Math.round(nx / 4) * 4;
        ny = Math.round(ny / 4) * 4;
      }
      state.drag.layerRef.x = nx;
      state.drag.layerRef.y = ny;
      markDirty();
      renderPage();
      drawSelectionOverlay();
    } else if (state.drag.type === 'resize') {
      const o = state.drag.orig;
      const layer = state.drag.layerRef;
      const h = state.drag.handle;
      const dx = pagePt.x - state.drag.start.x;
      const dy = pagePt.y - state.drag.start.y;
      let x = o.x; let y = o.y; let w = o.width; let ht = o.height;
      if (h.includes('e')) w = Math.max(8, o.width + dx);
      if (h.includes('s')) ht = Math.max(8, o.height + dy);
      if (h.includes('w')) { x = o.x + dx; w = Math.max(8, o.width - dx); }
      if (h.includes('n')) { y = o.y + dy; ht = Math.max(8, o.height - dy); }
      if (e.shiftKey && layer.preserveAspectRatio !== false) ht = Math.round(w * (o.height / o.width));
      Object.assign(layer, { x, y, width: w, height: ht });
      // Body resize: tip scales with width/height; attach/baseWidth/curve unchanged.
      if ((layer.type === 'bubble' || layer.type === 'text') && o.tail) {
        layer.tail = scaleTailForBodyResize(o.tail, o.width, o.height, w, ht);
      }
      markDirty();
      renderPage();
      drawSelectionOverlay();
    } else if (state.drag.type === 'bubble') {
      const layer = state.drag.layerRef;
      const lx = pagePt.x - state.drag.panel.x - layer.x;
      const ly = pagePt.y - state.drag.panel.y - layer.y;
      const tail = Object.assign({}, layer.tail || {});
      const mode = state.drag.mode;
      if (mode === 'tip') {
        tail.tipX = lx;
        tail.tipY = ly;
      } else if (mode === 'attach') {
        tail.attach = attachFromPoint(layer.width, layer.height, layer.cornerRadius || 18, lx, ly);
      } else if (mode === 'baseWidth') {
        const mid = bubbleHandlePoints(layer.width, layer.height, layer.cornerRadius || 18, tail);
        if (mid) {
          const dx = lx - mid.attach.x;
          const dy = ly - mid.attach.y;
          // Project onto tangent roughly via distance from attach
          tail.baseWidth = Math.max(8, Math.min(layer.width * 0.6, Math.hypot(dx, dy) * 2));
        }
      } else if (mode === 'curve') {
        const mid = bubbleHandlePoints(layer.width, layer.height, layer.cornerRadius || 18, tail);
        if (mid) {
          const along = Math.hypot(lx - mid.attach.x, ly - mid.attach.y);
          const tipDist = Math.hypot(tail.tipX - mid.attach.x, tail.tipY - mid.attach.y) || 1;
          tail.curve = Math.max(0, Math.min(1, along / tipDist));
        }
      }
      layer.tail = normalizeTail(tail, layer.width, layer.height, layer.role || 'speech');
      markDirty();
      renderPage();
      drawSelectionOverlay();
    } else if (state.drag.type === 'joint') {
      const layer = state.drag.layerRef;
      const panel = state.drag.panel;
      const def = state.drag.def;
      const posed = applyPoseToState(def, layer.poseId || 'standing', layer.partState || {});
      const parts = resolvePartTransforms(def, posed);
      const part = parts.find((p) => p.id === state.drag.partId);
      if (!part) return;
      const vb = def.viewBox || [0, 0, 200, 360];
      const sx = layer.width / (vb[2] || 200);
      const sy = layer.height / (vb[3] || 360);
      const cx = panel.x + layer.x + part.pivotX * sx;
      const cy = panel.y + layer.y + part.pivotY * sy;
      const angle = Math.atan2(pagePt.y - cy, pagePt.x - cx) * 180 / Math.PI;
      // Convert screen angle into relative rotation around downward-ish default
      const rotation = clampPartRotation(def, state.drag.partId, angle - 90 - (part.worldRotation - ((posed[state.drag.partId] && posed[state.drag.partId].rotation) || 0)));
      // Simpler: set absolute local rotation from drag delta
      if (state.drag.startAngle == null) {
        state.drag.startAngle = angle;
        state.drag.baseRotation = (posed[state.drag.partId] && posed[state.drag.partId].rotation) || 0;
      }
      const delta = angle - state.drag.startAngle;
      layer.partState = mergePartState(def, layer.partState, state.drag.partId, {
        rotation: state.drag.baseRotation + delta
      });
      markDirty();
      renderPage();
    }
  });

  window.addEventListener('pointerup', () => {
    if (state.drag && (state.drag.type === 'move' || state.drag.type === 'resize' || state.drag.type === 'joint' || state.drag.type === 'bubble')) {
      renderProps();
      renderContextBar();
      drawSelectionOverlay();
    }
    state.drag = null;
    els.wrap.classList.remove('panning');
  });
}

/** Prefetch composition SVG assets so the renderer can inline nested FilB/texture images. */
async function preloadCompositionSvgs(composition) {
  const urls = new Set();
  (composition.panels || []).forEach((panel) => {
    (panel.layers || []).forEach((layer) => {
      if (layer.src && /\.svg(?:$|\?)/i.test(layer.src)) urls.add(layer.src);
      if (layer.shapeSrc && /\.svg(?:$|\?)/i.test(layer.shapeSrc)) urls.add(layer.shapeSrc);
    });
  });
  await Promise.all([...urls].map(async (src) => {
    if (state.svgCache[src]) return;
    try {
      const res = await fetch(`/${src.replace(/^\//, '')}`);
      if (res.ok) state.svgCache[src] = await res.text();
    } catch (e) { /* ignore */ }
  }));
}

async function loadComposition(relPath) {
  const data = await api(`/composition?path=${encodeURIComponent(relPath)}`);
  const composition = parseComposition(data.text);
  await ensureCharacterDefs(composition);
  await preloadCompositionSvgs(composition);
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch (e) { /* ignore */ }
  }
  state.composition = composition;
  state.path = data.path;
  state.dirty = false;
  state.history.clear();
  state.poseMode = false;
  const prod = composition.panels.find((p) => !isReferencePanel(p)) || composition.panels[0];
  state.selectedPanelId = prod?.id || null;
  state.selectedLayerId = prod?.layers.slice(-1)[0]?.id || null;
  setStatus(`Saved — ${state.path}`);
  renderAll();
  fitZoom();
}

async function saveComposition(path = state.path) {
  rebuildTranscript(state.composition);
  const text = serializeComposition(state.composition);
  const check = validateComposition(state.composition);
  if (!check.ok) throw new Error(check.errors.join('; '));
  await api('/composition', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, text })
  });
  state.path = path;
  state.dirty = false;
  setStatus(`Saved — ${state.path}`);
  toast('Saved');
}

function bindToolbar() {
  document.querySelectorAll('.kce-activity').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activity = btn.dataset.activity;
      if (state.activity !== 'characters') state.poseMode = false;
      // Activity tabs only change the left tools — selection/inspector stay on the current object.
      renderActivityPanel();
      document.querySelectorAll('.kce-activity').forEach((b) => {
        b.classList.toggle('active', b.dataset.activity === state.activity);
      });
      els.hint.textContent = HINTS[state.activity] || '';
    });
  });

  document.getElementById('btn-new').onclick = () => {
    if (state.dirty && !confirm('Discard unsaved changes?')) return;
    state.composition = createEmptyComposition({ title: 'Untitled page' });
    applyGridPreset(state.composition, 'three-row');
    state.path = `art/comics/compositions/${state.composition.id}.json`;
    state.history.clear();
    state.dirty = true;
    state.selectedPanelId = state.composition.panels[0].id;
    state.selectedLayerId = null;
    state.activity = 'layout';
    setStatus(`Unsaved — ${state.path}`, 'dirty');
    renderAll();
    fitZoom();
  };
  document.getElementById('btn-open').onclick = async () => {
    const list = await api('/compositions');
    const choice = prompt(`Open composition path:\n${list.compositions.map((c) => c.path).join('\n')}`, state.path);
    if (!choice) return;
    if (state.dirty && !confirm('Discard unsaved changes?')) return;
    await loadComposition(choice);
  };
  document.getElementById('btn-save').onclick = () => saveComposition().catch((e) => { setStatus(e.message, 'error'); toast(e.message); });
  document.getElementById('btn-save-as').onclick = async () => {
    const path = prompt('Save as path under art/comics/compositions/', state.path);
    if (!path) return;
    await saveComposition(path);
  };
  document.getElementById('btn-undo').onclick = () => {
    if (!state.history.canUndo()) return;
    state.composition = state.history.undo(state.composition);
    markDirty();
    renderAll();
  };
  document.getElementById('btn-redo').onclick = () => {
    if (!state.history.canRedo()) return;
    state.composition = state.history.redo(state.composition);
    markDirty();
    renderAll();
  };
  document.getElementById('btn-zoom-in').onclick = () => { state.zoom = Math.min(3, state.zoom * 1.15); applyViewTransform(); drawSelectionOverlay(); };
  document.getElementById('btn-zoom-out').onclick = () => { state.zoom = Math.max(0.1, state.zoom / 1.15); applyViewTransform(); drawSelectionOverlay(); };
  document.getElementById('btn-zoom-fit').onclick = () => { fitZoom(); drawSelectionOverlay(); };
  document.getElementById('btn-preview').onclick = () => openLivePreview();
  document.getElementById('btn-export-png').onclick = async () => {
    try {
      await ensureCharacterDefs();
      const { blob } = await exportPng(state.composition, {
        scale: 2,
        assetBase: '',
        characterDefs: state.characterDefs,
        svgCache: state.svgCache
      });
      const buf = await blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      bytes.forEach((b) => { binary += String.fromCharCode(b); });
      await api('/export-file', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: `${state.composition.id}.png`, dataBase64: btoa(binary) })
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${state.composition.id}.png`;
      a.click();
      toast('Exported PNG');
    } catch (e) { toast(e.message); }
  };
  document.getElementById('btn-export-svg').onclick = () => {
    const { svg, limitations } = exportSvg(state.composition, {
      assetBase: '',
      characterDefs: state.characterDefs,
      svgCache: state.svgCache
    });
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${state.composition.id}.svg`;
    a.click();
    toast(limitations.length ? `SVG exported with notes` : 'SVG exported');
  };

  els.panelSelect.onchange = () => {
    state.selectedPanelId = els.panelSelect.value;
    state.selectedLayerId = selectedPanel()?.layers.slice(-1)[0]?.id || null;
    renderAll();
  };

  document.getElementById('import-files').onchange = async (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      bytes.forEach((b) => { binary += String.fromCharCode(b); });
      const result = await api('/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          category: 'imports',
          name: file.name.replace(/\.[^.]+$/, ''),
          dataBase64: btoa(binary),
          tags: ['imports', 'imported']
        })
      });
      result.asset.kind = result.asset.kind || 'static';
      state.assets.push(result.asset);
      state.selectedAssetId = result.asset.id;
    }
    renderActivityPanel();
    toast(`Imported ${files.length} file(s)`);
    e.target.value = '';
  };
}

function bindKeys() {
  window.addEventListener('keydown', (e) => {
    if (isTypingTarget(e.target)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveComposition().catch((err) => toast(err.message)); return; }
    if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); document.getElementById('btn-undo').click(); return; }
    if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); document.getElementById('btn-redo').click(); return; }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelected(); return; }
    const layer = selectedLayer();
    if (!layer || layer.locked) return;
    const step = e.shiftKey ? 10 : 1;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      state.history.push(state.composition);
      if (e.key === 'ArrowUp') layer.y -= step;
      if (e.key === 'ArrowDown') layer.y += step;
      if (e.key === 'ArrowLeft') layer.x -= step;
      if (e.key === 'ArrowRight') layer.x += step;
      markDirty();
      renderPage();
      renderProps();
    }
  });
  window.addEventListener('beforeunload', (e) => {
    if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
  });
}

async function boot() {
  try {
    await api('/health');
    state.serverOk = true;
  } catch (e) {
    setStatus('Authoring server offline — npm run editor', 'error');
  }

  try {
    state.customPoses = JSON.parse(localStorage.getItem('kce-custom-poses') || '{}');
  } catch (e) { state.customPoses = {}; }

  try {
    const catalog = await (state.serverOk ? api('/assets') : fetch('/art/comics/library/assets.json').then((r) => r.json()));
    state.assets = catalog.assets || [];
  } catch (e) { state.assets = []; }

  // Prefetch Jim artwork rig (actual SVG paths) and legacy cutout rig
  for (const rigPath of [
    'art/comics/library/characters/jim/prep/character.json',
    'art/comics/library/characters/jim/character.json'
  ]) {
    try {
      const res = await fetch(`/${rigPath}`);
      if (!res.ok) continue;
      const def = await res.json();
      state.characterDefs[def.id] = def;
      state.characterDefs[rigPath] = def;
      if (def.svgSrc) {
        const svgRes = await fetch(`/${def.svgSrc}`);
        if (svgRes.ok) state.svgCache[def.svgSrc] = await svgRes.text();
      }
    } catch (e) { /* ignore */ }
  }

  try {
    if (state.serverOk) await loadComposition(state.path);
    else {
      const text = await fetch(`/${state.path}`).then((r) => r.text());
      state.composition = parseComposition(text);
      await ensureCharacterDefs();
      await preloadCompositionSvgs(state.composition);
      renderAll();
      fitZoom();
    }
  } catch (e) {
    state.composition = createEmptyComposition();
    applyGridPreset(state.composition, 'three-row');
    renderAll();
    setStatus(e.message, 'error');
  }

  bindToolbar();
  bindCanvasInteraction();
  bindKeys();
  setInterval(async () => {
    if (!state.composition || !state.serverOk) return;
    try {
      await api('/autosave', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: state.composition.id, text: serializeComposition(state.composition) })
      });
    } catch (e) { /* ignore */ }
  }, 20000);
}

boot();
