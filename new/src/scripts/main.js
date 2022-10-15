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
    let mixer;
    const clock = new THREE.Clock();

    const canvasElm = document.querySelector('canvas.overlay');
    const scrollWidth = Math.max(
        document.body.clientWidth, document.documentElement.clientWidth
    );
    const scrollHeight = Math.max(
        document.body.scrollHeight, document.documentElement.scrollHeight,
        document.body.offsetHeight, document.documentElement.offsetHeight,
        document.body.clientHeight, document.documentElement.clientHeight
    );

    // Setup renderer.
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, scrollWidth / scrollHeight, 0.1, 1000);
    camera.position.z = 800;


    const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        canvas: canvasElm
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(scrollWidth, scrollHeight);

    // Setup scene core.

    const ambientLight = new THREE.AmbientLight(0xcccccc, 0.5);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight( 0xffffff, 0.5 );
    camera.add( pointLight );

    scene.add(camera);

    // Setup scene objects.
    const map = new THREE.TextureLoader().load('assets/page1_hq_building.png');
    map.anisotropy = 16;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    //map.minFilter = map.magFilter = THREE.LinearFilter;

    const material = new THREE.MeshPhongMaterial({ map: map, side: THREE.DoubleSide, transparent: true });
    let object = new THREE.Mesh(new THREE.PlaneGeometry(100, 100, 4, 4), material);
    let scale = 5.75;
    object.name = 'Building';
    object.scale.set(scale, scale, scale);
    let buildingPosition = -300;

    object.position.set(0, buildingPosition, 0);
    scene.add(object);

    const loader = new THREE.GLTFLoader();

    loader.load( 'assets/seagull.glb', function ( gltf ) {
        const model = gltf.scene;
        model.name = 'Seagull';
        model.scale.set( 150, 150, 150 );
        model.position.set( -10, 20, 0 );
        model.rotation.set( 0, Math.PI, 0 );
        window.scenoGraph.objects.seagull = model;

        scene.add( window.scenoGraph.objects.seagull );
        mixer = new THREE.AnimationMixer( window.scenoGraph.objects.seagull );
        mixer.clipAction( gltf.animations[ 9 ] ).play();
        animateScene();
        console.log(gltf);

    }, undefined, function ( error ) {

        console.error( error );

    } );

    // Begin animations.
    window.scenoGraph = {
        animations: {
            building: {
                yPosition: buildingPosition,
                tween: animate({
                    duration: 5000,
                    onUpdate: latest => window.scenoGraph.animations.building.yPosition = buildingPosition + latest,
                    repeat: Infinity,
                    to: [2.5, -2.5, 0],
                })
            }            
        },
        objects: {
            seagull: null,
        }
    };

    

    window.addEventListener( 'resize', onWindowResize );

    function onWindowResize() {
        const scrollWidth = Math.max(
            document.body.clientWidth, document.documentElement.clientWidth
        );

        const scrollHeight = Math.max(
            document.body.scrollHeight, document.documentElement.scrollHeight,
            document.body.offsetHeight, document.documentElement.offsetHeight,
            document.body.clientHeight, document.documentElement.clientHeight
        );

        camera.aspect = scrollWidth / scrollHeight;
        camera.updateProjectionMatrix();

        renderer.setSize( scrollWidth, scrollHeight );

    }

    function animateScene() {

        window.requestAnimationFrame(animateScene);

        const delta = clock.getDelta();

        mixer.update( delta );

        render();
    }

    function render() {

        const timer = Date.now() * 0.0001;

        camera.lookAt(scene.position);

        scene.traverse(function (object) {

            if (object.isMesh === true) {

                object.position.y += Math.cos(timer) * 0.025;

            }

        });

        renderer.render(scene, camera);

    }

    console.log('The page successfully loaded!');
}

docReady(init);
