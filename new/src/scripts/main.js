import 'keen-slider/keen-slider.min.css'
import '../styles/main.css';

import KeenSlider from 'keen-slider';

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
    console.log('The page successfully loaded!');

    let time = 0;
    let direction = 'up';

    animate(time);

    function animate(time) {
        let newTime = parseInt(time) + 1;

        var elem = document.getElementById("myDiv");
        var style = window.getComputedStyle(elem);

        let currentTop = style.marginTop.replace('px', '');

        let change = (Math.sin(newTime));

        document.getElementById("myDiv").style.marginTop = (parseFloat(currentTop) + 1 * change) + "px";
        time = newTime;
        window.requestAnimationFrame(animate)
    }

}

docReady(init);
