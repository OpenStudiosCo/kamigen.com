/**
  * Island.
  * 
  * Object Class
  *
  */

// Globals.
import $ from 'jQuery';
import THREE from 'THREE';

let MaterialLibrary;

export default class Island {
  constructor(materials) {
    MaterialLibrary = materials;
  }

  animate() {
    
  }

  initLand(light) {   
    var geometry = new THREE.PlaneGeometry( 200000, 200000, 200, 200 );
    this.land  = new THREE.Mesh( geometry,  MaterialLibrary.island(light) ) ;
    this.land.position.y = -900;
    this.land.rotation.x = - Math.PI / 2;
    return this.land;
  }
}
