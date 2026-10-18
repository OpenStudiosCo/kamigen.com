import buble from 'rollup-plugin-buble';
import pug from 'rollup-plugin-pug';

export default [
  {
    external: [ 'jQuery', 'dat', 'THREE', 'TWEEN' ],
    input: 'src/app.js',
    output: {
      name: 'Kamigen',
      file: 'dist/app.js',
      format: 'iife',
      sourcemap: true,
      globals: {
        jQuery: 'jQuery',
        dat: 'dat',
        THREE: 'THREE',
        TWEEN: 'TWEEN'
      }
    },
    plugins: [
      pug(),
      buble()
    ]
  },
  {
    input: 'src/game.js',
    output: {
      name: 'Kamigen',
      file: 'dist/game.js',
      format: 'iife',
      sourcemap: true
    },
    plugins: [
      buble()
    ]
  },
  {
    input: 'src/site.js',
    output: {
      name: 'KamigenSite',
      file: 'dist/site.js',
      format: 'iife',
      sourcemap: true
    },
    plugins: [
      buble()
    ]
  },
  {
    input: 'src/jumbotron.js',
    output: {
      name: 'KamigenIsland',
      file: 'dist/jumbotron.js',
      format: 'iife',
      sourcemap: true
    },
    plugins: [
      buble()
    ]
  }
];
