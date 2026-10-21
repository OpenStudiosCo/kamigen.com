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
  serverOk: false
};

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

function selectedPanel() {
  return state.composition.panels.find((p) => p.id === state.selectedPanelId)
    || state.composition.panels[0]
    || null;
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
        els.overlay.appendChild(h);
      });
  }

  if (state.poseMode && layer.type === 'character' && !layer.locked) {
    drawJointHandles(panel, layer);
  }
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
  els.panelSelect.innerHTML = state.composition.panels.map((p) =>
    `<option value="${p.id}" ${p.id === state.selectedPanelId ? 'selected' : ''}>${p.name || p.id}</option>`
  ).join('');
}

function renderLayers() {
  const panel = selectedPanel();
  els.layerList.innerHTML = '';
  if (!panel) return;
  [...panel.layers].reverse().forEach((layer, visualIndex) => {
    const storageIndex = panel.layers.length - 1 - visualIndex;
    const li = document.createElement('li');
    li.className = [
      'kce-layer-item',
      layer.id === state.selectedLayerId ? 'active' : '',
      layer.locked ? 'locked-layer' : '',
      layer.visible === false ? 'hidden-layer' : ''
    ].filter(Boolean).join(' ');
    li.draggable = !layer.locked;
    li.dataset.layerId = layer.id;

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = layer.name || layer.type;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = [
      layer.type === 'character' ? 'character' : layer.type,
      layer.locked ? 'locked' : '',
      layer.visible === false ? 'hidden' : ''
    ].filter(Boolean).join(' · ');

    const actions = document.createElement('div');
    actions.className = 'kce-layer-actions';

    const visBtn = document.createElement('button');
    visBtn.type = 'button';
    visBtn.className = 'icon-btn';
    visBtn.title = layer.visible === false ? 'Show' : 'Hide';
    visBtn.setAttribute('aria-label', visBtn.title);
    visBtn.textContent = layer.visible === false ? '○' : '●';
    visBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setLayerVisible(layer.id, layer.visible === false);
    });

    const lockBtn = document.createElement('button');
    lockBtn.type = 'button';
    lockBtn.className = 'icon-btn';
    lockBtn.title = layer.locked ? 'Unlock' : 'Lock';
    lockBtn.setAttribute('aria-label', lockBtn.title);
    lockBtn.setAttribute('aria-pressed', layer.locked ? 'true' : 'false');
    lockBtn.textContent = layer.locked ? '🔒' : '🔓';
    lockBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setLayerLocked(layer.id, !layer.locked);
    });

    actions.appendChild(visBtn);
    actions.appendChild(lockBtn);
    li.appendChild(name);
    li.appendChild(actions);
    li.appendChild(meta);

    li.addEventListener('click', () => {
      state.selectedLayerId = layer.id;
      state.selectedPanelId = panel.id;
      if (layer.type === 'character') state.activity = 'characters';
      else if (layer.type === 'bubble') state.activity = 'dialogue';
      renderAll();
    });
    li.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', String(storageIndex)));
    li.addEventListener('dragover', (e) => e.preventDefault());
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      const from = Number(e.dataTransfer.getData('text/plain'));
      const to = storageIndex;
      state.history.push(state.composition);
      const layers = panel.layers.slice();
      const [item] = layers.splice(from, 1);
      layers.splice(to, 0, item);
      panel.layers = layers;
      markDirty();
      renderAll();
    });
    els.layerList.appendChild(li);
  });
}

function numField(label, value, onChange, step = 1) {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  wrap.textContent = label;
  const input = document.createElement('input');
  input.type = 'number';
  input.step = String(step);
  input.value = value != null ? value : 0;
  input.addEventListener('change', () => onChange(Number(input.value)));
  wrap.appendChild(input);
  return wrap;
}

function textAreaField(label, value, onChange) {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  wrap.textContent = label;
  const ta = document.createElement('textarea');
  ta.rows = 4;
  ta.value = value || '';
  ta.addEventListener('change', () => onChange(ta.value));
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
  bits.push(['Bring forward', () => {
    const panel = selectedPanel();
    if (!panel) return;
    state.history.push(state.composition);
    panel.layers = reorderLayer(panel.layers, layer.id, 'forward');
    markDirty();
    renderAll();
  }]);
  bits.push(['Send backward', () => {
    const panel = selectedPanel();
    if (!panel) return;
    state.history.push(state.composition);
    panel.layers = reorderLayer(panel.layers, layer.id, 'backward');
    markDirty();
    renderAll();
  }]);
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
      els.props.innerHTML = '<p class="kce-empty">Select something on the page to edit it.</p>';
      return;
    }
    renderPanelProps(panel);
    return;
  }

  if (layer.type === 'character') renderCharacterProps(layer);
  else if (layer.type === 'bubble' || layer.type === 'text') renderBubbleProps(layer);
  else if (layer.type === 'image') renderImageProps(layer);
  else renderGenericProps(layer);

  renderAdvanced(layer, panel);
}

function renderPanelProps(panel) {
  const title = document.createElement('h2');
  title.className = 'kce-section-title';
  title.textContent = 'Panel';
  els.props.appendChild(title);
  els.props.appendChild(checkField('Clip artwork to panel', panel.clip !== false, (v) => {
    mutatePanel((p) => { p.clip = v; if (v) p.allowBleed = false; });
  }));
  els.props.appendChild(checkField('Let artwork extend outside panel', panel.allowBleed, (v) => {
    mutatePanel((p) => { p.allowBleed = v; if (v) p.clip = false; });
  }));
  els.props.appendChild(numField('Panel corners', panel.cornerRadius, (v) => mutatePanel((p) => { p.cornerRadius = v; })));
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

function renderBubbleProps(layer) {
  const title = document.createElement('h2');
  title.className = 'kce-section-title';
  title.textContent = 'Dialogue';
  els.props.appendChild(title);
  els.props.appendChild(textAreaField('Words', layer.text, (v) => mutateLayer((l) => { l.text = v; })));
  els.props.appendChild(textAreaField('Translation / note', layer.translation, (v) => mutateLayer((l) => { l.translation = v; })));

  const styles = document.createElement('div');
  styles.className = 'kce-chip-row';
  [['Speech', 'speech'], ['Thought', 'thought'], ['Caption', 'caption']].forEach(([label, role]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `kce-chip${layer.role === role ? ' selected' : ''}`;
    b.textContent = label;
    b.addEventListener('click', () => mutateLayer((l) => {
      l.role = role;
      if (role === 'caption') {
        l.tail = Object.assign({}, l.tail || {}, { enabled: false });
        l.fill = '#111111';
        l.colour = '#f5f5f5';
        l.cornerRadius = 4;
      } else {
        l.tail = Object.assign({}, l.tail || {}, { enabled: true });
        l.fill = '#ffffff';
        l.colour = '#111111';
        l.cornerRadius = role === 'thought' ? 40 : 18;
      }
    }));
    styles.appendChild(b);
  });
  els.props.appendChild(styles);
  els.props.appendChild(numField('Text size', layer.fontSize, (v) => mutateLayer((l) => { l.fontSize = v; })));
  els.props.appendChild(numField('Line height', layer.lineHeight != null ? layer.lineHeight : 1.25, (v) => mutateLayer((l) => { l.lineHeight = v; }), 0.05));
  els.props.appendChild(numField('Letter spacing', layer.letterSpacing != null ? layer.letterSpacing : 0, (v) => mutateLayer((l) => { l.letterSpacing = v; }), 0.1));
  els.props.appendChild(checkField('Auto-wrap lines', layer.textWrap !== false, (v) => mutateLayer((l) => { l.textWrap = v; })));
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
    els.props.appendChild(numField('Text X (baseline)', layer.textX != null ? layer.textX : 0, (v) => mutateLayer((l) => { l.textX = v; })));
    els.props.appendChild(numField('Text Y (baseline)', layer.textY != null ? layer.textY : 0, (v) => mutateLayer((l) => { l.textY = v; })));
  }
  if (layer.shapeSrc) {
    const note = document.createElement('p');
    note.className = 'kce-help';
    note.textContent = `Shape art: ${layer.shapeSrc.split('/').pop()} (moves with this bubble)`;
    els.props.appendChild(note);
  }
  if (layer.tail && !layer.shapeSrc) {
    els.props.appendChild(checkField('Show speech tail', layer.tail.enabled, (v) => mutateLayer((l) => { l.tail.enabled = v; })));
  }
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
    const parts = [...doc.querySelectorAll('g[id], path[id]')].slice(0, 80);
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

function renderAdvanced(layer, panel) {
  const details = document.createElement('details');
  details.className = 'kce-advanced';
  details.innerHTML = '<summary>Advanced</summary>';
  const body = document.createElement('div');
  body.appendChild(numField('X', layer.x, (v) => mutateLayer((l) => { l.x = v; })));
  body.appendChild(numField('Y', layer.y, (v) => mutateLayer((l) => { l.y = v; })));
  body.appendChild(numField('Width', layer.width, (v) => mutateLayer((l) => { l.width = v; })));
  body.appendChild(numField('Height', layer.height, (v) => mutateLayer((l) => { l.height = v; })));
  body.appendChild(numField('Rotation', layer.rotation, (v) => mutateLayer((l) => { l.rotation = v; })));
  body.appendChild(numField('Opacity', layer.opacity, (v) => mutateLayer((l) => { l.opacity = v; }), 0.05));
  body.appendChild(checkField('Locked', layer.locked, (v) => setLayerLocked(layer.id, v)));
  body.appendChild(checkField('Visible', layer.visible !== false, (v) => setLayerVisible(layer.id, v)));
  if (panel) {
    body.appendChild(numField('Panel X', panel.x, (v) => mutatePanel((p) => { p.x = v; })));
    body.appendChild(numField('Panel Y', panel.y, (v) => mutatePanel((p) => { p.y = v; })));
    body.appendChild(numField('Panel width', panel.width, (v) => mutatePanel((p) => { p.width = v; })));
    body.appendChild(numField('Panel height', panel.height, (v) => mutatePanel((p) => { p.height = v; })));
  }
  const fx = layer.effects || {};
  body.appendChild(checkField('Drop shadow', fx.dropShadow?.enabled, (v) => mutateLayer((l) => { l.effects.dropShadow.enabled = v; })));
  body.appendChild(checkField('Glow', fx.glow?.enabled, (v) => mutateLayer((l) => { l.effects.glow.enabled = v; })));
  body.appendChild(checkField('Pulse glow (web)', fx.pulseGlow?.enabled, (v) => mutateLayer((l) => { l.effects.pulseGlow.enabled = v; })));
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

function renderDialogueActivity(root) {
  root.innerHTML = '<h2 class="kce-section-title">Dialogue</h2><p class="kce-help">Add a bubble, then type in the inspector.</p>';
  [['Speech bubble', 'speech'], ['Thought bubble', 'thought'], ['Caption', 'caption']].forEach(([label, role]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.style.width = '100%';
    b.style.marginBottom = '0.4rem';
    b.textContent = `+ ${label}`;
    b.addEventListener('click', () => {
      const panel = selectedPanel();
      if (!panel) return;
      state.history.push(state.composition);
      const layer = createBubbleLayer({
        role,
        name: label,
        text: role === 'caption' ? 'Caption…' : 'New dialogue…',
        x: 40,
        y: role === 'caption' ? panel.height - 70 : 40,
        width: role === 'caption' ? panel.width - 80 : 220,
        height: role === 'caption' ? 56 : 100,
        fill: role === 'caption' ? '#111' : '#fff',
        colour: role === 'caption' ? '#f5f5f5' : '#111',
        cornerRadius: role === 'caption' ? 4 : 18,
        tail: { enabled: role === 'speech' || role === 'thought', x: 40, y: 110, direction: 'down' }
      });
      panel.layers.push(layer);
      state.selectedLayerId = layer.id;
      markDirty();
      renderAll();
    });
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

function renderPreviewActivity(root) {
  root.innerHTML = '<h2 class="kce-section-title">Preview & export</h2><p class="kce-help">Open the public reader demo, or export a still image. Editor handles never appear in exports.</p>';
  [['Open reader preview', () => window.open('/comics/composition-demo.html', '_blank')],
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
  const panel = selectedPanel();
  if (!panel) return toast('Select a panel first');
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
  if (!state.selectedPanelId && state.composition.panels[0]) {
    state.selectedPanelId = state.composition.panels[0].id;
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

    const handle = e.target.closest('.kce-handle');
    if (handle && state.selectedLayerId) {
      const hit = selectedLayerHit();
      if (hit && !hit.layer.locked) {
        state.history.push(state.composition);
        state.drag = {
          type: 'resize',
          handle: handle.dataset.handle,
          start: pagePt,
          orig: { x: hit.layer.x, y: hit.layer.y, width: hit.layer.width, height: hit.layer.height },
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
      markDirty();
      renderPage();
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
    if (state.drag && (state.drag.type === 'move' || state.drag.type === 'resize' || state.drag.type === 'joint')) {
      renderProps();
      renderContextBar();
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
  state.selectedPanelId = composition.panels[0]?.id || null;
  state.selectedLayerId = composition.panels[0]?.layers.slice(-1)[0]?.id || null;
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
      renderAll();
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
  document.getElementById('btn-preview').onclick = () => {
    const path = state.path || '';
    if (path.includes('page_8_reconstruction')) {
      window.open('/comics/page_8_compare.html', '_blank');
    } else {
      window.open('/comics/composition-demo.html', '_blank');
    }
  };
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
