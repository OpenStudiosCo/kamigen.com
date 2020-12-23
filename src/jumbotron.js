/**
 * Kamigen Jumbotron
 */

var NEAR = 1e-6, FAR = 1e27;
var water, light;
var parameters = {
  oceanSide: 150000,
  size: 1,
  distortionScale: 8,
  alpha: 1
};
var waterNormals;
var container;
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
    rayleigh: 3,
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
  container = document.getElementById( 'jumbotron' );
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    logarithmicDepthBuffer: false
  });
  renderer.setPixelRatio( window.devicePixelRatio );
  renderer.setSize( window.innerWidth, 350 );
  container.innerHTML = "";
  container.appendChild( renderer.domElement );

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera( 45, window.innerWidth / 350, 100, parameters.oceanSide * 10000 );
  camera.position.x = -15000;
  camera.position.y = 150000;
  camera.position.z = 125000;
  camera.lookAt(0,0,0);
  
  var amb_light = new THREE.AmbientLight( 0xffffff, Math.PI / 10 );
  scene.add( amb_light );

  light = new THREE.DirectionalLight( 0xffffff, Math.PI / 2 );
  scene.add( light );
  
  //camera_controls = new THREE.OrbitControls( camera, renderer.domElement );
  
  setWater();
    
  scene.add( camera );

  initLand();
  initSky();

  window.addEventListener( 'resize', onWindowResize, false );
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

function onWindowResize() {
  camera.aspect = window.innerWidth / 350;
  camera.updateProjectionMatrix();
  renderer.setSize( window.innerWidth, 350 );
}

var resettingCamera = false;
function animate() {
  TWEEN.update();
 
  requestAnimationFrame( animate );
  render();
}
function render() {
  var delta = clock.getDelta(),
    time = clock.getElapsedTime();
  
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


  //camera_controls.update( delta );
  camera.position.x = -150000 * Math.cos( time / 10 ) ;
  camera.position.y = Math.max(1000, 140000 * Math.cos( time / 10 ));
  camera.position.z = 120000 * Math.sin( time / 10 ) ;
  camera.lookAt(0,3000,0);
 
  renderer.render( scene, camera );
}


init();
animate();
