/**
  * Materials.
  * 
  * Central store for all the images used for textures and materials.
  *
  */

// Globals.
import $ from 'jQuery';
import THREE from 'THREE';

export default class Materials {
  constructor(options) {
    /** 
     * Textures
     */
    this.textures = {
      darkMetal1: this.loadTexture('./assets/darkmetal.jpg', (texture) => {
        texture.wrapS = texture.wrapT = THREE.MirroredRepeatWrapping;
        texture.repeat.set( 10., 25. );
      }),
      darkMetal2: this.loadTexture('./assets/darkmetal.jpg', (texture) => {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set( .05, .05 );
      }),
      forest: this.loadTexture('/assets/forest.jpg', ( texture ) => {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      }),
      island_heightMap: this.loadTexture('./assets/height.png'),
      island_texture: this.loadTexture('./assets/texture.png'),
      sand: this.loadTexture('/assets/sand.jpg', ( texture ) => {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      }),
      smoke: this.loadTexture('./assets/smoke.png'),
      volcano: this.loadTexture('/assets/volcano.jpg', ( texture ) => {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      })
    };
    /** 
     * Material definitions
     */
    this.island = (light) => {
      return new THREE.ShaderMaterial({
        uniforms: {
          bumpTexture:  { type: "t", value: this.textures.island_heightMap },
          bumpScale:    { type: "f", value: 24361.43 },
          landSize:     { type: "f", value: 200000 },
          time:         { type: "f", value: 0.0 },
          texture:      { type: "t", value: this.textures.island_texture },
          sandyTexture: { type: "t", value: this.textures.sand },
          forestTexture: { type: "t", value: this.textures.forest },
          rockyTexture: { type: "t", value: this.textures.volcano },
          sunPosition:  { type: "v3", value: light.position.clone() },
          center:       { type: "v3", value: { x: 0, y: 0, z: 0} }
        },
        vertexShader:   document.getElementById( 'landVertexShader'   ).textContent,
        fragmentShader: document.getElementById( 'landFragmentShader' ).textContent,
        transparent: true
      });
    };
    this.smoke = () => {
      return new THREE.SpriteMaterial( {
        alphaTest: .0543212345,
        map: this.textures.smoke,
        transparent: true
      } );
    };
  }

  loadTexture(texture_location, callback = () => {}) {
    return new THREE.TextureLoader().load( texture_location, callback);
  }
}
