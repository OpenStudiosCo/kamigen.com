var KamigenComics = (function (exports) {
  'use strict';

  const FORMAT_NAME = 'kamigen-comic-composition';
  const FORMAT_VERSION = 2;

  function defaultEffects() {
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

  function validateComposition(data) {
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

  function migrateComposition(data) {
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

  function normalizeComposition(data) {
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
  function listCharacterRigPaths(composition) {
    const paths = new Set();
    (composition.panels || []).forEach((panel) => {
      (panel.layers || []).forEach((layer) => {
        if (layer.type === 'character' && layer.rigSrc) paths.add(layer.rigSrc);
      });
    });
    return Array.from(paths);
  }

  function parseComposition(text) {
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

  /**
   * Lightweight hierarchical cutout rig (forward kinematics).
   * Part state is local (rotation / optional local offset) so poses stay reusable.
   */

  function defaultPartState(def) {
    const state = {};
    (def.parts || []).forEach((part) => {
      state[part.id] = {
        rotation: 0,
        offsetX: 0,
        offsetY: 0,
        visible: true
      };
    });
    return state;
  }

  function applyPoseToState(def, poseId, baseState) {
    const pose = (def.poses && def.poses[poseId]) || null;
    const next = Object.assign({}, defaultPartState(def), baseState || {});
    if (!pose || !pose.parts) return next;
    Object.keys(pose.parts).forEach((partId) => {
      if (!next[partId]) next[partId] = { rotation: 0, offsetX: 0, offsetY: 0, visible: true };
      const p = pose.parts[partId];
      if (p.rotation != null) next[partId].rotation = p.rotation;
      if (p.offsetX != null) next[partId].offsetX = p.offsetX;
      if (p.offsetY != null) next[partId].offsetY = p.offsetY;
      if (p.visible != null) next[partId].visible = !!p.visible;
    });
    return next;
  }

  /** Resolve world transform for each part (parent chain). */
  function resolvePartTransforms(def, partState) {
    const byId = new Map((def.parts || []).map((p) => [p.id, p]));
    const state = Object.assign({}, defaultPartState(def), partState || {});
    const cache = new Map();

    function resolve(id) {
      if (cache.has(id)) return cache.get(id);
      const part = byId.get(id);
      if (!part) return null;
      const local = state[id] || { rotation: 0, offsetX: 0, offsetY: 0, visible: true };
      const pivot = part.pivot || [0, 0];
      const origin = part.origin || [0, 0];
      const size = part.size || [40, 40];

      // Parent space originates at the parent's pivot (not its outgoing joint).
      // Using joint + (attach-pivot) previously double-counted and detached limbs.
      let parentWorld = { x: 0, y: 0, rotation: 0 };
      if (part.parent) {
        const parent = resolve(part.parent);
        if (parent) parentWorld = { x: parent.pivotX, y: parent.pivotY, rotation: parent.worldRotation };
      }

      const attach = part.attach || pivot;
      const worldRotation = parentWorld.rotation + (local.rotation || 0);
      let px;
      let py;
      if (part.parent) {
        const parentPart = byId.get(part.parent);
        const parentAttach = part.parentAttach
          || (parentPart && parentPart.joints && parentPart.joints[part.id])
          || attach;
        // parentAttach is in parent-local art coordinates; offset from parent pivot
        const parentPivot = parentPart.pivot || [0, 0];
        const lx = (parentAttach[0] - parentPivot[0]) + (local.offsetX || 0);
        const ly = (parentAttach[1] - parentPivot[1]) + (local.offsetY || 0);
        const rad = (parentWorld.rotation * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        px = parentWorld.x + lx * cos - ly * sin;
        py = parentWorld.y + lx * sin + ly * cos;
      } else {
        px = pivot[0] + (local.offsetX || 0);
        py = pivot[1] + (local.offsetY || 0);
      }

      // Drawing: translate to pivot, rotate, draw art with origin relative to pivot
      const artOffsetX = origin[0] - pivot[0];
      const artOffsetY = origin[1] - pivot[1];

      // Outgoing joint for children defaults to bottom-center of part unless joints map set
      const jointLocal = part.joint || [
        pivot[0],
        pivot[1]
      ];
      const jlx = jointLocal[0] - pivot[0];
      const jly = jointLocal[1] - pivot[1];
      const wr = (worldRotation * Math.PI) / 180;
      const jointX = px + jlx * Math.cos(wr) - jly * Math.sin(wr);
      const jointY = py + jlx * Math.sin(wr) + jly * Math.cos(wr);

      const result = {
        id,
        part,
        pivotX: px,
        pivotY: py,
        worldRotation,
        artOffsetX,
        artOffsetY,
        width: size[0],
        height: size[1],
        jointX,
        jointY,
        z: part.z != null ? part.z : 0,
        src: part.src,
        visible: local.visible !== false
      };
      cache.set(id, result);
      return result;
    }

    (def.parts || []).forEach((p) => resolve(p.id));
    return Array.from(cache.values()).sort((a, b) => a.z - b.z);
  }

  /**
   * Shared SVG renderer for editor preview, public reader, and export.
   * Editor chrome (handles, guides) is never drawn here — pass options.mode = 'editor' | 'reader' | 'export'.
   * Character posing uses preloaded defs in options.characterDefs (keyed by characterId or rigSrc).
   */

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const XLINK_NS = 'http://www.w3.org/1999/xlink';

  function el(name, attrs = {}, children = []) {
    const node = document.createElementNS(SVG_NS, name);
    Object.keys(attrs).forEach((key) => {
      const value = attrs[key];
      if (value == null || value === false) return;
      if (key === 'href') {
        // SVG2 href + legacy xlink for nested artwork references
        node.setAttribute('href', value);
        node.setAttributeNS(XLINK_NS, 'xlink:href', value);
      } else {
        node.setAttribute(key, String(value));
      }
    });
    children.forEach((child) => {
      if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else if (child) node.appendChild(child);
    });
    return node;
  }

  function escUrl(path) {
    // Keep path readable; encode only necessary segments for spaces.
    return path.split('/').map((part) => encodeURIComponent(part).replace(/%2F/gi, '/')).join('/').replace(/%3A/gi, ':');
  }

  function assetUrl(src, basePath) {
    if (!src) return '';
    if (/^https?:\/\//i.test(src) || src.startsWith('data:')) return src;
    const cleaned = src.replace(/^\.\//, '');
    if (basePath) {
      const base = basePath.endsWith('/') ? basePath : `${basePath}/`;
      return `${base}${escUrl(cleaned)}`;
    }
    return `/${escUrl(cleaned)}`;
  }

  function layerTransform(layer) {
    const cx = layer.x + layer.width / 2;
    const cy = layer.y + layer.height / 2;
    const sx = layer.flipX ? -1 : 1;
    const sy = layer.flipY ? -1 : 1;
    const rot = layer.rotation || 0;
    return `translate(${cx} ${cy}) rotate(${rot}) scale(${sx} ${sy}) translate(${-layer.width / 2} ${-layer.height / 2})`;
  }

  function ensureFilter(defs, id, builder) {
    if (defs.querySelector(`[id="${id}"]`)) return id;
    const filter = el('filter', { id, x: '-50%', y: '-50%', width: '200%', height: '200%' });
    builder(filter);
    defs.appendChild(filter);
    return id;
  }

  function applyEffects(defs, layer, instancePrefix) {
    const fx = layer.effects || {};
    const filterParts = [];
    const style = {};
    let filterId = null;

    if (fx.dropShadow && fx.dropShadow.enabled) {
      filterId = `${instancePrefix}_ds`;
      ensureFilter(defs, filterId, (filter) => {
        filter.appendChild(el('feDropShadow', {
          dx: fx.dropShadow.offsetX || 0,
          dy: fx.dropShadow.offsetY || 0,
          'flood-color': fx.dropShadow.colour || '#000',
          'flood-opacity': fx.dropShadow.opacity != null ? fx.dropShadow.opacity : 0.45,
          'stdDeviation': (fx.dropShadow.blur || 0) / 2
        }));
      });
      filterParts.push(`url(#${filterId})`);
    }

    if (fx.blur && fx.blur.enabled && fx.blur.radius > 0) {
      const bid = `${instancePrefix}_blur`;
      ensureFilter(defs, bid, (filter) => {
        filter.appendChild(el('feGaussianBlur', { stdDeviation: fx.blur.radius }));
      });
      filterParts.push(`url(#${bid})`);
    }

    if (fx.glow && fx.glow.enabled) {
      const gid = `${instancePrefix}_glow`;
      ensureFilter(defs, gid, (filter) => {
        filter.appendChild(el('feDropShadow', {
          dx: 0,
          dy: 0,
          'flood-color': fx.glow.colour || '#ffe08a',
          'flood-opacity': fx.glow.opacity != null ? fx.glow.opacity : 0.7,
          'stdDeviation': (fx.glow.blur || 12) / 2
        }));
      });
      filterParts.push(`url(#${gid})`);
    }

    if (fx.blendMode && fx.blendMode !== 'normal') {
      style.mixBlendMode = fx.blendMode;
    }

    return {
      filter: filterParts.length ? filterParts.join(' ') : null,
      style,
      tint: fx.tint && fx.tint.enabled ? fx.tint : null,
      outline: fx.outline && fx.outline.enabled ? fx.outline : null,
      pulseGlow: fx.pulseGlow && fx.pulseGlow.enabled ? fx.pulseGlow : null,
      overlay: fx.overlay && fx.overlay.enabled ? fx.overlay : null
    };
  }

  function renderMissing(layer) {
    const g = el('g', { class: 'kce-missing', 'data-layer-id': layer.id });
    g.appendChild(el('rect', {
      x: 0, y: 0, width: layer.width, height: layer.height,
      fill: '#f8d7da', stroke: '#a33', 'stroke-width': 2, 'stroke-dasharray': '6 4'
    }));
    const text = el('text', {
      x: layer.width / 2,
      y: layer.height / 2,
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      fill: '#842029',
      'font-size': Math.max(12, Math.min(18, layer.width / 12)),
      'font-family': 'Source Sans 3, sans-serif'
    }, ['Missing asset']);
    g.appendChild(text);
    return g;
  }

  function measureTextWidth(text, font) {
    const size = font.size || 14;
    const family = font.family || 'sans-serif';
    const weight = font.weight || '400';
    const style = font.style && font.style !== 'normal' ? `${font.style} ` : '';
    const sample = String(text || '');
    // Before @font-face is ready, canvas metrics use a thin fallback and under-wrap.
    const fontCss = `${style}${weight} ${size}px ${family}`;
    if (typeof document !== 'undefined' && document.fonts && document.fonts.check
        && !document.fonts.check(fontCss)) {
      return sample.length * size * 0.62;
    }
    if (typeof document === 'undefined') {
      return sample.length * size * 0.62;
    }
    if (!measureTextWidth._ctx) {
      const canvas = document.createElement('canvas');
      measureTextWidth._ctx = canvas.getContext('2d');
    }
    const ctx = measureTextWidth._ctx;
    ctx.font = fontCss;
    return ctx.measureText(sample).width;
  }

  function wrapTextLines(text, maxWidth, font) {
    const measure = (s) => measureTextWidth(s, font || {});
    const limit = Math.max(8, maxWidth || 0);
    const lines = [];
    String(text || '').split('\n').forEach((para) => {
      if (!para) {
        lines.push('');
        return;
      }
      const words = para.split(/\s+/).filter(Boolean);
      let current = '';
      words.forEach((word) => {
        const trial = current ? `${current} ${word}` : word;
        if (current && measure(trial) > limit) {
          lines.push(current);
          current = word;
        } else {
          current = trial;
        }
      });
      if (current) lines.push(current);
    });
    return lines.length ? lines : [''];
  }

  function renderBubble(layer, effectInfo, options) {
    const g = el('g', { class: `kce-bubble kce-role-${layer.role || 'speech'}` });
    const pad = layer.padding != null ? layer.padding : 14;
    const role = layer.role || 'speech';
    const shape = layer.shape || (role === 'thought' ? 'ellipse' : 'rounded');
    const hasShapeSrc = !!(layer.shapeSrc || (layer.src && layer.shape === 'path'));

    if (!hasShapeSrc && layer.tail && layer.tail.enabled && (role === 'speech' || role === 'thought')) {
      const tipX = layer.tail.x != null ? layer.tail.x : layer.width * 0.3;
      const tipY = layer.tail.y != null ? layer.tail.y : layer.height + 24;
      const baseY = layer.height * ((shape === 'ellipse' || role === 'thought') ? 0.78 : 0.96);
      const midX = Math.min(Math.max(tipX, 16), layer.width - 16);
      const half = (shape === 'ellipse' || role === 'thought') ? 8 : 12;
      g.appendChild(el('polygon', {
        points: `${midX - half},${baseY} ${tipX},${tipY} ${midX + half},${baseY}`,
        fill: layer.fill || '#fff',
        stroke: layer.stroke || '#111',
        'stroke-width': layer.strokeWidth != null ? layer.strokeWidth : 2
      }));
    }

    const strokeWidth = layer.strokeWidth != null ? layer.strokeWidth : 2;
    const fill = layer.fill != null ? layer.fill : '#fff';
    const stroke = layer.stroke != null ? layer.stroke : '#111';
    // Per-bubble Affinity/path art travels with the layer (shapeSrc).
    if (hasShapeSrc) {
      const href = assetUrl(layer.shapeSrc || layer.src, options.assetBase);
      g.appendChild(el('image', {
        href,
        x: 0,
        y: 0,
        width: layer.width,
        height: layer.height,
        preserveAspectRatio: 'none',
        class: 'kce-bubble-shape'
      }));
    } else {
      // shape "none" / "text": lettering only
      const drawBody = shape !== 'none' && shape !== 'text';
      if (drawBody) {
        if (shape === 'ellipse' || role === 'thought') {
          g.appendChild(el('ellipse', {
            cx: layer.width / 2,
            cy: layer.height / 2,
            rx: layer.width / 2,
            ry: layer.height / 2,
            fill,
            stroke,
            'stroke-width': strokeWidth
          }));
        } else {
          g.appendChild(el('rect', {
            x: 0,
            y: 0,
            width: layer.width,
            height: layer.height,
            fill,
            stroke,
            'stroke-width': strokeWidth,
            rx: layer.cornerRadius != null ? layer.cornerRadius : (role === 'caption' ? 4 : 18),
            ry: layer.cornerRadius != null ? layer.cornerRadius : (role === 'caption' ? 4 : 18)
          }));
        }
      }
    }

    const fontSize = layer.fontSize || 18;
    const lineHeight = (layer.lineHeight || 1.25) * fontSize;
    const fontFamily = layer.fontFamily || 'Source Sans 3, Noto Sans, sans-serif';
    const fontWeight = layer.fontWeight || '600';
    const fontStyle = layer.fontStyle || 'normal';
    const ovalText = shape === 'ellipse' || shape === 'none' || shape === 'text' || shape === 'path' || role === 'thought' || hasShapeSrc;
    const textWidthScale = ovalText ? 0.78 : 1;
    const usableWidth = Math.max(24, (layer.width - pad * 2) * textWidthScale);
    let lines;
    if (layer.textWrap === false) {
      lines = String(layer.text || '').split('\n');
      if (!lines.length) lines = [''];
    } else {
      lines = wrapTextLines(layer.text, usableWidth, {
        size: fontSize,
        family: fontFamily,
        weight: fontWeight,
        style: fontStyle
      });
    }
    const align = layer.textAlign || 'center';
    const defaultX = align === 'left' ? pad : (align === 'right' ? layer.width - pad : layer.width / 2);
    const textX = layer.textX != null ? layer.textX : defaultX;
    // textY is baseline of first line when set (Affinity lettering); else padding + fontSize.
    const textY = layer.textY != null ? layer.textY : (pad + fontSize);
    const textEl = el('text', {
      x: textX,
      y: textY,
      'text-anchor': align === 'left' ? 'start' : (align === 'right' ? 'end' : 'middle'),
      fill: layer.colour || '#111',
      'font-size': fontSize,
      'font-family': fontFamily,
      'font-weight': fontWeight,
      'font-style': fontStyle
    });

    lines.forEach((line, i) => {
      textEl.appendChild(el('tspan', {
        x: textX,
        dy: i === 0 ? 0 : lineHeight
      }, [line]));
    });
    g.appendChild(textEl);

    if (layer.translation) {
      g.appendChild(el('text', {
        x: layer.width / 2,
        y: layer.height - pad / 2,
        'text-anchor': 'middle',
        fill: '#555',
        'font-size': Math.max(10, fontSize * 0.7),
        'font-family': layer.fontFamily || 'Source Sans 3, sans-serif',
        'font-style': 'italic'
      }, [layer.translation]));
    }

    if (options.mode === 'editor' && layer.overflowWarn) {
      g.appendChild(el('rect', {
        x: 0, y: 0, width: layer.width, height: layer.height,
        fill: 'none', stroke: '#c45c26', 'stroke-width': 2, 'stroke-dasharray': '4 3', class: 'kce-overflow'
      }));
    }

    if (effectInfo.filter) g.setAttribute('filter', effectInfo.filter);
    Object.assign(g.style, effectInfo.style || {});
    return g;
  }

  function renderImageLayer(layer, effectInfo, options, missingIds) {
    const g = el('g', { class: 'kce-image-layer' });
    if (!layer.src) {
      g.appendChild(renderMissing(layer));
      return g;
    }
    if (missingIds && missingIds.has(layer.assetId || layer.src)) {
      g.appendChild(renderMissing(layer));
      return g;
    }

    const href = assetUrl(layer.src, options.assetBase);
    const image = el('image', {
      href,
      x: 0,
      y: 0,
      width: layer.width,
      height: layer.height,
      preserveAspectRatio: layer.preserveAspectRatio === false ? 'none' : 'xMidYMid meet'
    });
    image.addEventListener('error', () => {
      g.innerHTML = '';
      g.appendChild(renderMissing(layer));
    });
    g.appendChild(image);

    if (effectInfo.outline) {
      g.appendChild(el('rect', {
        x: 0, y: 0, width: layer.width, height: layer.height,
        fill: 'none',
        stroke: effectInfo.outline.colour || '#000',
        'stroke-width': effectInfo.outline.width || 2
      }));
    }

    if (effectInfo.tint) {
      g.appendChild(el('rect', {
        x: 0, y: 0, width: layer.width, height: layer.height,
        fill: effectInfo.tint.colour || '#4a7c59',
        opacity: effectInfo.tint.opacity != null ? effectInfo.tint.opacity : 0.25,
        style: 'pointer-events:none'
      }));
    }

    if (effectInfo.overlay) {
      const ov = effectInfo.overlay;
      if (ov.kind === 'image' && ov.src) {
        g.appendChild(el('image', {
          href: assetUrl(ov.src, options.assetBase),
          x: 0, y: 0, width: layer.width, height: layer.height,
          opacity: ov.opacity != null ? ov.opacity : 0.35,
          preserveAspectRatio: 'xMidYMid slice'
        }));
      } else {
        g.appendChild(el('rect', {
          x: 0, y: 0, width: layer.width, height: layer.height,
          fill: ov.colour || '#000',
          opacity: ov.opacity != null ? ov.opacity : 0.2,
          style: 'pointer-events:none'
        }));
      }
    }

    if (effectInfo.filter) g.setAttribute('filter', effectInfo.filter);
    Object.assign(g.style, effectInfo.style || {});

    if (effectInfo.pulseGlow && options.mode !== 'export') {
      g.classList.add('kce-pulse-glow');
      g.style.setProperty('--kce-pulse-colour', effectInfo.pulseGlow.colour || '#7ec8e3');
      g.style.setProperty('--kce-pulse-min', String(effectInfo.pulseGlow.minOpacity != null ? effectInfo.pulseGlow.minOpacity : 0.25));
      g.style.setProperty('--kce-pulse-max', String(effectInfo.pulseGlow.maxOpacity != null ? effectInfo.pulseGlow.maxOpacity : 0.85));
      g.style.setProperty('--kce-pulse-ms', `${effectInfo.pulseGlow.durationMs || 1800}ms`);
      // Still fallback ring for reduced motion / first paint
      g.appendChild(el('rect', {
        x: -4, y: -4, width: layer.width + 8, height: layer.height + 8,
        fill: 'none',
        stroke: effectInfo.pulseGlow.colour || '#7ec8e3',
        'stroke-width': 3,
        opacity: effectInfo.pulseGlow.minOpacity != null ? effectInfo.pulseGlow.minOpacity : 0.35,
        class: 'kce-pulse-still',
        rx: 6
      }));
    }

    return g;
  }

  function renderShapeLayer(layer, effectInfo) {
    const g = el('g', { class: 'kce-shape-layer' });
    if (layer.shape === 'ellipse') {
      g.appendChild(el('ellipse', {
        cx: layer.width / 2,
        cy: layer.height / 2,
        rx: layer.width / 2,
        ry: layer.height / 2,
        fill: layer.fill || '#ccc',
        stroke: layer.stroke || '#333',
        'stroke-width': layer.strokeWidth != null ? layer.strokeWidth : 1
      }));
    } else {
      g.appendChild(el('rect', {
        x: 0, y: 0, width: layer.width, height: layer.height,
        fill: layer.fill || '#ccc',
        stroke: layer.stroke || '#333',
        'stroke-width': layer.strokeWidth != null ? layer.strokeWidth : 1,
        rx: layer.cornerRadius || 0
      }));
    }
    if (effectInfo.filter) g.setAttribute('filter', effectInfo.filter);
    Object.assign(g.style, effectInfo.style || {});
    return g;
  }

  function resolveCharacterDef(layer, options) {
    const defs = options.characterDefs || {};
    return defs[layer.characterId] || defs[layer.rigSrc] || null;
  }

  function rigBasePath(rigSrc) {
    if (!rigSrc) return '';
    const parts = rigSrc.replace(/\\/g, '/').split('/');
    parts.pop();
    return parts.join('/');
  }

  function applyGroupedSvgPose(svgRoot, def, posed) {
    (def.parts || []).forEach((part) => {
      if (!part.groupId) return;
      const node = svgRoot.querySelector(`#${cssEscape(part.groupId)}`);
      if (!node) return;
      let local = posed[part.id] || { rotation: 0 };
      // Paint-only companions (e.g. under-sleeve fill) share another part's rotation.
      if (part.syncRotationFrom) {
        local = posed[part.syncRotationFrom] || local;
      }
      const pivot = part.pivot || [0, 0];
      const rot = local.rotation || 0;
      // Nested groups already encode FK hierarchy; only local rotate about the hinge.
      node.setAttribute('transform', `rotate(${rot} ${pivot[0]} ${pivot[1]})`);
    });
  }

  function cssEscape(id) {
    if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(id);
    return String(id).replace(/([^a-zA-Z0-9_-])/g, '\\$1');
  }

  function renderGroupedSvgCharacter(layer, def, effectInfo, options) {
    const g = el('g', { class: 'kce-character-layer kce-grouped-svg', 'data-character-id': layer.characterId || '' });
    const vb = def.viewBox || [0, 0, 1080, 1080];
    const vbW = vb[2] || 1080;
    const vbH = vb[3] || 1080;
    const uni = Math.min(layer.width / vbW, layer.height / vbH);
    const ox = (layer.width - vbW * uni) / 2;
    const oy = (layer.height - vbH * uni) / 2;
    const root = el('g', {
      class: 'kce-character-rig',
      transform: `translate(${ox} ${oy}) scale(${uni})`
    });

    const poseId = layer.poseId || 'neutral';
    const posed = applyPoseToState(def, poseId, layer.partState || {});
    const cache = options.svgCache || {};
    const markup = cache[def.svgSrc] || cache[def.id] || def.svgMarkup;
    if (!markup) {
      // Fallback: show prepared SVG as a flat image (pose not applied until markup loads).
      const href = assetUrl(def.svgSrc, options.assetBase);
      root.appendChild(el('image', {
        href,
        x: 0,
        y: 0,
        width: vbW,
        height: vbH,
        preserveAspectRatio: 'xMidYMid meet',
        class: 'kce-grouped-svg-fallback'
      }));
    } else {
      const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
      const srcSvg = doc.documentElement;
      if (!srcSvg || srcSvg.nodeName.toLowerCase() === 'parsererror') {
        g.appendChild(renderMissing(Object.assign({}, layer, { name: 'Invalid grouped SVG' })));
        return g;
      }
      applyGroupedSvgPose(srcSvg, def, posed);
      const kids = Array.from(srcSvg.childNodes);
      kids.forEach((child) => {
        if (child.nodeType !== 1) return;
        root.appendChild(document.importNode(child, true));
      });
    }

    g.appendChild(root);
    if (effectInfo.filter) g.setAttribute('filter', effectInfo.filter);
    Object.assign(g.style, effectInfo.style || {});
    return g;
  }

  function renderCharacterLayer(layer, effectInfo, options) {
    const g = el('g', { class: 'kce-character-layer', 'data-character-id': layer.characterId || '' });
    const def = resolveCharacterDef(layer, options);
    if (!def) {
      g.appendChild(renderMissing(Object.assign({}, layer, { name: 'Missing character rig' })));
      return g;
    }

    if (def.kind === 'groupedSvg') {
      return renderGroupedSvgCharacter(layer, def, effectInfo, options);
    }

    const vb = def.viewBox || [0, 0, 200, 360];
    const vbW = vb[2] || 200;
    const vbH = vb[3] || 360;
    // Uniform scale keeps joint chains attached when the layer box is non-uniform.
    const uni = Math.min(layer.width / vbW, layer.height / vbH);
    const ox = (layer.width - vbW * uni) / 2;
    const oy = (layer.height - vbH * uni) / 2;
    const root = el('g', {
      class: 'kce-character-rig',
      transform: `translate(${ox} ${oy}) scale(${uni})`
    });

    const posed = applyPoseToState(def, layer.poseId || 'standing', layer.partState || {});
    const parts = resolvePartTransforms(def, posed);
    const base = rigBasePath(layer.rigSrc);
    const expr = (def.expressions && def.expressions[layer.expressionId || 'neutral']) || null;
    const faceHref = expr && expr.face
      ? assetUrl(base ? `${base}/${expr.face}` : expr.face, options.assetBase)
      : null;

    parts.forEach((resolved) => {
      if (resolved.visible === false) return;
      const flip = resolved.part.flipX ? -1 : 1;
      // Flip about the part pivot so mirrored limbs stay hinged at the joint.
      const partG = el('g', {
        class: 'kce-char-part',
        'data-part-id': resolved.id,
        transform: `translate(${resolved.pivotX} ${resolved.pivotY}) rotate(${resolved.worldRotation}) scale(${flip} 1) translate(${resolved.artOffsetX} ${resolved.artOffsetY})`
      });
      const href = assetUrl(base ? `${base}/${resolved.src}` : resolved.src, options.assetBase);
      partG.appendChild(el('image', {
        href,
        x: 0,
        y: 0,
        width: resolved.width,
        height: resolved.height,
        preserveAspectRatio: 'none'
      }));
      if (resolved.part.faceSlot && faceHref) {
        partG.appendChild(el('image', {
          href: faceHref,
          x: 0,
          y: 0,
          width: resolved.width,
          height: resolved.height,
          preserveAspectRatio: 'none',
          class: 'kce-char-face'
        }));
      }
      root.appendChild(partG);
    });

    g.appendChild(root);
    if (effectInfo.filter) g.setAttribute('filter', effectInfo.filter);
    Object.assign(g.style, effectInfo.style || {});
    return g;
  }

  function renderLayer(defs, layer, options, missingIds) {
    // Hidden layers are omitted from reader/export; editor may pass showHidden
    if (layer.visible === false && options.mode !== 'editor') return null;
    if (layer.visible === false && !options.showHidden) {
      // Still skip drawing hidden content in editor canvas (managed via layer list)
      return null;
    }
    const instancePrefix = `fx_${layer.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const effectInfo = applyEffects(defs, layer, instancePrefix);
    const wrapper = el('g', {
      class: 'kce-layer',
      'data-layer-id': layer.id,
      'data-layer-type': layer.type,
      transform: layerTransform(layer),
      opacity: layer.opacity != null ? layer.opacity : 1
    });

    let content;
    if (layer.type === 'image') content = renderImageLayer(layer, effectInfo, options, missingIds);
    else if (layer.type === 'shape') content = renderShapeLayer(layer, effectInfo);
    else if (layer.type === 'character') content = renderCharacterLayer(layer, effectInfo, options);
    else if (layer.type === 'bubble' || layer.type === 'text') content = renderBubble(layer, effectInfo, options);
    else content = renderMissing(layer);

    wrapper.appendChild(content);
    return wrapper;
  }

  function renderPanelOverlay(panel) {
    if (!panel.overlay || !panel.overlay.enabled) return null;
    const ov = panel.overlay;
    return el('rect', {
      x: 0,
      y: 0,
      width: panel.width,
      height: panel.height,
      fill: ov.colour || '#1a1a2e',
      opacity: ov.opacity != null ? ov.opacity : 0.25,
      class: 'kce-panel-overlay',
      style: 'pointer-events:none'
    });
  }

  function renderPanel(defs, panel, options, missingIds) {
    const g = el('g', {
      class: 'kce-panel',
      'data-panel-id': panel.id,
      transform: `translate(${panel.x} ${panel.y})`
    });

    const clipId = `clip_${panel.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    if (panel.clip !== false && !panel.allowBleed) {
      const clip = el('clipPath', { id: clipId });
      clip.appendChild(el('rect', {
        x: 0, y: 0, width: panel.width, height: panel.height,
        rx: panel.cornerRadius || 0, ry: panel.cornerRadius || 0
      }));
      defs.appendChild(clip);
    }

    g.appendChild(el('rect', {
      class: 'kce-panel-bg',
      x: 0, y: 0, width: panel.width, height: panel.height,
      fill: panel.background || '#fff',
      rx: panel.cornerRadius || 0, ry: panel.cornerRadius || 0
    }));

    const content = el('g', { class: 'kce-panel-content' });
    if (panel.clip !== false && !panel.allowBleed) {
      content.setAttribute('clip-path', `url(#${clipId})`);
    }

    // Scene layers first (non-bubble), then panel overlay, then bubbles/text on top for legibility
    const scene = [];
    const textLayers = [];
    (panel.layers || []).forEach((layer) => {
      if (layer.type === 'bubble' || layer.type === 'text') textLayers.push(layer);
      else scene.push(layer);
    });

    scene.forEach((layer) => {
      const node = renderLayer(defs, layer, options, missingIds);
      if (node) content.appendChild(node);
    });

    const overlay = renderPanelOverlay(panel);
    if (overlay) content.appendChild(overlay);

    textLayers.forEach((layer) => {
      const node = renderLayer(defs, layer, options, missingIds);
      if (node) content.appendChild(node);
    });

    g.appendChild(content);

    const border = panel.border || { width: 0, colour: '#000' };
    if (border.width > 0) {
      g.appendChild(el('rect', {
        class: 'kce-panel-border',
        x: 0, y: 0, width: panel.width, height: panel.height,
        fill: 'none',
        stroke: border.colour || '#000',
        'stroke-width': border.width,
        rx: panel.cornerRadius || 0, ry: panel.cornerRadius || 0,
        style: 'pointer-events:none'
      }));
    }

    return g;
  }

  /**
   * Render composition into an SVG element (creates or reuses root).
   * @returns {SVGSVGElement}
   */
  function renderComposition(composition, mount, options = {}) {
    const opts = Object.assign({ mode: 'reader', assetBase: '', missingAssetIds: null }, options);
    const page = composition.page;
    const svg = el('svg', {
      class: `kce-page kce-mode-${opts.mode}`,
      viewBox: `0 0 ${page.width} ${page.height}`,
      width: '100%',
      height: '100%',
      role: 'img',
      'aria-label': composition.title || 'Comic page',
      xmlns: SVG_NS,
      'xmlns:xlink': XLINK_NS
    });

    const defs = el('defs');
    svg.appendChild(defs);
    svg.appendChild(el('rect', {
      class: 'kce-page-bg',
      x: 0, y: 0, width: page.width, height: page.height,
      fill: page.background || '#fff'
    }));

    const missingIds = opts.missingAssetIds instanceof Set ? opts.missingAssetIds : null;
    composition.panels.forEach((panel) => {
      svg.appendChild(renderPanel(defs, panel, opts, missingIds));
    });

    if (typeof mount === 'string') {
      const node = document.querySelector(mount);
      if (!node) throw new Error(`Mount not found: ${mount}`);
      node.innerHTML = '';
      node.appendChild(svg);
    } else if (mount) {
      mount.innerHTML = '';
      mount.appendChild(svg);
    }

    return svg;
  }

  function buildTranscriptHtml(composition) {
    const list = document.createElement('ol');
    list.className = 'kce-transcript';
    const order = composition.readingOrder && composition.readingOrder.length
      ? composition.readingOrder
      : (composition.transcript || []).map((t) => t.id);
    const byId = new Map((composition.transcript || []).map((t) => [t.id, t]));
    order.forEach((id) => {
      const entry = byId.get(id);
      if (!entry) return;
      const li = document.createElement('li');
      const speaker = document.createElement('strong');
      speaker.textContent = entry.speaker || 'TEXT';
      li.appendChild(speaker);
      li.appendChild(document.createTextNode(` ${entry.text || ''}`));
      if (entry.translation) {
        const note = document.createElement('em');
        note.textContent = ` (${entry.translation})`;
        li.appendChild(note);
      }
      list.appendChild(li);
    });
    return list;
  }

  /** Wait for fonts and images inside an SVG before export. */
  async function waitForRenderReady(svg) {
    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch (e) { /* ignore */ }
    }
    const images = Array.from(svg.querySelectorAll('image'));
    await Promise.all(images.map((image) => new Promise((resolve) => {
      const href = image.getAttribute('href') || image.getAttributeNS(XLINK_NS, 'href');
      if (!href) return resolve();
      const probe = new Image();
      probe.onload = () => resolve();
      probe.onerror = () => resolve();
      probe.src = href;
    })));
    // Allow layout/paint
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }

  async function loadCharacterDefs(composition) {
    const defs = {};
    const paths = listCharacterRigPaths(composition);
    await Promise.all(paths.map(async (rigSrc) => {
      const res = await fetch(`/${rigSrc.replace(/^\//, '')}`);
      if (!res.ok) return;
      const def = await res.json();
      defs[def.id] = def;
      defs[rigSrc] = def;
    }));
    return defs;
  }

  async function boot() {
    const mount = document.getElementById('kce-mount');
    if (!mount) return;
    const transcriptHost = document.getElementById('kce-transcript');
    const url = mount.getAttribute('data-composition-url') || '/art/comics/compositions/demo-sample.json';
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Could not load ${url}`);
      const composition = parseComposition(await res.text());
      const characterDefs = await loadCharacterDefs(composition);
      mount.innerHTML = '';
      const svg = renderComposition(composition, mount, {
        mode: 'reader',
        assetBase: '',
        characterDefs
      });
      await waitForRenderReady(svg);
      if (transcriptHost) {
        transcriptHost.innerHTML = '';
        transcriptHost.appendChild(buildTranscriptHtml(composition));
      }
    } catch (error) {
      mount.innerHTML = `<p class="kce-error">Failed to render composition: ${error.message}</p>`;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  exports.buildTranscriptHtml = buildTranscriptHtml;
  exports.parseComposition = parseComposition;
  exports.renderComposition = renderComposition;
  exports.waitForRenderReady = waitForRenderReady;

  Object.defineProperty(exports, '__esModule', { value: true });

  return exports;

})({});
//# sourceMappingURL=comics-reader.js.map
