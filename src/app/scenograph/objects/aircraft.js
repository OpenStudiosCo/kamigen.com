/**
  * Aircraft.
  * 
  * Object Class
  *
  */

// Globals.
import $ from 'jQuery';
import THREE from 'THREE';

// Game libs.
let MaterialLibrary;
let lastAlpha = 0, lastBeta = 0, lastGamma = 0;

export default class Aircraft {
  constructor(materials) {
    MaterialLibrary = materials;
  }

  animate(keyboard, camera_controls, AircraftFactory, scene) {
    let nothingPressed = true;
    if (this.velocity < 10) {
      // Falling gravity
      this.position.y -= 25 - (this.velocity * 2.5);
    }
    else {
      // Regular gravity
      this.position.y -= .98;
    }
    if (keyboard.pressed(" ")) {
      nothingPressed = false;
      if (this.velocity < 50) {
        this.velocity += 0.1;
      }
    }
    if (keyboard.pressed("shift")) {
      nothingPressed = false;
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
      nothingPressed = false;
    }
    if (keyboard.pressed("d")) {
      this.rotateZ(Math.PI / 360);
      nothingPressed = false;
    }
    if (keyboard.pressed("s")) {
      this.rotateX(-Math.PI / 360);
      nothingPressed = false;
    }
    if (keyboard.pressed("w")) {
      this.rotateX(Math.PI / 360);
      nothingPressed = false;
    }
    if (keyboard.pressed("c")) {
      camera_controls.reset();
      nothingPressed = false;
    }
  
    if (this.velocity != 0) {
      AircraftFactory.initParticles(scene);
      this.velocity *= 0.9999;
    };
  }

  drawShip() {
    var wingPort = this.getWing('port');
    var wingStarboard = this.getWing('starboard');
    var cockpit = this.getCockpit();
    var fuselage = this.getFuselage();
    
    this.ship = new THREE.Object3D();
    this.ship.add(wingPort);
    this.ship.add(wingStarboard);
    this.ship.add(fuselage);
    this.ship.add(cockpit);
    this.ship.position.set(0, 25000, 0);
    this.ship.velocity = 15.0;
  
    $('.ui.button.accelerate').click(() => this.ship.velocity += 0.5);
    $('.ui.button.decelerate').click(() => this.ship.velocity -= 0.5);
    $('.ui.button.reset').click(() => camera_controls.reset());
  
    
      var eventHandler = (event) => {
        var betaDiff = lastBeta - event.beta;
        var gammaDiff = lastGamma - event.gamma;
  
        if (betaDiff > 5.5 || betaDiff < 5.5) {
          this.ship.rotateX(betaDiff / 250);
          if (betaDiff > 35 || betaDiff < 35) {
            this.ship.rotateX(betaDiff / 50);
          }
        }
        if (gammaDiff > 5.5 || gammaDiff < 5.5) {
          this.ship.rotateY(gammaDiff / 250);
          if (gammaDiff > 35 || gammaDiff < 35) {
            this.ship.rotateY(gammaDiff / 50);
          }
        }
        
        lastBeta = event.beta;
        lastGamma = event.gamma;
      };
      window.addEventListener("deviceorientation", eventHandler, true );
  
    this.ship.animate = this.animate;
    return this.ship;
  }

  getFuselage() {
    var geometry = new THREE.OctahedronGeometry( 30, 0);
    var texture = MaterialLibrary.textures.darkMetal1;
    var material = new THREE.MeshPhongMaterial( { map: texture } );
    var fuselage = new THREE.Mesh( geometry, material );
  
    fuselage.scale.set(.75,5,1.85);
    fuselage.position.set(0, -120, 0);
    fuselage.rotation.set(-Math.PI / 2, Math.PI / 2, 0);
  
    return fuselage;
  }
  
  getCockpit() {
    var geometry = new THREE.OctahedronGeometry( 30, 1);
    var material = new THREE.MeshToonMaterial( { color: 0x006633, shininess: 100 } );
    var fuselage = new THREE.Mesh( geometry, material );
  
    fuselage.scale.set(.8,.15,.35);
    fuselage.position.set(0, -110, 70);
    fuselage.rotation.set(0.1, -Math.PI / 2, 0);
  
    return fuselage;
  }
  
  getWing(side) {
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
    var texture = MaterialLibrary.textures.darkMetal2;
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

  initParticles(scene) {
  
    var scale = Math.random() * 32 + 16;
    var thrust = 360 * Math.random();
    var right_thruster = new THREE.Sprite( MaterialLibrary.smoke() );
    right_thruster.position.set( this.ship.position.x, this.ship.position.y, this.ship.position.z );
    right_thruster.rotation.set( this.ship.rotation.x, this.ship.rotation.y, this.ship.rotation.z );
    right_thruster.translateX(-90);
    right_thruster.translateZ(-70);
    right_thruster.material.rotation = thrust;
    this.initParticle(scene, right_thruster, scale);
  
    var left_thruster = new THREE.Sprite( MaterialLibrary.smoke() );
    left_thruster.position.set( this.ship.position.x, this.ship.position.y, this.ship.position.z );
    left_thruster.rotation.set( this.ship.rotation.x, this.ship.rotation.y, this.ship.rotation.z );
    left_thruster.translateX(90);
    left_thruster.translateZ(-70);
    left_thruster.material.rotation = -thrust;
    this.initParticle(scene, left_thruster, scale);
  }
  
  initParticle( scene, particle, scale ) {
    particle.scale.x = particle.scale.y = scale;
    particle.translateY(-120);
    new TWEEN.Tween( particle.scale )
      .onComplete(function(){ scene.remove(particle) })
      .to( { x: 0.01, y: 0.01 }, 1000 )
      .start();
    scene.add( particle );
  }
  
}
