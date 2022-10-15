import '../styles/main.css';

import { animate } from "popmotion";

function docReady(fn) {
    // see if DOM is already available
    if (document.readyState === "complete" || document.readyState === "interactive") {
        // call on next available tick
        setTimeout(fn, 1);
    } else {
        document.addEventListener("DOMContentLoaded", fn);
    }
}

function init() {

    
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );

    const renderer = new THREE.WebGLRenderer();
    renderer.setSize( window.innerWidth, window.innerHeight );
    document.body.appendChild( renderer.domElement );

    var elem = document.getElementById("myDiv");
    var style = window.getComputedStyle(elem);

    let originalTop = style.marginTop.replace('px', '');

    window.scene = {
        'animations': {
            'building': animate({
                onUpdate: latest => {
                    document.getElementById("myDiv").style.marginTop = (parseFloat(originalTop) + latest) + "px";
                },
                repeat: Infinity,
                to: [5, -5, 0],
                duration: 5000,
            })
        }
    };
    
    console.log('The page successfully loaded!');

    let time = 0;
    
    //animateScene(time);

    function animateScene(time) {
        let newTime = parseInt(time) + 1;

        var elem = document.getElementById("myDiv");
        var style = window.getComputedStyle(elem);

        let originalTop = style.marginTop.replace('px', '');

        let change = window.scene.animations.building;

        document.getElementById("myDiv").style.marginTop = (parseFloat(currentTop) + change) + "px";
        time = newTime;
        window.requestAnimationFrame(animateScene)
    }

}

docReady(init);
