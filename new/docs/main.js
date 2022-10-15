(function () {
    'use strict';

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

        var time = 0;

        animate(time);

        function animate(time) {
            var newTime = parseInt(time) + 1;

            var elem = document.getElementById("myDiv");
            var style = window.getComputedStyle(elem);

            var currentTop = style.marginTop.replace('px', '');

            var change = (Math.sin(newTime));

            document.getElementById("myDiv").style.marginTop = (parseFloat(currentTop) + 1 * change) + "px";
            time = newTime;
            window.requestAnimationFrame(animate);
        }

    }

    docReady(init);

})();
