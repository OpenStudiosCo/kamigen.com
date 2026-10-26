/**
 * Lightweight hierarchical cutout rig (forward kinematics).
 * Part state is local (rotation / optional local offset) so poses stay reusable.
 */

export function loadCharacterDef(json) {
  if (!json || !json.id || !Array.isArray(json.parts)) {
    throw new Error('Invalid character definition');
  }
  return json;
}

export function defaultPartState(def) {
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

export function applyPoseToState(def, poseId, baseState) {
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

export function clampPartRotation(def, partId, rotation) {
  const part = (def.parts || []).find((p) => p.id === partId);
  if (!part || !part.limits || !part.limits.rotation) return rotation;
  const [min, max] = part.limits.rotation;
  return Math.max(min, Math.min(max, rotation));
}

export function mergePartState(def, state, partId, patch) {
  const next = Object.assign({}, defaultPartState(def), state || {});
  const cur = Object.assign({ rotation: 0, offsetX: 0, offsetY: 0, visible: true }, next[partId] || {});
  if (patch.rotation != null) cur.rotation = clampPartRotation(def, partId, patch.rotation);
  if (patch.offsetX != null) cur.offsetX = patch.offsetX;
  if (patch.offsetY != null) cur.offsetY = patch.offsetY;
  if (patch.visible != null) cur.visible = !!patch.visible;
  next[partId] = cur;
  return next;
}

/** Resolve world transform for each part (parent chain). */
export function resolvePartTransforms(def, partState) {
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

export function extractPose(def, partState, name) {
  const parts = {};
  const state = Object.assign({}, defaultPartState(def), partState || {});
  Object.keys(state).forEach((id) => {
    const s = state[id];
    if (!s) return;
    if (s.rotation || s.offsetX || s.offsetY) {
      parts[id] = {
        rotation: s.rotation || 0,
        offsetX: s.offsetX || 0,
        offsetY: s.offsetY || 0
      };
    }
  });
  return { name: name || 'custom', parts };
}

export function characterCompatPose(def, pose) {
  if (!pose || !pose.parts) return false;
  const ids = new Set((def.parts || []).map((p) => p.id));
  return Object.keys(pose.parts).every((id) => ids.has(id));
}
