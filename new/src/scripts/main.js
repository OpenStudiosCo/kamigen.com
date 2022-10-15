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

    window.scenoGraph = {
        objects: {
            bridge: null,
            building: null,
            redboat: null,
            yellowboat: null,
            seagull: null,
        }
    };

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

    const pointLight = new THREE.PointLight(0xffffff, 0.5);
    camera.add(pointLight);

    scene.add(camera);

    // Setup scene objects.

    window.scenoGraph.objects.building = getPlaneModel('Building', 'assets/page1_hq_building.png', [0, -300, 0], 5.75);
    scene.add(window.scenoGraph.objects.building);

    window.scenoGraph.objects.bridge = getPlaneModel('Bridge', 'assets/page1_hq_bridge.png', [-242, -327, -15], 1);
    scene.add(window.scenoGraph.objects.bridge);

    window.scenoGraph.objects.redboat = getPlaneModel('Red Boat', 'assets/page1_hq_red_boat.png', [-275, -420, -20], 0.5);
    window.scenoGraph.objects.redboat.scale.set(0.5, 0.75, 0.5);
    scene.add(window.scenoGraph.objects.redboat);

    window.scenoGraph.objects.yellowboat = getPlaneModel('Yellow Boat', 'assets/page1_hq_yellow_boat.png', [265, -550, -20], 1);
    window.scenoGraph.objects.yellowboat.scale.set(0.5, 0.75, 0.5);
    scene.add(window.scenoGraph.objects.yellowboat);

    const loader = new THREE.GLTFLoader();

    let seagullYPosition = 450;

    loader.load('assets/seagull.glb', function (gltf) {
        gltf.scene.traverse((child) => {
            if (child.type == 'SkinnedMesh') {
                const material = new THREE.MeshToonMaterial({
                    map: child.material.map
                });
                child.material = material;
                child.frustumCulled = false;
            }
        });
        const model = gltf.scene;
        model.name = 'Seagull';
        let scale = 100;
        model.scale.set(scale, scale, scale);
        model.position.set(-50, seagullYPosition, 10);
        model.rotation.set(0, Math.PI / 2, 0);
        window.scenoGraph.objects.seagull = model;

        scene.add(window.scenoGraph.objects.seagull);
        mixer = new THREE.AnimationMixer(window.scenoGraph.objects.seagull);
        mixer.clipAction(gltf.animations[9]).play();
        animateScene();
        console.log(gltf);

    }, undefined, function (error) {
        console.error(error);
    });

    // Begin animations.
    window.scenoGraph.animations = {
        // Doesn't work so well for sine waving animation
        // building: {
        //     yPosition: buildingYPosition,
        //     tween: animate({
        //         duration: 5000,
        //         onUpdate: latest => window.scenoGraph.animations.building.position = parseFloat(buildingYPosition) + parseFloat(latest),
        //         repeat: Infinity,
        //         to: [2.5, -2.5, 0],
        //     })
        // },
        seagullY: {
            position: seagullYPosition,
            tween: animate({
                duration: 5000,
                onUpdate: latest => window.scenoGraph.animations.seagullY.position = parseFloat(latest),
                repeat: Infinity,
                to: [0, 0.0125, 0, -0.0125, 0],
            })
        }

    };



    window.addEventListener('resize', onWindowResize);


    function getPlaneModel(name, imageUrl, position, scale) {
        const map = new THREE.TextureLoader().load(imageUrl);
        map.anisotropy = 16;
        map.wrapS = map.wrapT = THREE.RepeatWrapping;

        const material = new THREE.MeshPhongMaterial({ map: map, side: THREE.DoubleSide, transparent: true });
        let object = new THREE.Mesh(new THREE.PlaneGeometry(100, 100, 4, 4), material);
        object.name = name;
        object.scale.set(scale, scale, scale);

        object.position.set(position[0], position[1], position[2]);

        return object;
    }

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

        renderer.setSize(scrollWidth, scrollHeight);

    }

    function animateScene() {

        const delta = clock.getDelta();

        mixer.update(delta);

        render();

        window.requestAnimationFrame(animateScene);
    }

    function render() {

        const timer = Date.now() * 0.0001;

        camera.lookAt(scene.position);

        scene.traverse(function (object) {
            if (object.name === 'Bridge') {
                object.position.x += Math.cos(timer) * 0.0025;
                object.position.y += Math.cos(timer) * 0.015;
                object.rotation.z += Math.cos(timer) * 0.000025;
            }
            if (object.name === 'Building') {
                object.rotation.z -= Math.cos(timer) * 0.0000125;
                object.position.x += Math.cos(timer) * 0.0025;
                object.position.y += Math.cos(timer) * 0.015;
                object.position.z += Math.sin(timer) * 0.0025;
            }
            if (object.name === 'Red Boat' || object.name === 'Yellow Boat') {
                object.position.y -= Math.cos(timer) * 0.006;
                object.rotation.z -= Math.cos(timer) * 0.0000125;
            }
            if (object.name === 'Seagull') {
                object.translateY(window.scenoGraph.animations.seagullY.position);
                // object.position.x += Math.sin(timer) * 0.00125;
                // object.position.y += Math.cos(timer) * 0.00125;
                // object.position.z += Math.cos(timer) * 0.00125;
            }

        });

        renderer.render(scene, camera);

    }


    // const PARAMS = {
    //     offset: { x: 50, y: 25 },
    // };

    // const pane = new Tweakpane.Pane();
    // pane.addInput(PARAMS, 'offset');


    console.log('The page successfully loaded!');
}

docReady(init);
