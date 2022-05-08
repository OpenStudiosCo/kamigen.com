import buble from 'rollup-plugin-buble';
import pug from 'rollup-plugin-pug';

export default {
  external: [ 'jQuery', 'dat', 'THREE', 'TWEEN' ],
  input: 'src/app.js',
  output: {
    name: 'Kamigen',
  	file: 'docs/app.js',
  	format: 'iife',
    sourcemap: true,
    globals: {
      // jQuery: 'jQuery',
      // dat: 'dat',
      // THREE: 'THREE',
      // TWEEN: 'TWEEN'
    }
  },
  plugins: [
    pug(),
    buble()
  ]
};
