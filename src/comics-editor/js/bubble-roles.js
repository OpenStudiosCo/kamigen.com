// Bubble role management and rendering logic

/**
 * Returns the default tail configuration based on bubble role
 */
export function defaultTail(role, width, height) {
  switch (role) {
    case 'thought':
      // Thought bubbles typically have a more rounded appearance with a smaller tail
      return { 
        type: 'rounded',
        position: 'bottom', 
        size: Math.min(width, height) * 0.15,
        offset: -Math.min(width, height) * 0.05
      };
    case 'caption':
      // Caption boxes typically have no tail or a minimal one
      return { 
        type: 'none',
        position: 'top', 
        size: 0,
        offset: 0
      };
    default: // speech bubble
      // Speech bubbles have a standard arrow tail
      return { 
        type: 'arrow',
        position: 'bottom', 
        size: Math.min(width, height) * 0.15,
        offset: Math.min(width, height) * 0.1
      };
  }
}

/**
 * Returns CSS classes for bubble styling based on role
 */
export function getBubbleClasses(role) {
  return `kce-bubble kce-role-${role || 'speech'}`;
}

/**
 * Returns the display name for a bubble role
 */
export function getRoleDisplayName(role) {
  switch (role) {
    case 'thought': return 'Thought Bubble';
    case 'caption': return 'Caption Box';
    default: return 'Speech Bubble';
  }
}