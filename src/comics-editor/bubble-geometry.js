/**
 * Procedural speech-bubble geometry.
 *
 * Coordinate space is layer-local: body occupies [0, width] × [0, height].
 * Tail tip may sit outside that box. Text should use the body box only
 * (not the tip extent).
 *
 * Body resize policy: tipX/tipY scale with width/height; attach (0–1) and
 * baseWidth stay constant so the tip keeps its relative aim while the body
 * grows or shrinks. Curve is dimensionless and unchanged.
 */

export function defaultTail(role = 'speech', width = 220, height = 100) {
  if (role === 'caption') {
    return {
      enabled: false,
      tipX: width * 0.5,
      tipY: height + 20,
      attach: 0.125,
      baseWidth: 28,
      curve: 0.35
    };
  }
  if (role === 'thought') {
    return {
      enabled: true,
      tipX: width * 0.28,
      tipY: height + 30,
      attach: 0.12,
      baseWidth: 18,
      curve: 0.5
    };
  }
  return {
    enabled: true,
    tipX: width * 0.35,
    tipY: height + 22,
    attach: 0.125,
    baseWidth: Math.max(22, Math.min(36, width * 0.14)),
    curve: 0.28
  };
}

/** Normalize legacy tail { x, y, direction } into the editable model. */
export function normalizeTail(tail, width, height, role = 'speech') {
  const base = defaultTail(role, width, height);
  if (!tail || typeof tail !== 'object') return Object.assign({}, base);
  const tipX = tail.tipX != null ? tail.tipX : (tail.x != null ? tail.x : base.tipX);
  const tipY = tail.tipY != null ? tail.tipY : (tail.y != null ? tail.y : base.tipY);
  return {
    enabled: tail.enabled !== false && role !== 'caption',
    tipX,
    tipY,
    attach: tail.attach != null ? clamp(tail.attach, 0, 1) : base.attach,
    baseWidth: tail.baseWidth != null ? Math.max(8, tail.baseWidth) : base.baseWidth,
    curve: tail.curve != null ? clamp(tail.curve, 0, 1) : base.curve
  };
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Point + tangent on a rounded-rect perimeter.
 * attach: 0 at bottom-left of bottom edge, increasing clockwise
 * (bottom → right → top → left).
 */
export function perimeterSample(width, height, cornerRadius, attach) {
  const r = Math.max(0, Math.min(cornerRadius || 0, width / 2, height / 2));
  const straightW = Math.max(0.001, width - 2 * r);
  const straightH = Math.max(0.001, height - 2 * r);
  const arc = (Math.PI / 2) * r;
  const segs = [
    { len: straightW, kind: 'bottom' },
    { len: arc, kind: 'br' },
    { len: straightH, kind: 'right' },
    { len: arc, kind: 'tr' },
    { len: straightW, kind: 'top' },
    { len: arc, kind: 'tl' },
    { len: straightH, kind: 'left' },
    { len: arc, kind: 'bl' }
  ];
  const total = segs.reduce((s, g) => s + g.len, 0);
  let d = ((attach % 1) + 1) % 1 * total;
  for (const seg of segs) {
    if (d > seg.len) {
      d -= seg.len;
      continue;
    }
    const t = seg.len > 0 ? d / seg.len : 0;
    return sampleSeg(width, height, r, seg.kind, t);
  }
  return sampleSeg(width, height, r, 'bottom', 0);
}

function sampleSeg(w, h, r, kind, t) {
  const tau = t;
  switch (kind) {
    case 'bottom':
      return { x: r + (w - 2 * r) * tau, y: h, tx: 1, ty: 0, nx: 0, ny: 1 };
    case 'br': {
      const a = 0 + (Math.PI / 2) * tau;
      return {
        x: w - r + Math.sin(a) * r,
        y: h - r + Math.cos(a) * r,
        tx: Math.cos(a),
        ty: -Math.sin(a),
        nx: Math.sin(a),
        ny: Math.cos(a)
      };
    }
    case 'right':
      return { x: w, y: h - r - (h - 2 * r) * tau, tx: 0, ty: -1, nx: 1, ny: 0 };
    case 'tr': {
      const a = 0 + (Math.PI / 2) * tau;
      return {
        x: w - r + Math.cos(a) * r,
        y: r - Math.sin(a) * r,
        tx: -Math.sin(a),
        ty: -Math.cos(a),
        nx: Math.cos(a),
        ny: -Math.sin(a)
      };
    }
    case 'top':
      return { x: w - r - (w - 2 * r) * tau, y: 0, tx: -1, ty: 0, nx: 0, ny: -1 };
    case 'tl': {
      const a = 0 + (Math.PI / 2) * tau;
      return {
        x: r - Math.sin(a) * r,
        y: r - Math.cos(a) * r,
        tx: -Math.cos(a),
        ty: Math.sin(a),
        nx: -Math.sin(a),
        ny: -Math.cos(a)
      };
    }
    case 'left':
      return { x: 0, y: r + (h - 2 * r) * tau, tx: 0, ty: 1, nx: -1, ny: 0 };
    case 'bl': {
      const a = 0 + (Math.PI / 2) * tau;
      return {
        x: r - Math.cos(a) * r,
        y: h - r + Math.sin(a) * r,
        tx: Math.sin(a),
        ty: Math.cos(a),
        nx: -Math.cos(a),
        ny: Math.sin(a)
      };
    }
    default:
      return { x: w / 2, y: h, tx: 1, ty: 0, nx: 0, ny: 1 };
  }
}

/** Find attach (0–1) nearest to a local point. */
export function attachFromPoint(width, height, cornerRadius, x, y, samples = 96) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < samples; i++) {
    const a = i / samples;
    const p = perimeterSample(width, height, cornerRadius, a);
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

/**
 * Single continuous SVG path for a speech bubble (body + tail, one outline).
 * Returns null when the tail is disabled (caller draws a plain rounded rect).
 */
export function buildSpeechBubblePath(width, height, cornerRadius, tail) {
  const w = Math.max(8, width);
  const h = Math.max(8, height);
  const r = Math.max(0, Math.min(cornerRadius || 0, w / 2, h / 2));
  if (!tail || !tail.enabled) {
    return roundedRectPath(w, h, r);
  }

  const tipX = tail.tipX;
  const tipY = tail.tipY;
  const baseW = Math.max(8, Math.min(tail.baseWidth || 28, w * 0.55));
  const curve = clamp(tail.curve != null ? tail.curve : 0.28, 0, 1);
  const attach = clamp(tail.attach != null ? tail.attach : 0.125, 0, 1);

  const mid = perimeterSample(w, h, r, attach);
  // Offset along tangent for base endpoints
  const half = baseW / 2;
  const left = {
    x: mid.x - mid.tx * half,
    y: mid.y - mid.ty * half
  };
  const right = {
    x: mid.x + mid.tx * half,
    y: mid.y + mid.ty * half
  };

  // Control points for smooth sides (pull toward tip, then outward by curve)
  const pull = 0.35 + curve * 0.35;
  const bulge = curve * 18;
  const c1 = {
    x: left.x + (tipX - left.x) * pull + mid.tx * -bulge * 0.15 + mid.nx * bulge * 0.25,
    y: left.y + (tipY - left.y) * pull + mid.ty * -bulge * 0.15 + mid.ny * bulge * 0.25
  };
  const c2 = {
    x: right.x + (tipX - right.x) * pull + mid.tx * bulge * 0.15 + mid.nx * bulge * 0.25,
    y: right.y + (tipY - right.y) * pull + mid.ty * bulge * 0.15 + mid.ny * bulge * 0.25
  };

  // Walk the body perimeter from `right` to `left` (the long way around),
  // then curve out to the tip and back — one closed outline, no inner seam.
  const bodyArc = perimeterArcPath(w, h, r, attach, baseW);
  return `${bodyArc} Q ${c2.x.toFixed(2)} ${c2.y.toFixed(2)} ${tipX.toFixed(2)} ${tipY.toFixed(2)} Q ${c1.x.toFixed(2)} ${c1.y.toFixed(2)} ${left.x.toFixed(2)} ${left.y.toFixed(2)} Z`;
}

function roundedRectPath(w, h, r) {
  if (r <= 0.01) return `M 0 0 H ${w} V ${h} H 0 Z`;
  return [
    `M ${r} 0`,
    `H ${w - r}`,
    `A ${r} ${r} 0 0 1 ${w} ${r}`,
    `V ${h - r}`,
    `A ${r} ${r} 0 0 1 ${w - r} ${h}`,
    `H ${r}`,
    `A ${r} ${r} 0 0 1 0 ${h - r}`,
    `V ${r}`,
    `A ${r} ${r} 0 0 1 ${r} 0`,
    'Z'
  ].join(' ');
}

/**
 * Path from right base → around body → left base (open; caller closes via tip).
 */
function perimeterArcPath(w, h, r, attach, baseW) {
  const samples = 64;
  const totalLen = approxPerimeterLength(w, h, r);
  const halfFrac = (baseW / 2) / totalLen;
  const start = ((attach + halfFrac) % 1 + 1) % 1;
  const end = ((attach - halfFrac) % 1 + 1) % 1;
  // Travel clockwise from start to end the long way
  const pts = [];
  let a = start;
  const step = 1 / samples;
  // Ensure we cover nearly a full loop minus the gap
  const travel = ((end - start) % 1 + 1) % 1;
  const longTravel = travel < 0.5 ? travel + 1 : travel;
  const n = Math.max(8, Math.round(samples * longTravel));
  for (let i = 0; i <= n; i++) {
    const t = (start + (longTravel * i) / n) % 1;
    pts.push(perimeterSample(w, h, r, t));
  }
  if (!pts.length) return `M 0 ${h}`;
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i].x.toFixed(2)} ${pts[i].y.toFixed(2)}`;
  }
  return d;
}

function approxPerimeterLength(w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  return 2 * (w - 2 * rr) + 2 * (h - 2 * rr) + 2 * Math.PI * rr;
}

/** Scale tip with body when resizing; attach/baseWidth/curve unchanged. */
export function scaleTailForBodyResize(tail, prevW, prevH, nextW, nextH) {
  if (!tail) return tail;
  const sx = prevW ? nextW / prevW : 1;
  const sy = prevH ? nextH / prevH : 1;
  return Object.assign({}, tail, {
    tipX: (tail.tipX != null ? tail.tipX : nextW * 0.35) * sx,
    tipY: (tail.tipY != null ? tail.tipY : nextH + 22) * sy
  });
}

/** Handle positions in layer-local coords for editor overlay. */
export function bubbleHandlePoints(width, height, cornerRadius, tail) {
  const t = normalizeTail(tail, width, height);
  if (!t.enabled) return null;
  const mid = perimeterSample(width, height, cornerRadius, t.attach);
  const half = t.baseWidth / 2;
  return {
    tip: { x: t.tipX, y: t.tipY },
    attach: { x: mid.x, y: mid.y },
    baseLeft: { x: mid.x - mid.tx * half, y: mid.y - mid.ty * half },
    baseRight: { x: mid.x + mid.tx * half, y: mid.y + mid.ty * half },
    curve: {
      x: mid.x + (t.tipX - mid.x) * 0.45 + mid.nx * (8 + t.curve * 14),
      y: mid.y + (t.tipY - mid.y) * 0.45 + mid.ny * (8 + t.curve * 14)
    }
  };
}

/**
 * Suggest procedural geometry from an imported shape's box (not path tracing).
 * Caller shows a preview before clearing shapeSrc.
 */
export function proceduralFromImportedBox(layer) {
  const width = layer.width || 220;
  const height = layer.height || 100;
  const role = layer.role || 'speech';
  const cornerRadius = role === 'thought' ? Math.min(width, height) * 0.45 : Math.min(28, Math.min(width, height) * 0.22);
  const tail = defaultTail(role, width, height);
  // Point tip below-leftish like recovered Affinity balloons
  tail.tipX = width * 0.72;
  tail.tipY = height + Math.max(18, height * 0.28);
  tail.attach = 0.08;
  tail.baseWidth = Math.max(20, width * 0.12);
  tail.curve = 0.32;
  if (role === 'caption') tail.enabled = false;
  return {
    shape: role === 'thought' ? 'ellipse' : 'rounded',
    shapeSrc: '',
    fill: role === 'caption' ? '#111111' : '#ffffff',
    stroke: '#111111',
    strokeWidth: 2.25,
    cornerRadius,
    colour: role === 'caption' ? '#f5f5f5' : (layer.colour || '#111111'),
    tail
  };
}
