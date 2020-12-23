uniform sampler2D bumpTexture;
uniform float bumpScale;

varying float vAmount;
varying vec2 vUV;
varying vec4 worldPosition;
varying vec3 vViewPosition;
varying vec3 vNormal;

void main() 
{ 
  vUV = uv;
  vec4 bumpData = texture2D( bumpTexture, uv );
 
  vAmount = bumpData.r; // assuming map is grayscale it doesn't matter if you use r, g, or b.
  
  // move the position along the normal
  vec3 newPosition = position + normal * bumpScale * vAmount;

  worldPosition = modelMatrix * vec4( newPosition, 1.0 );

  // Normal position.
  vNormal = normalize( normalMatrix * normal );

  // View vector.
  vViewPosition = cameraPosition - worldPosition.xyz;
  
  gl_Position = projectionMatrix * modelViewMatrix * vec4( newPosition, 1.0 );
}
