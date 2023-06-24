var Kamigen = (function ($, THREE, TWEEN$1) {
  'use strict';

  function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

  var $__default = /*#__PURE__*/_interopDefaultLegacy($);
  var THREE__default = /*#__PURE__*/_interopDefaultLegacy(THREE);
  var TWEEN__default = /*#__PURE__*/_interopDefaultLegacy(TWEEN$1);

  /**
    * Director.
    * 
    * Manages scenes and the config and variables for the active scene.
    *
    */

  var Director = function Director(options) {
      
  };

  /**
    * Aircraft.
    * 
    * Object Class
    *
    */

  // Game libs.
  var MaterialLibrary$2;
  var lastBeta = 0, lastGamma = 0;

  var Aircraft = function Aircraft(materials) {
    MaterialLibrary$2 = materials;
  };

  Aircraft.prototype.animate = function animate (keyboard, camera_controls, AircraftFactory, scene) {
    if (this.velocity < 10) {
      // Falling gravity
      this.position.y -= 25 - (this.velocity * 2.5);
    }
    else {
      // Regular gravity
      this.position.y -= .98;
    }
    if (keyboard.pressed(" ")) {
      if (this.velocity < 50) {
        this.velocity += 0.1;
      }
    }
    if (keyboard.pressed("shift")) {
      if (this.velocity > 0) {
        this.velocity -= 0.1;  
      }
      else {
        this.velocity = 0;
      }
    }
    
    this.translateZ(this.velocity);
    if (keyboard.pressed("a")) {
      this.rotateZ(-Math.PI / 360);
    }
    if (keyboard.pressed("d")) {
      this.rotateZ(Math.PI / 360);
    }
    if (keyboard.pressed("s")) {
      this.rotateX(-Math.PI / 360);
    }
    if (keyboard.pressed("w")) {
      this.rotateX(Math.PI / 360);
    }
    if (keyboard.pressed("c")) {
      camera_controls.reset();
    }
    
    if (this.velocity != 0) {
      AircraftFactory.initParticles(scene);
      this.velocity *= 0.9999;
    }};

  Aircraft.prototype.drawShip = function drawShip () {
      var this$1$1 = this;

    var wingPort = this.getWing('port');
    var wingStarboard = this.getWing('starboard');
    var cockpit = this.getCockpit();
    var fuselage = this.getFuselage();
      
    this.ship = new THREE__default["default"].Object3D();
    this.ship.add(wingPort);
    this.ship.add(wingStarboard);
    this.ship.add(fuselage);
    this.ship.add(cockpit);
    this.ship.position.set(0, 25000, 0);
    this.ship.velocity = 15.0;
    
    $__default["default"]('.ui.button.accelerate').click(function () { return this$1$1.ship.velocity += 0.5; });
    $__default["default"]('.ui.button.decelerate').click(function () { return this$1$1.ship.velocity -= 0.5; });
    $__default["default"]('.ui.button.reset').click(function () { return camera_controls.reset(); });
    
      
      var eventHandler = function (event) {
        var betaDiff = lastBeta - event.beta;
        var gammaDiff = lastGamma - event.gamma;
    
        if (betaDiff > 5.5 || betaDiff < 5.5) {
          this$1$1.ship.rotateX(betaDiff / 250);
          if (betaDiff > 35 || betaDiff < 35) {
            this$1$1.ship.rotateX(betaDiff / 50);
          }
        }
        if (gammaDiff > 5.5 || gammaDiff < 5.5) {
          this$1$1.ship.rotateY(gammaDiff / 250);
          if (gammaDiff > 35 || gammaDiff < 35) {
            this$1$1.ship.rotateY(gammaDiff / 50);
          }
        }
          
        lastBeta = event.beta;
        lastGamma = event.gamma;
      };
      window.addEventListener("deviceorientation", eventHandler, true );
    
    this.ship.animate = this.animate;
    return this.ship;
  };

  Aircraft.prototype.getFuselage = function getFuselage () {
    var geometry = new THREE__default["default"].OctahedronGeometry( 30, 0);
    var texture = MaterialLibrary$2.textures.darkMetal1;
    var material = new THREE__default["default"].MeshPhongMaterial( { map: texture } );
    var fuselage = new THREE__default["default"].Mesh( geometry, material );
    
    fuselage.scale.set(.75,5,1.85);
    fuselage.position.set(0, -120, 0);
    fuselage.rotation.set(-Math.PI / 2, Math.PI / 2, 0);
    
    return fuselage;
  };
    
  Aircraft.prototype.getCockpit = function getCockpit () {
    var geometry = new THREE__default["default"].OctahedronGeometry( 30, 1);
    var material = new THREE__default["default"].MeshToonMaterial( { color: 0x006633, shininess: 100 } );
    var fuselage = new THREE__default["default"].Mesh( geometry, material );
    
    fuselage.scale.set(.8,.15,.35);
    fuselage.position.set(0, -110, 70);
    fuselage.rotation.set(0.1, -Math.PI / 2, 0);
    
    return fuselage;
  };
    
  Aircraft.prototype.getWing = function getWing (side) {
    if (side == 'port') {
      var closedSpline = new THREE__default["default"].CatmullRomCurve3( [    
        new THREE__default["default"].Vector3(-120,90, 120 ),
        new THREE__default["default"].Vector3(-120,90, -120 )
      ] );
    }
    if (side == 'starboard') {
      var closedSpline = new THREE__default["default"].CatmullRomCurve3( [    
        new THREE__default["default"].Vector3(-120,90, -120 ),
        new THREE__default["default"].Vector3(-120,90, 120 )
      ] );  
    }
    closedSpline.type = 'catmullrom';
    closedSpline.closed = true;
    var extrudeSettings = {
      steps   : 10,
      bevelEnabled: false,
      extrudePath : closedSpline
    };
    var pts = [], count = 3;
    for ( var i = 0; i < count; i ++ ) {
      var l = 80;
      var a = 20 * i / count * Math.PI;
      pts.push( new THREE__default["default"].Vector2 ( Math.cos( a ) * l, Math.sin( a ) * 4 ) );
    }
    var shape = new THREE__default["default"].Shape( pts );
    var geometry = new THREE__default["default"].ExtrudeGeometry( shape, extrudeSettings );
    var texture = MaterialLibrary$2.textures.darkMetal2;
    var material = new THREE__default["default"].MeshPhongMaterial( { map: texture, wireframe: false } );
    var wing = new THREE__default["default"].Mesh( geometry, material );
      
    
    if (side == 'port') {
      wing.position.set(-100,-240, 90);
      wing.rotation.set(0, Math.PI / 3 , -Math.PI / 2);
    }
    if (side == 'starboard') {
      wing.position.set(100,-240, 90);
      wing.rotation.set(0, ((2 * Math.PI) / 3) , -Math.PI / 2);
    }
      
    return wing;
  };

  Aircraft.prototype.initParticles = function initParticles (scene) {
    
    var scale = Math.random() * 32 + 16;
    var thrust = 360 * Math.random();
    var right_thruster = new THREE__default["default"].Sprite( MaterialLibrary$2.smoke() );
    right_thruster.position.set( this.ship.position.x, this.ship.position.y, this.ship.position.z );
    right_thruster.rotation.set( this.ship.rotation.x, this.ship.rotation.y, this.ship.rotation.z );
    right_thruster.translateX(-90);
    right_thruster.translateZ(-70);
    right_thruster.material.rotation = thrust;
    this.initParticle(scene, right_thruster, scale);
    
    var left_thruster = new THREE__default["default"].Sprite( MaterialLibrary$2.smoke() );
    left_thruster.position.set( this.ship.position.x, this.ship.position.y, this.ship.position.z );
    left_thruster.rotation.set( this.ship.rotation.x, this.ship.rotation.y, this.ship.rotation.z );
    left_thruster.translateX(90);
    left_thruster.translateZ(-70);
    left_thruster.material.rotation = -thrust;
    this.initParticle(scene, left_thruster, scale);
  };
    
  Aircraft.prototype.initParticle = function initParticle ( scene, particle, scale ) {
    particle.scale.x = particle.scale.y = scale;
    particle.translateY(-120);
    new TWEEN.Tween( particle.scale )
      .onComplete(function(){ scene.remove(particle); })
      .to( { x: 0.01, y: 0.01 }, 1000 )
      .start();
    scene.add( particle );
  };

  /**
    * Island.
    * 
    * Object Class
    *
    */

  var MaterialLibrary$1;

  var Island = function Island(materials) {
    MaterialLibrary$1 = materials;
  };

  Island.prototype.animate = function animate () {
      
  };

  Island.prototype.initLand = function initLand (light) {   
    var geometry = new THREE__default["default"].PlaneGeometry( 200000, 200000, 200, 200 );
    this.land= new THREE__default["default"].Mesh( geometry,MaterialLibrary$1.island(light) ) ;
    this.land.position.y = -900;
    this.land.rotation.x = - Math.PI / 2;
    return this.land;
  };

  /**
    * Opening.
    * 
    * Scene Class
    *
    */

  var keyboard, scene, camera;
  var water, land, light, sky, sunSphere, ship, AircraftFactory;

  var cloudId = 0;
  var cloudTextures = ["./assets/cloud.png", "./assets/cloud2.png", "./assets/cloud3.png"];
  var clouds = [];

  var effectController  = {
    turbidity: 10,
    rayleigh: 2,
    mieCoefficient: 0.005,
    mieDirectionalG: 0.8,
    luminance: 1,
    inclination: -1.1, // elevation / inclination
    azimuth: -1.1, // Facing front,
    sun: ! true
  };

  var MaterialLibrary;

  var IslandScene = function IslandScene(Materials) {
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
  };

  IslandScene.prototype.animate = function animate (camera_controls) {
      var this$1$1 = this;

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
    
    clouds.forEach(function (sprite) {
      sprite.material.opacity = Math.min(1, Math.max(0.05,(sunSphere.position.y / this$1$1.parameters.oceanSide)));
    });

    ship.animate(keyboard, camera_controls, AircraftFactory, scene);
  };
  IslandScene.prototype.addCloud = function addCloud (position) {
    var spriteMap = new THREE__default["default"].TextureLoader().load( cloudTextures[cloudId] );
    var spriteMaterial = new THREE__default["default"].SpriteMaterial( { alphaTest: 0.00125, map: spriteMap, color: 0xffffff } );
    var sprite = new THREE__default["default"].Sprite( spriteMaterial );
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
  };
  IslandScene.prototype.setWater = function setWater () {
    var waterGeometry = new THREE__default["default"].CircleBufferGeometry( this.parameters.oceanSide * 5, 1000 );
    water = new THREE__default["default"].Water(
      waterGeometry,
      {
        clipBias: -0.000001,
        textureWidth: 1024,
        textureHeight: 1024,
        waterNormals: new THREE__default["default"].TextureLoader().load( './assets/waternormals.jpg', function ( texture ) {
          texture.wrapS = texture.wrapT = THREE__default["default"].RepeatWrapping;
        }),
        alpha:this.parameters.alpha,
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
    
  };
  IslandScene.prototype.init = function init () {
    keyboard= new THREEx.KeyboardState(); 
    scene = new THREE__default["default"].Scene();
    camera = new THREE__default["default"].PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 100, this.parameters.oceanSide * 10000 );
    camera.position.y = 120;
    camera.position.z = - 1600;
      
    var amb_light = new THREE__default["default"].AmbientLight( 0xffffff, Math.PI / 10 );
    scene.add( amb_light );
    
    light = new THREE__default["default"].DirectionalLight( 0xffffff, Math.PI / 2 );
    scene.add( light );
           
    this.setWater();
    
    AircraftFactory = new Aircraft(MaterialLibrary);
    ship = AircraftFactory.drawShip();
        
    scene.add( ship );
    ship.add(camera);
    ship.rotateY(-Math.PI/2);
    
    land = (new Island(MaterialLibrary)).initLand(light);
    scene.add(land);
    this.initSky(scene);

    return { camera: camera, scene: scene, ship: ship};
  };
  IslandScene.prototype.initSky = function initSky (scene) {
    // Add Sky
    sky = new THREE__default["default"].Sky();
    sky.scale.setScalar( this.parameters.oceanSide * 5 );
    scene.add( sky );
    
    // Add Sun Helper
    sunSphere = new THREE__default["default"].Mesh(
      new THREE__default["default"].SphereBufferGeometry( 20000, 16, 8 ),
      new THREE__default["default"].MeshBasicMaterial( { color: 0xffffff } )
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
      this.addCloud(new THREE__default["default"].Vector3(
        (this.parameters.oceanSide / 35) * x,
        150000 + 25000 * Math.random(),
        (this.parameters.oceanSide / 35) * y)
      );  
    } 
      
      
    // old GUI params
    effectController= {
      turbidity: 10,
      rayleigh: 2,
      mieCoefficient: 0.005,
      mieDirectionalG: 0.8,
      luminance: 1,
      inclination: -1.1, // elevation / inclination
      azimuth: -1.1, // Facing front,
      sun: ! true
    };
    
     new TWEEN.Tween(effectController)
      .to({azimuth: 1.1}, 600000)
      .to({inclination: 1.1}, 600000)
      .repeat(Infinity)
      .yoyo(true)
      .start();
    
  };

  /**
    * Materials.
    * 
    * Central store for all the images used for textures and materials.
    *
    */

  var Materials = function Materials(options) {
    var this$1$1 = this;

    /** 
     * Textures
     */
    this.textures = {
      darkMetal1: this.loadTexture('./assets/darkmetal.jpg', function (texture) {
        texture.wrapS = texture.wrapT = THREE__default["default"].MirroredRepeatWrapping;
        texture.repeat.set( 10., 25. );
      }),
      darkMetal2: this.loadTexture('./assets/darkmetal.jpg', function (texture) {
        texture.wrapS = texture.wrapT = THREE__default["default"].RepeatWrapping;
        texture.repeat.set( .05, .05 );
      }),
      forest: this.loadTexture('/assets/forest.jpg', function ( texture ) {
        texture.wrapS = texture.wrapT = THREE__default["default"].RepeatWrapping;
      }),
      island_heightMap: this.loadTexture('./assets/height.png'),
      island_texture: this.loadTexture('./assets/texture.png'),
      sand: this.loadTexture('/assets/sand.jpg', function ( texture ) {
        texture.wrapS = texture.wrapT = THREE__default["default"].RepeatWrapping;
      }),
      smoke: this.loadTexture('./assets/smoke.png'),
      volcano: this.loadTexture('/assets/volcano.jpg', function ( texture ) {
        texture.wrapS = texture.wrapT = THREE__default["default"].RepeatWrapping;
      })
    };
    /** 
     * Material definitions
     */
    this.island = function (light) {
      return new THREE__default["default"].ShaderMaterial({
        uniforms: {
          bumpTexture:{ type: "t", value: this$1$1.textures.island_heightMap },
          bumpScale:  { type: "f", value: 24361.43 },
          landSize:   { type: "f", value: 200000 },
          time:       { type: "f", value: 0.0 },
          texture:    { type: "t", value: this$1$1.textures.island_texture },
          sandyTexture: { type: "t", value: this$1$1.textures.sand },
          forestTexture: { type: "t", value: this$1$1.textures.forest },
          rockyTexture: { type: "t", value: this$1$1.textures.volcano },
          sunPosition:{ type: "v3", value: light.position.clone() },
          center:     { type: "v3", value: { x: 0, y: 0, z: 0} }
        },
        vertexShader: document.getElementById( 'landVertexShader' ).textContent,
        fragmentShader: document.getElementById( 'landFragmentShader' ).textContent,
        transparent: true
      });
    };
    this.smoke = function () {
      return new THREE__default["default"].SpriteMaterial( {
        alphaTest: .0543212345,
        map: this$1$1.textures.smoke,
        transparent: true
      } );
    };
  };

  Materials.prototype.loadTexture = function loadTexture (texture_location, callback) {
      if ( callback === void 0 ) callback = function () {};

    return new THREE__default["default"].TextureLoader().load( texture_location, callback);
  };

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

  var clock = new THREE__default["default"].Clock();

  var Scenograph = function Scenograph() {
    this.Director = new Director();
    this.Materials = new Materials();
    this.Scenes = {
      IslandScene: new IslandScene(this.Materials)
    };
    this.renderer = new THREE__default["default"].WebGLRenderer({
      antialias: true,
      logarithmicDepthBuffer: false
    });
  };
  Scenograph.prototype.ready = function ready () {
      
    this.renderer.setPixelRatio( window.devicePixelRatio );
    this.renderer.setSize( window.innerWidth, window.innerHeight );

    this.container = document.getElementById( 'container' );
      
    this.container.innerHTML = "";
    this.container.appendChild( this.renderer.domElement );
      
    var IslandSceneInstance = this.Scenes.IslandScene.init();
    this.scene = IslandSceneInstance.scene;
    this.camera = IslandSceneInstance.camera;
    this.ship = IslandSceneInstance.ship;
    this.camera_controls = new THREE__default["default"].OrbitControls( this.camera, window.app.scenograph.renderer.domElement );
      
    window.addEventListener( 'resize', this.onWindowResize, false );

    this.stats = new Stats();
    document.getElementById( 'stats' ).appendChild( this.stats.domElement );

    this.animate();
  };
  Scenograph.prototype.onWindowResize = function onWindowResize () {
    window.app.scenograph.camera.aspect = window.innerWidth / window.innerHeight;
    window.app.scenograph.camera.updateProjectionMatrix();
    window.app.scenograph.renderer.setSize( window.innerWidth, window.innerHeight );
  };
  Scenograph.prototype.animate = function animate () {
    TWEEN__default["default"].update();
       
    requestAnimationFrame( window.app.scenograph.animate );
    window.app.scenograph.render();
  };
  Scenograph.prototype.render = function render () {
    var delta = clock.getDelta();
      clock.getElapsedTime() * 10;

    this.Scenes.IslandScene.animate(this.camera_controls);
    
    this.camera_controls.update( delta );
    this.camera.lookAt(this.ship.position);
    this.stats.update();

    this.renderer.render( this.scene, this.camera );
  };

  /**
   * Kamigen Browser Application
   * 
   * @TODO: Replace game.js and jumbotron.js
   */

  // Setup the main App class.
  var App = function App() {
    this.scenograph = new Scenograph();
  };

  // Run App using jQuery.ready()
  $__default["default"](function () {
    window.app = new App();

    // Run all the ready functions
    for (var classInstance in app) {
      if (app[classInstance].ready) {
        app[classInstance].ready();
      }
    }
  });

  return App;

})(jQuery, THREE, TWEEN);
//# sourceMappingURL=app.js.map
