// CSS for bubble role styling

export const BUBBLE_ROLE_STYLES = `
/* Bubble role-specific styles */
.kce-role-speech {
  fill: #ffffff;
  stroke: #333333;
  stroke-width: 1;
}

.kce-role-thought {
  fill: #f0f8ff;
  stroke: #4682b4;
  stroke-width: 2;
  filter: url(#bubble-glow);
}

.kce-role-caption {
  fill: #ffffff;
  stroke: #999999;
  stroke-width: 1;
  border-radius: 4px;
}

/* Bubble tail styling */
.kce-bubble .kce-tail {
  fill: inherit;
  stroke: inherit;
  stroke-width: 1;
}

/* Thought bubble specific styles */
.kce-role-thought .kce-tail {
  fill: #f0f8ff;
  stroke: #4682b4;
}

/* Caption box specific styles */
.kce-role-caption .kce-tail {
  display: none;
}

/* Bubble text styling based on role */
.kce-role-speech .kce-text {
  fill: #333333;
  font-family: 'Source Sans 3', sans-serif;
}

.kce-role-thought .kce-text {
  fill: #2f4f4f;
  font-style: italic;
  font-family: 'Georgia', serif;
}

.kce-role-caption .kce-text {
  fill: #666666;
  font-weight: bold;
  font-family: 'Arial', sans-serif;
}
`;