uniform float landSize;
uniform float time;
uniform sampler2D sandyTexture;
uniform sampler2D forestTexture;
uniform sampler2D rockyTexture;
uniform sampler2D texture;
uniform vec3 sunPosition;
uniform vec3 center;

varying vec2 vUV;
varying float vAmount;
varying vec4 worldPosition;
varying vec3 vViewPosition;
varying vec3 vNormal;

// Shade island based on sun direction.
float sunshadeIsland() {
  float radius = landSize / 4.;

  // Distance between this point and sun.
  float a = distance(worldPosition.xyz, sunPosition);

  // Distance between the center and sun.
  float b = distance(center, sunPosition);
  
  // Default shade
  float c = 0.0;

  // Sun max height
  float maxSun = 150000.;
  float brightness = (sunPosition.y / maxSun);

  if (sunPosition.y > 0.) {
    if (a < b) {
      brightness *= 0.5;
    }
    else {
      brightness *= 0.3;
    }
  }
  else {
    brightness *= 0.05;
  } 
    
  return brightness;
}

float snoise ( vec3 coord, float scale, float time_factor ) {
    vec3 scaledCoord = coord * scale - (vNormal / time_factor + vec3(0.0, 0.0, -time / time_factor));

    vec2 uvTimeShift = vec2((scaledCoord.x + scaledCoord.z) / 2.0, scaledCoord.y) + vec2( -0.7, 1.5 ) * time / time_factor * 0.015;
    vec4 noiseGeneratorTimeShift = texture2D( forestTexture, uvTimeShift ) * 50.;
    vec2 uvNoiseTimeShift = vec2(scaledCoord.x, scaledCoord.y) + 0.5 * vec2( noiseGeneratorTimeShift.r, noiseGeneratorTimeShift.b );
    vec4 baseColor = texture2D( forestTexture, uvNoiseTimeShift * vec2(4.0, 4.0) );

    return baseColor.b;
}

float heightMap( vec3 coord ) {
    float n = abs(snoise(coord , 1.0 , 18.0));
    n -= 0.75 * abs(snoise(coord , 4.0 , 25.0));
    n += 0.125 * abs(snoise(coord , 14.0 , 35.0));

    n *= 0.7;

    return n;
}

// normal
vec3 getNormalLightWeight() {
  const float e = .01;

  float n  = heightMap(worldPosition.xyz);

  float nx = heightMap( worldPosition.xyz + vec3( e, 0.0, 0.0 ) );
  float ny = heightMap( worldPosition.xyz + vec3( 0.0, e, 0.0 ) );
  float nz = heightMap( worldPosition.xyz + vec3( 0.0, 0.0, e ) );

  vec3 normal = normalize( vNormal + .5 * vec3( n - nx, n - ny, n - nz ) / e );

  // diffuse light

  vec3 vLightWeighting = vec3( 0.005 );

  vec4 lDirection = viewMatrix * vec4( normalize( vec3( 1.0, 0.0, 0.5 ) ), 0.0 );
  float directionalLightWeighting = dot( normal, normalize( lDirection.xyz ) ) * 0.15 + 0.85;
  vLightWeighting += vec3( 1.0 ) * directionalLightWeighting;

  // specular light

  vec3 dirHalfVector = normalize( lDirection.xyz + normalize( vViewPosition ) );

  float dirDotNormalHalf = dot( normal, dirHalfVector );

  float dirSpecularWeight = 0.0;
  if ( dirDotNormalHalf >= 0.0 )
      dirSpecularWeight = ( 1.0 - n ) * pow( dirDotNormalHalf, 5.0 );

  vLightWeighting *= vec3( 1.0, 0.5, 0.0 ) * dirSpecularWeight * n * 2.0;

  return vLightWeighting;
}

void main() 
{
  if (vAmount < 0.01) {
    gl_FragColor = texture2D( sandyTexture, vUV * 50.0 );
    gl_FragColor.a = 0.0;
  }
  else {
    vec4 sandy = (smoothstep(0.01, 0.03, vAmount) - smoothstep(0.05, 0.07, vAmount)) * texture2D( sandyTexture, vUV * 50.0 );
    vec4 forest = (smoothstep(0.05, 0.07, vAmount) - smoothstep(0.40, 0.70, vAmount)) * texture2D( forestTexture, vUV * 50.0 );
    vec4 rocky = (smoothstep(0.50, 0.65, vAmount))                                   * texture2D( rockyTexture, vUV * 25.0 );
    gl_FragColor = sandy + forest + rocky;
    gl_FragColor -= (texture2D( texture, vUV ) * 0.5);

    // Alternative shading.. needs work. Look to integrate above old functions from Langenium..
    //float diffuse = max(sunPosition.x * gl_FragColor.r + sunPosition.y * gl_FragColor.g + sunPosition.z * gl_FragColor.b, 0.0);
    //gl_FragColor *= 1. + diffuse * 0.1;
    gl_FragColor += sunshadeIsland();
    gl_FragColor.a = 1.0;
  }
}
