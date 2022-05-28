import 'keen-slider/keen-slider.min.css'
import '../styles/main.css';

import KeenSlider from 'keen-slider';

document.addEventListener('DOMContentLoaded', init);

function init() {
	console.log('The page successfully loaded!');
	var slider = new KeenSlider(
		'#comic-slider', {
			loop: false,
			mode: "free-snap",
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
}