/**
 * Shared SVG renderer for editor preview, public reader, and export.
 * Editor chrome (handles, guides) is never drawn here — pass options.mode = 'editor' | 'reader' | 'export'.
 * Character posing uses preloaded defs in options.characterDefs (keyed by characterId or rigSrc).
 */

import { applyPoseToState, resolvePartTransforms } from './character-rig.js';

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
  const textAttrs = {
    x: textX,
    y: textY,
    'text-anchor': align === 'left' ? 'start' : (align === 'right' ? 'end' : 'middle'),
    fill: layer.colour || '#111',
    'font-size': fontSize,
    'font-family': fontFamily,
    'font-weight': fontWeight,
    'font-style': fontStyle
  };
  if (layer.letterSpacing != null && layer.letterSpacing !== 0) {
    textAttrs['letter-spacing'] = layer.letterSpacing;
  }
  const textEl = el('text', textAttrs);

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

function parseViewBox(svgEl) {
  const raw = svgEl.getAttribute('viewBox');
  if (raw) {
    const parts = raw.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) return parts;
  }
  const w = parseFloat(svgEl.getAttribute('width')) || 0;
  const h = parseFloat(svgEl.getAttribute('height')) || 0;
  return [0, 0, w, h];
}

function resolveAgainstUrl(href, baseUrl) {
  if (!href || href.startsWith('data:') || href.startsWith('#') || /^https?:\/\//i.test(href)) return href;
  if (href.startsWith('/')) return href;
  try {
    return new URL(href, baseUrl).pathname + (new URL(href, baseUrl).search || '');
  } catch (e) {
    return href;
  }
}

/** Rewrite nested image/use hrefs so inlined SVG resolves against the asset URL, not the page. */
function rewriteNestedAssetHrefs(svgRoot, assetHref) {
  const base = assetHref.includes('://') || assetHref.startsWith('/')
    ? new URL(assetHref, typeof location !== 'undefined' ? location.origin : 'http://localhost').href
    : assetHref;
  svgRoot.querySelectorAll('image, use').forEach((node) => {
    ['href', 'xlink:href'].forEach((attr) => {
      const cur = node.getAttribute(attr) || (attr === 'xlink:href' ? node.getAttributeNS(XLINK_NS, 'href') : null);
      if (!cur || cur.startsWith('data:') || cur.startsWith('#')) return;
      const abs = resolveAgainstUrl(cur, base);
      if (abs && abs !== cur) {
        node.setAttribute('href', abs);
        node.setAttributeNS(XLINK_NS, 'xlink:href', abs);
        if (attr === 'xlink:href') node.removeAttribute(attr);
      }
    });
  });
}

/** Prefix ids/url(#…) so multiple inlined figures do not collide in one page SVG. */
function prefixSvgIds(svgRoot, prefix) {
  const idMap = new Map();
  svgRoot.querySelectorAll('[id]').forEach((node) => {
    const old = node.getAttribute('id');
    if (!old) return;
    const next = `${prefix}__${old}`;
    idMap.set(old, next);
    node.setAttribute('id', next);
  });
  if (!idMap.size) return;
  const rewrite = (value) => {
    if (!value) return value;
    return value.replace(/url\(#([^)]+)\)/g, (m, id) => (idMap.has(id) ? `url(#${idMap.get(id)})` : m));
  };
  svgRoot.querySelectorAll('*').forEach((node) => {
    Array.from(node.attributes).forEach((attr) => {
      if (!attr.value || attr.value.indexOf('url(#') === -1) return;
      const next = rewrite(attr.value);
      if (next !== attr.value) node.setAttribute(attr.name, next);
    });
  });
}

function appendInlinedSvg(g, layer, markup, assetHref) {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const srcSvg = doc.documentElement;
  if (!srcSvg || srcSvg.nodeName.toLowerCase() === 'parsererror') {
    g.appendChild(renderMissing(Object.assign({}, layer, { name: 'Invalid SVG' })));
    return;
  }
  rewriteNestedAssetHrefs(srcSvg, assetHref);
  if (layer.hiddenPartIds && layer.hiddenPartIds.length) {
    const hide = new Set(layer.hiddenPartIds);
    srcSvg.querySelectorAll('[id]').forEach((node) => {
      const id = node.getAttribute('id');
      if (id && hide.has(id)) node.setAttribute('display', 'none');
    });
  }
  prefixSvgIds(srcSvg, `inl_${String(layer.id || 'svg').replace(/[^a-zA-Z0-9_-]/g, '_')}`);
  const vb = parseViewBox(srcSvg);
  const vbW = vb[2] || layer.width || 1;
  const vbH = vb[3] || layer.height || 1;
  const meet = layer.preserveAspectRatio !== false;
  let scaleX = layer.width / vbW;
  let scaleY = layer.height / vbH;
  let ox = 0;
  let oy = 0;
  if (meet) {
    const uni = Math.min(scaleX, scaleY);
    scaleX = uni;
    scaleY = uni;
    ox = (layer.width - vbW * uni) / 2;
    oy = (layer.height - vbH * uni) / 2;
  }
  const root = el('g', {
    class: 'kce-inlined-svg-root',
    'data-asset-src': layer.src || '',
    transform: `translate(${ox - vb[0] * scaleX} ${oy - vb[1] * scaleY}) scale(${scaleX} ${scaleY})`
  });
  Array.from(srcSvg.childNodes).forEach((child) => {
    if (child.nodeType !== 1) return;
    if (child.nodeName.toLowerCase() === 'script') return;
    root.appendChild(document.importNode(child, true));
  });
  g.classList.add('kce-inlined-svg');
  g.appendChild(root);
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
  const isSvg = /\.svg(?:$|\?)/i.test(layer.src);
  const cache = options.svgCache || {};
  const markup = isSvg
    ? (cache[layer.src] || cache[href] || cache[layer.assetId] || cache[href.replace(/^\//, '')])
    : null;

  if (markup) {
    // Inline SVG so nested FilB / texture images load in the page document.
    // SVG-as-<image> blocks those nested references and leaves clothing white.
    appendInlinedSvg(g, layer, markup, href);
  } else {
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
  }

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
export function renderComposition(composition, mount, options = {}) {
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

export function buildTranscriptHtml(composition) {
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
export async function waitForRenderReady(svg) {
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
