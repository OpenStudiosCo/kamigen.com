varying vec2 vUV;
void main()
{
  vec2 uv = vUV;
  uv -= 0.5;
  uv.x *= 0.8;
  float d = length(uv);
  float c = smoothstep(0.4, 0.4-0.6, d);
  c *= 0.5;
  gl_FragColor = vec4(c);
}
