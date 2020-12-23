/**
  * Opening.
  * 
  * Scene Class
  *
  */

// Globals.
import $ from 'jQuery';
import THREE from 'THREE';

// Game libs.
import Aircraft from '../objects/aircraft.js';
import Island from '../objects/island.js';

let keyboard, scene, camera, stats;
let water, land, light, sky, sunSphere, ship, AircraftFactory;

let cloudId = 0;
let cloudTextures = ["./assets/cloud.png", "./assets/cloud2.png", "./assets/cloud3.png"];
let clouds = [];

let effectController  = {
  turbidity: 10,
  rayleigh: 2,
  mieCoefficient: 0.005,
  mieDirectionalG: 0.8,
  luminance: 1,
  inclination: -1.1, // elevation / inclination
  azimuth: -1.1, // Facing front,
  sun: ! true
};

let MaterialLibrary;

export default class IslandScene {
  constructor(Materials) {
    this.scripts = {
      'Demo': [],
      'Flight': []
    };
    this.parameters = {
      oceanSide: 150000,
      size: 1,
      distortionScale: 8,
      alpha: 1
    };
    MaterialLibrary = Materials;
  }

  animate(camera_controls) {
    water.material.uniforms.time.value += 1.0 / 60.0;
    land.material.uniforms.time.value += 1.0 / 60.0;
    
    if (effectController) {
      var distance = this.parameters.oceanSide;
  
      var uniforms = sky.material.uniforms;
      uniforms.turbidity.value = effectController.turbidity;
      uniforms.rayleigh.value = effectController.rayleigh;
      uniforms.luminance.value = effectController.luminance;
      uniforms.mieCoefficient.value = effectController.mieCoefficient;
      uniforms.mieDirectionalG.value = effectController.mieDirectionalG;
  
      var theta = Math.PI * ( effectController.inclination - 0.5 );
      var phi = 2 * Math.PI * ( effectController.azimuth - 0.5 );
  
      light.position.x = sunSphere.position.x = distance * Math.cos( phi );
      light.position.y = sunSphere.position.y = distance * Math.sin( phi ) * Math.sin( theta );
      light.position.z = sunSphere.position.z = distance * Math.sin( phi ) * Math.cos( theta ); 
  
      sky.material.uniforms.sunPosition.value.copy( light.position.clone() );
      land.material.uniforms.sunPosition.value.copy( light.position.clone() );
    }
  
    clouds.forEach((sprite) => {
      sprite.material.opacity = Math.min(1, Math.max(0.05,(sunSphere.position.y / this.parameters.oceanSide)));
    });

    ship.animate(keyboard, camera_controls, AircraftFactory, scene);
  }
  addCloud(position) {
    var spriteMap = new THREE.TextureLoader().load( cloudTextures[cloudId] );
    var spriteMaterial = new THREE.SpriteMaterial( { alphaTest: 0.00125, map: spriteMap, color: 0xffffff } );
    var sprite = new THREE.Sprite( spriteMaterial );
    sprite.position.set(position.x, position.y, position.z);
    var randomer = Math.random();
  
    var scaler = 1;
    if (cloudId == 2) {
      scaler = 3;
    }
    sprite.scale.set(scaler * 100000 * randomer, scaler * 75000 * randomer,1);
    clouds.push(sprite);
    
    scene.add( clouds[clouds.length - 1] );
  
    cloudId++;
    if (cloudId > 2) {
      cloudId = 0;
    }
  }
  setWater() {
    var waterGeometry = new THREE.CircleBufferGeometry( this.parameters.oceanSide * 5, 1000 );
    water = new THREE.Water(
      waterGeometry,
      {
        clipBias: -0.000001,
        textureWidth: 1024,
        textureHeight: 1024,
        waterNormals: new THREE.TextureLoader().load( './assets/waternormals.jpg', function ( texture ) {
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        }),
        alpha:  this.parameters.alpha,
        sunDirection: light.position.clone().normalize(),
        sunColor: 0x66CCFF,
        waterColor: 0x001e0f,
        distortionScale: this.parameters.distortionScale,
        fog: scene.fog != undefined,
        size: this.parameters.size
      }
    );
  
    water.rotation.x = - Math.PI / 2;
    water.receiveShadow = true;
  
    scene.add( water );
  
  }
  init() {
    keyboard  = new THREEx.KeyboardState(); 
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 100, this.parameters.oceanSide * 10000 );
    camera.position.y = 120;
    camera.position.z = - 1600;
    
    var amb_light = new THREE.AmbientLight( 0xffffff, Math.PI / 10 );
    scene.add( amb_light );
  
    light = new THREE.DirectionalLight( 0xffffff, Math.PI / 2 );
    scene.add( light );
         
    this.setWater();
  
    AircraftFactory = new Aircraft(MaterialLibrary);
    ship = AircraftFactory.drawShip();
      
    scene.add( ship );
    ship.add(camera);
    ship.rotateY(-Math.PI/2);
  
    land = (new Island(MaterialLibrary)).initLand(light)
    scene.add(land);
    this.initSky(scene);

    return { camera: camera, scene: scene, ship: ship};
  }
  initSky(scene) {
    // Add Sky
    sky = new THREE.Sky();
    sky.scale.setScalar( this.parameters.oceanSide * 5 );
    scene.add( sky );
  
    // Add Sun Helper
    sunSphere = new THREE.Mesh(
      new THREE.SphereBufferGeometry( 20000, 16, 8 ),
      new THREE.MeshBasicMaterial( { color: 0xffffff } )
    );
    sunSphere.position.y = - 700000;
    sunSphere.visible = false;
    scene.add( sunSphere );
  
    for (var i = 0; i < 100; i++) {
      // Credit - https://stackoverflow.com/a/13455101/8255070
      var x = Math.floor(Math.random()*99) + 1; // this will get a number between 1 and 99;
      x *= Math.floor(Math.random()*2) == 1 ? 1 : -1; 
      var y = Math.floor(Math.random()*99) + 1; // this will get a number between 1 and 99;
      y *= Math.floor(Math.random()*2) == 1 ? 1 : -1; 
      this.addCloud(new THREE.Vector3(
        (this.parameters.oceanSide / 35) * x,
        150000 + 25000 * Math.random(),
        (this.parameters.oceanSide / 35) * y)
      );  
    } 
    
    
    // old GUI params
    effectController  = {
      turbidity: 10,
      rayleigh: 2,
      mieCoefficient: 0.005,
      mieDirectionalG: 0.8,
      luminance: 1,
      inclination: -1.1, // elevation / inclination
      azimuth: -1.1, // Facing front,
      sun: ! true
    };
  
     var sun_cycle = new TWEEN.Tween(effectController)
      .to({azimuth: 1.1}, 600000)
      .to({inclination: 1.1}, 600000)
      .repeat(Infinity)
      .yoyo(true)
      .start();
  
  }
}
