/**
 * Kamigen Browser Application
 * 
 * @TODO: Replace game.js and jumbotron.js
 */

// External libs
import $ from 'jQuery';

// Internal libs
import Scenograph from './app/scenograph.js';

// Setup the main App class.
export default class App {
  constructor() {
    this.scenograph = new Scenograph();
  }
}

// Run App using jQuery.ready()
$(() => {
  window.app = new App();

  // Run all the ready functions
  for (var classInstance in app) {
    if (app[classInstance].ready) {
      app[classInstance].ready();
    }
  }
});
