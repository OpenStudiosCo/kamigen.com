import 'keen-slider/keen-slider.min.css'
import '../styles/main.css';

import KeenSlider from 'keen-slider';

document.addEventListener('DOMContentLoaded', init);

function init() {
	console.log('The page successfully loaded!');
	var slider = new KeenSlider(
		'#comic-slider', {
			mode: "free-snap",
			breakpoints: {
				'(max-width: 768px)': {
					slides: {
						origin: "center",
						perView: 2,
						spacing: 15,
					},
				},
				'(min-width: 768px)': {
					slides: {
						origin: "center",
						perView: 3,
						spacing: 30,
					},
				},
			},
			slides: {
				origin: "center",
			},
		},
		[
			// add plugins here
		]
	);
}