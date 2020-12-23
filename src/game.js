/**
 * Kamigen Browser Application
 */
export default class App {
  constructor() {
    // this.stuff =
  }
}

// Startup using jQuery.ready().
$(() => {
  var app = new App();
  window.app = app;

  init();
  animate();
});

var NEAR = 1e-6, FAR = 1e27;
var water, light;
var parameters = {
  oceanSide: 150000,
  size: 1,
  distortionScale: 8,
  alpha: 1
};
var waterNormals;
var container, stats;
var keyboard, ship;
var camera, camera_controls, scene, renderer;
var water, texture, water_geometry, material, particle;
var worldWidth = 256, worldDepth = 256,
worldHalfWidth = worldWidth / 2, worldHalfDepth = worldDepth / 2;
var clock = new THREE.Clock();
var land, sky;
var sunSphere;
var effectController;

/* World building functions */
function initSky() {
  // Add Sky
  sky = new THREE.Sky();
  sky.scale.setScalar( parameters.oceanSide * 5 );
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
    addCloud(new THREE.Vector3(
      (parameters.oceanSide / 35) * x,
      150000 + 25000 * Math.random(),
      (parameters.oceanSide / 35) * y)
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

var cloudId = 0;
var cloudTextures = ["./assets/cloud.png", "./assets/cloud2.png", "./assets/cloud3.png"];
var clouds = [];
function addCloud(position) {
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

function initLand() {
  var displacementMap = new THREE.TextureLoader().load( "/assets/height.png" );
  var map = new THREE.TextureLoader().load( "/assets/texture.png" );

  var sandMap = new THREE.TextureLoader().load( "/assets/sand.jpg", function ( texture ) {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    });
  var forestMap = new THREE.TextureLoader().load( "/assets/forest.jpg" , function ( texture ) {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      });
  var volcanoMap = new THREE.TextureLoader().load( "/assets/volcano.jpg" , function ( texture ) {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      });

  var landSize = 200000;
  
  var customMaterial = new THREE.ShaderMaterial( 
  {
    uniforms: {
      bumpTexture:  { type: "t", value: displacementMap },
      bumpScale:    { type: "f", value: 24361.43 },
      landSize:     { type: "f", value: landSize },
      time:         { type: "f", value: 0.0 },
      texture:      { type: "t", value: map },
      sandyTexture: { type: "t", value: sandMap },
      forestTexture: { type: "t", value: forestMap },
      rockyTexture: { type: "t", value: volcanoMap },
      sunPosition:  { type: "v3", value: light.position.clone() },
      center:       { type: "v3", value: { x: 0, y: 0, z: 0} }
    },
    vertexShader:   document.getElementById( 'landVertexShader'   ).textContent,
    fragmentShader: document.getElementById( 'landFragmentShader' ).textContent,
    transparent: true
  }   );
  var geometry = new THREE.PlaneGeometry( landSize, landSize, 200, 200 );
  land  = new THREE.Mesh( geometry, customMaterial ) ;
  land.position.y = -900;
  land.rotation.x = - Math.PI / 2;
  scene.add( land );
}
function init() {
  keyboard  = new THREEx.KeyboardState();
  container = document.getElementById( 'container' );
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    logarithmicDepthBuffer: false
  });
  renderer.setPixelRatio( window.devicePixelRatio );
  renderer.setSize( window.innerWidth, window.innerHeight );
  container.innerHTML = "";
  container.appendChild( renderer.domElement );

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 100, parameters.oceanSide * 10000 );
  camera.position.y = 120;
  camera.position.z = - 1600;
  
  var amb_light = new THREE.AmbientLight( 0xffffff, Math.PI / 10 );
  scene.add( amb_light );

  light = new THREE.DirectionalLight( 0xffffff, Math.PI / 2 );
  scene.add( light );
  
  camera_controls = new THREE.OrbitControls( camera, renderer.domElement );

  if (window.innerWidth <= 800) {
    
  }
  
  setWater();

  drawShip();
    
  scene.add( ship );
  ship.add(camera);
  ship.rotateY(-Math.PI/2);

  initLand();
  initSky();

  drawTorus(-25000, 25000, 0);
  drawTorus(-45000, 35000, 0);

  stats = new Stats();
  document.getElementById( 'stats' ).appendChild( stats.domElement );

  window.addEventListener( 'resize', onWindowResize, false );
}

function drawTorus(x, y, z) {
  var geometry = new THREE.TorusGeometry( 1000, 100, 8, 50 );
  var material = new THREE.MeshBasicMaterial( { color: 0xffff00, wireframe: true } );
  var torus = new THREE.Mesh( geometry, material );
  torus.rotation.set(0,-Math.PI/2, 0);
  torus.position.set(x, y, z);
  scene.add( torus );
}

var lastAlpha = 0, lastBeta = 0, lastGamma = 0;
function drawShip() {
  var wingPort = getWing('port');
  var wingStarboard = getWing('starboard');
  var cockpit = getCockpit();
  var fuselage = getFuselage();
  
  ship = new THREE.Object3D();
  ship.add(wingPort);
  ship.add(wingStarboard);
  ship.add(fuselage);
  ship.add(cockpit);
  ship.position.set(0, 25000, 0);
  ship.velocity = 15.0;

  $('.ui.button.accelerate').click(() => ship.velocity += 0.5);
  $('.ui.button.decelerate').click(() => ship.velocity -= 0.5);
  $('.ui.button.reset').click(() => camera_controls.reset());

  
    var eventHandler = (event) => {
      var betaDiff = lastBeta - event.beta;
      var gammaDiff = lastGamma - event.gamma;

      if (betaDiff > 5.5 || betaDiff < 5.5) {
        ship.rotateX(betaDiff / 250);
        if (betaDiff > 35 || betaDiff < 35) {
          ship.rotateX(betaDiff / 50);
        }
      }
      if (gammaDiff > 5.5 || gammaDiff < 5.5) {
        ship.rotateY(gammaDiff / 250);
        if (gammaDiff > 35 || gammaDiff < 35) {
          ship.rotateY(gammaDiff / 50);
        }
      }
      
      lastBeta = event.beta;
      lastGamma = event.gamma;
    };
    window.addEventListener("deviceorientation", eventHandler, true );

  return ship;
}

function setWater() {
  var waterGeometry = new THREE.CircleBufferGeometry( parameters.oceanSide * 5, 1000 );
  water = new THREE.Water(
    waterGeometry,
    {
      clipBias: -0.000001,
      textureWidth: 1024,
      textureHeight: 1024,
      waterNormals: new THREE.TextureLoader().load( './assets/waternormals.jpg', function ( texture ) {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      }),
      alpha:  parameters.alpha,
      sunDirection: light.position.clone().normalize(),
      sunColor: 0x66CCFF,
      waterColor: 0x001e0f,
      distortionScale: parameters.distortionScale,
      fog: scene.fog != undefined,
      size: parameters.size
    }
  );

  water.rotation.x = - Math.PI / 2;
  water.receiveShadow = true;

  scene.add( water );

}

function getFuselage() {
  var geometry = new THREE.OctahedronGeometry( 30, 0);
  var texture = new THREE.TextureLoader().load( './assets/darkmetal.jpg', function ( texture ) {
    texture.wrapS = texture.wrapT = THREE.MirroredRepeatWrapping;
    texture.repeat.set( 10., 25. );
  });
  var material = new THREE.MeshPhongMaterial( { map: texture } );
  var fuselage = new THREE.Mesh( geometry, material );

  fuselage.scale.set(.75,5,1.85);
  fuselage.position.set(0, -120, 0);
  fuselage.rotation.set(-Math.PI / 2, Math.PI / 2, 0);

  return fuselage;
}

function getCockpit() {
  var geometry = new THREE.OctahedronGeometry( 30, 1);
  var material = new THREE.MeshToonMaterial( { color: 0x006633, shininess: 100 } );
  var fuselage = new THREE.Mesh( geometry, material );

  fuselage.scale.set(.8,.15,.35);
  fuselage.position.set(0, -110, 70);
  fuselage.rotation.set(0.1, -Math.PI / 2, 0);

  return fuselage;
}

function getWing(side) {
  if (side == 'port') {
    var closedSpline = new THREE.CatmullRomCurve3( [    
      new THREE.Vector3(  -120,  90, 120 ),
      new THREE.Vector3(  -120,  90, -120 )
    ] );
  }
  if (side == 'starboard') {
    var closedSpline = new THREE.CatmullRomCurve3( [    
      new THREE.Vector3(  -120,  90, -120 ),
      new THREE.Vector3(  -120,  90, 120 )
    ] );  
  }
  closedSpline.type = 'catmullrom';
  closedSpline.closed = true;
  var extrudeSettings = {
    steps     : 10,
    bevelEnabled  : false,
    extrudePath   : closedSpline
  };
  var pts = [], count = 3;
  for ( var i = 0; i < count; i ++ ) {
    var l = 80;
    var a = 20 * i / count * Math.PI;
    pts.push( new THREE.Vector2 ( Math.cos( a ) * l, Math.sin( a ) * 4 ) );
  }
  var shape = new THREE.Shape( pts );
  var geometry = new THREE.ExtrudeGeometry( shape, extrudeSettings );
  var texture = new THREE.TextureLoader().load( './assets/darkmetal.jpg', function ( texture ) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set( .05, .05 );
  });
  var material = new THREE.MeshPhongMaterial( { map: texture, wireframe: false } );
  var wing = new THREE.Mesh( geometry, material );
  

  if (side == 'port') {
    wing.position.set(-100,-240, 90);
    wing.rotation.set(0, Math.PI / 3 , -Math.PI / 2);
  }
  if (side == 'starboard') {
    wing.position.set(100,-240, 90);
    wing.rotation.set(0, ((2 * Math.PI) / 3) , -Math.PI / 2);
  }
  
  return wing;
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize( window.innerWidth, window.innerHeight );
}

var resettingCamera = false;
function animate() {
  TWEEN.update();
  let nothingPressed = true;
  if (ship.velocity < 10) {
    // Falling gravity
    ship.position.y -= 25 - (ship.velocity * 2.5);
  }
  else {
    // Regular gravity
    ship.position.y -= .98;
  }
  if (keyboard.pressed(" ")) {
    nothingPressed = false;
    if (ship.velocity < 50) {
      ship.velocity += 0.1;
    }
  }
  if (keyboard.pressed("shift")) {
    nothingPressed = false;
    if (ship.velocity > 0) {
      ship.velocity -= 0.1;  
    }
    else {
      ship.velocity = 0;
    }
  }

  ship.translateZ(ship.velocity);
  if (keyboard.pressed("a")) {
    ship.rotateZ(-Math.PI / 360);
    nothingPressed = false;
  }
  if (keyboard.pressed("d")) {
    ship.rotateZ(Math.PI / 360);
    nothingPressed = false;
  }
  if (keyboard.pressed("s")) {
    ship.rotateX(-Math.PI / 360);
    nothingPressed = false;
  }
  if (keyboard.pressed("w")) {
    ship.rotateX(Math.PI / 360);
    nothingPressed = false;
  }
  if (keyboard.pressed("c")) {
    camera_controls.reset();
    nothingPressed = false;
  }

  if (ship.velocity != 0) {
    initParticles();
    ship.velocity *= 0.9999;
  };

  requestAnimationFrame( animate );
  render();
}
function render() {
  var delta = clock.getDelta(),
    time = clock.getElapsedTime() * 10;
  
  water.material.uniforms.time.value += 1.0 / 60.0;
  land.material.uniforms.time.value += 1.0 / 60.0;
  
  if (effectController) {
    var distance = parameters.oceanSide;

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
    sprite.material.opacity = Math.min(1, Math.max(0.05,(sunSphere.position.y / parameters.oceanSide)));
  });

  camera_controls.update( delta );
  camera.lookAt(ship.position);
  stats.update();

  renderer.render( scene, camera );
}

var fire_material = new THREE.SpriteMaterial( {
  alphaTest: .0543212345,
  map: new THREE.TextureLoader().load( './assets/smoke.png'),
  transparent: true
} );
function initParticles() {

  var scale = Math.random() * 32 + 16;
  var thrust = 360 * Math.random();
  var right_thruster = new THREE.Sprite( fire_material );
  right_thruster.position.set( ship.position.x, ship.position.y, ship.position.z );
  right_thruster.rotation.set( ship.rotation.x, ship.rotation.y, ship.rotation.z );
  right_thruster.translateX(-90);
  right_thruster.translateZ(-70);
  right_thruster.material.rotation = thrust;
  initParticle(right_thruster, scale);

  var left_thruster = new THREE.Sprite( fire_material );
  left_thruster.position.set( ship.position.x, ship.position.y, ship.position.z );
  left_thruster.rotation.set( ship.rotation.x, ship.rotation.y, ship.rotation.z );
  left_thruster.translateX(90);
  left_thruster.translateZ(-70);
  left_thruster.material.rotation = -thrust;
  initParticle(left_thruster, scale);
}

function initParticle( particle, scale ) {
  particle.scale.x = particle.scale.y = scale;
  particle.translateY(-120);
  new TWEEN.Tween( particle.scale )
    .onComplete(function(){ scene.remove(particle) })
    .to( { x: 0.01, y: 0.01 }, 1000 )
    .start();
  scene.add( particle );
}
