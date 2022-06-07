import 'keen-slider/keen-slider.min.css'
import '../styles/main.css';

import KeenSlider from 'keen-slider';

document.addEventListener('DOMContentLoaded', init);

function init() {
    console.log('The page successfully loaded!');

    // Comics Slider
    new KeenSlider(
        '#comic-slider', {
            slides: {
                origin: "center",
                perView: 2,
                spacing: 15
            },
        },
        [
            // add plugins here
        ]
    );

    // Character Slider
    let character_slider = new KeenSlider('#character-slider', {
            slides: {
                perView: 1
            },
        }
    );
    new KeenSlider(
        '#character-thumbnails', {
            initial: 0,
            slides: {
                perView: 5,
                spacing: 5,
            },
            breakpoints: {
                '(min-width: 1280px)': {
                    slides: {
                        perView: 8,
                        spacing: 10,
                    },
                },
            }
            
        },
        [ ThumbnailPlugin(character_slider) ]
    );
}

function ThumbnailPlugin(main) {
    return (slider) => {
        function removeActive() {
            slider.slides.forEach((slide) => {
                slide.classList.remove("active")
            })
        }

        function addActive(idx) {
            slider.slides[idx].classList.add("active")
        }

        function addClickEvents() {
            slider.slides.forEach((slide, idx) => {
                slide.addEventListener("click", () => {
                    main.moveToIdx(idx)
                })
            })
        }

        slider.on("created", () => {
            addActive(slider.track.details.rel)
            addClickEvents()
            main.on("animationStarted", (main) => {
                removeActive()
                const next = main.animator.targetIdx || 0
                addActive(main.track.absToRel(next))
                slider.moveToIdx(next)
            })
        })
    }
}