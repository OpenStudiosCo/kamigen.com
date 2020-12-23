/**
  * Scenograph.
  *
  * Manages scenes
  * 
  * Properties,
  * - Director, class containing scene configuration and helpers
  * - Scenes, Array, contains Director configs, Object layouts and helper functions to draw a scene.
  * -- Scripts, class within each Scene, extensible way to activate a scene - i.e. interactive/play mode or flyby demo mode.
  * 
  * Internal classes,
  * - Materials, object containing reusable THREE JS materials
  * - Objects, reusable THREE JS scene objects with helper classes like animate()
  */

// Globals.
import $ from 'jQuery';
import THREE from 'THREE';
import TWEEN from 'TWEEN';

// Game libs.
import Director from './scenograph/director.js';
import IslandScene from './scenograph/scenes/island.js';

// Game libs.
import Materials from './scenograph/materials.js';

let clock = new THREE.Clock();

export default class Scenograph {
  constructor() {
    this.Director = new Director();
    this.Materials = new Materials();
    this.Scenes = {
      IslandScene: new IslandScene(this.Materials)
    };
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      logarithmicDepthBuffer: false
    });
  }
  ready () {
    
    this.renderer.setPixelRatio( window.devicePixelRatio );
    this.renderer.setSize( window.innerWidth, window.innerHeight );

    this.container = document.getElementById( 'container' );
    
    this.container.innerHTML = "";
    this.container.appendChild( this.renderer.domElement );
    
    let IslandSceneInstance = this.Scenes.IslandScene.init();
    this.scene = IslandSceneInstance.scene;
    this.camera = IslandSceneInstance.camera;
    this.ship = IslandSceneInstance.ship;
    this.camera_controls = new THREE.OrbitControls( this.camera, window.app.scenograph.renderer.domElement );
    
    window.addEventListener( 'resize', this.onWindowResize, false );

    this.stats = new Stats();
    document.getElementById( 'stats' ).appendChild( this.stats.domElement );

    this.animate();
  }
  onWindowResize() {
    window.app.scenograph.camera.aspect = window.innerWidth / window.innerHeight;
    window.app.scenograph.camera.updateProjectionMatrix();
    window.app.scenograph.renderer.setSize( window.innerWidth, window.innerHeight );
  }
  animate() {
    TWEEN.update();
     
    requestAnimationFrame( window.app.scenograph.animate );
    window.app.scenograph.render();
  }
  render() {
    var delta = clock.getDelta(),
      time = clock.getElapsedTime() * 10;

    this.Scenes.IslandScene.animate(this.camera_controls);
  
    this.camera_controls.update( delta );
    this.camera.lookAt(this.ship.position);
    this.stats.update();

    this.renderer.render( this.scene, this.camera );
  }
}
