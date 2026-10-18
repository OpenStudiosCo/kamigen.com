(function () {
  'use strict';

  /**
   * Shared interaction layer for the Kamigen website.
   *
   * Every feature is independently initialised so content pages do not need
   * homepage-only markup. Keep the mobile breakpoint in sync with website.styl.
   */
  (function () {

    var MOBILE_BREAKPOINT = 720;

    function initNavigation() {
      var button = document.querySelector('.nav-burger');
      var menu = document.getElementById('primary-navigation');
      var main = document.querySelector('main');
      var footer = document.querySelector('.site-foot');
      if (!button || !menu) { return; }

      Array.prototype.forEach.call(menu.querySelectorAll('a'), function (link) {
        var href = link.getAttribute('href');
        var path = window.location.pathname;
        var current =
          (href === '/comics.html' && /^\/comics(?:\.html|\/)/.test(path)) ||
          (href === '/game.html' && /^\/game2?\.html$/.test(path)) ||
          (href === '/wiki.html' && /^\/wiki(?:\.html|\/)/.test(path)) ||
          (href === '/blog.html' && /^\/blog(?:\.html|\/)/.test(path));
        if (current) { link.setAttribute('aria-current', 'page'); }
      });

      function focusableHeaderItems() {
        return Array.prototype.filter.call(
          document.querySelectorAll('.mast a[href], .mast button:not([disabled])'),
          function (item) {
            return item.getClientRects().length > 0;
          }
        );
      }

      function closeMenu(returnFocus) {
        menu.classList.remove('is-open');
        button.setAttribute('aria-expanded', 'false');
        button.textContent = 'Menu';
        document.body.classList.remove('menu-open');
        if (main) { main.inert = false; }
        if (footer) { footer.inert = false; }
        if (returnFocus) { button.focus(); }
      }

      button.addEventListener('click', function () {
        var open = !menu.classList.contains('is-open');
        menu.classList.toggle('is-open', open);
        button.setAttribute('aria-expanded', String(open));
        button.textContent = open ? 'Close' : 'Menu';
        document.body.classList.toggle('menu-open', open);
        if (main) { main.inert = open; }
        if (footer) { footer.inert = open; }
        if (open) { menu.querySelector('a').focus(); }
      });

      menu.addEventListener('click', function (event) {
        if (event.target.closest('a')) { closeMenu(false); }
      });
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && menu.classList.contains('is-open')) {
          closeMenu(true);
        }
        if (event.key === 'Tab' && menu.classList.contains('is-open')) {
          var items = focusableHeaderItems();
          var first = items[0];
          var last = items[items.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      });
      window.addEventListener('resize', function () {
        if (window.innerWidth > MOBILE_BREAKPOINT) { closeMenu(false); }
      });
    }

    function initHeroMotion() {
      var opening = document.querySelector('.opening');
      var button = document.querySelector('.hero-pause');
      if (!opening || !button) { return; }

      button.addEventListener('click', function () {
        var paused = opening.classList.toggle('scene-paused');
        button.setAttribute('aria-pressed', String(paused));
        button.textContent = paused ? 'Resume motion' : 'Pause motion';
      });
    }

    function initIslandView() {
      var shot = document.querySelector('.world .shot');
      var frame = document.querySelector('.world .island-frame');
      var liveButton = document.querySelector('[data-view="live"]');
      var shotButton = document.querySelector('[data-view="shot"]');
      if (!shot || !frame || !liveButton || !shotButton) { return; }

      var loading = false;
      var timer;

      function showShot(message) {
        window.clearInterval(timer);
        loading = false;
        shot.hidden = false;
        frame.classList.remove('is-ready');
        frame.hidden = true;
        // Clearing srcdoc stops requestAnimationFrame and releases WebGL.
        frame.srcdoc = '<!doctype html><title>3D island paused</title>';
        shotButton.setAttribute('aria-pressed', 'true');
        liveButton.setAttribute('aria-pressed', 'false');
        liveButton.removeAttribute('aria-busy');
        liveButton.textContent = message || 'See it moving';
      }

      function islandDocument() {
        var vertexNode = document.getElementById('landVertexShader');
        var fragmentNode = document.getElementById('landFragmentShader');
        if (!vertexNode || !fragmentNode) { return ''; }
        var end = '</scr' + 'ipt>';
        return '<!doctype html><html><head><base href="' + window.location.href + '">' +
          '<style>html,body{margin:0;height:100%;overflow:hidden;background:transparent}' +
          'body{display:block}#jumbotron{width:100%;height:100%}' +
          'canvas{display:block;width:100%!important;height:100%!important}</style></head><body>' +
          '<div id="jumbotron"></div>' +
          '<script id="landVertexShader" type="x-shader/x-vertex">' + vertexNode.textContent + end +
          '<script id="landFragmentShader" type="x-shader/x-fragment">' + fragmentNode.textContent + end +
          '<script src="https://cdnjs.cloudflare.com/ajax/libs/tween.js/17.4.0/Tween.min.js">' + end +
          '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r116/three.min.js">' + end +
          '<script src="/vendor/Water.js">' + end +
          '<script src="/vendor/Sky.js">' + end +
          '<script src="/dist/jumbotron.js">' + end +
          '</body></html>';
      }

      shotButton.addEventListener('click', function () {
        showShot();
      });

      liveButton.addEventListener('click', function () {
        if (loading || frame.classList.contains('is-ready')) { return; }
        var documentSource = islandDocument();
        if (!documentSource) {
          showShot('Live view unavailable');
          return;
        }

        loading = true;
        liveButton.textContent = 'Loading the island…';
        liveButton.setAttribute('aria-busy', 'true');
        frame.hidden = false;
        frame.srcdoc = documentSource;
        var attempts = 0;
        window.clearInterval(timer);
        timer = window.setInterval(function () {
          var canvas;
          attempts += 1;
          try {
            canvas = frame.contentDocument.querySelector('canvas');
          } catch (error) {
            canvas = null;
          }
          if (canvas) {
            window.clearInterval(timer);
            frame.classList.add('is-ready');
            shot.hidden = true;
            shotButton.setAttribute('aria-pressed', 'false');
            liveButton.setAttribute('aria-pressed', 'true');
            liveButton.removeAttribute('aria-busy');
            liveButton.textContent = 'See it moving';
            loading = false;
          } else if (attempts > 80) {
            showShot('Could not load the live view');
          }
        }, 100);
      });

      frame.addEventListener('error', function () {
        showShot('Could not load the live view');
      });
    }

    function initBlogLightbox() {
      if (!/^\/blog\//.test(window.location.pathname)) { return; }

      var images = Array.prototype.slice.call(document.querySelectorAll('.prose img'));
      if (!images.length) { return; }

      var dialog = document.createElement('dialog');
      dialog.className = 'image-lightbox';
      dialog.setAttribute('aria-label', 'Image preview');
      dialog.innerHTML =
        '<button class="lightbox-close" type="button" aria-label="Close image preview">Close</button>' +
        '<figure><img alt=""><figcaption></figcaption></figure>';
      document.body.appendChild(dialog);

      var preview = dialog.querySelector('img');
      var caption = dialog.querySelector('figcaption');
      var closeButton = dialog.querySelector('.lightbox-close');
      var activeTrigger;

      function closeLightbox() {
        if (!dialog.open) { return; }
        dialog.close();
        if (activeTrigger) { activeTrigger.focus(); }
      }

      images.forEach(function (image) {
        var trigger = document.createElement('button');
        var imageLink = image.parentElement && image.parentElement.tagName === 'A' ?
          image.parentElement : null;
        var description = image.alt || 'article image';
        trigger.type = 'button';
        trigger.className = 'lightbox-trigger';
        trigger.setAttribute('aria-label', 'View larger: ' + description);
        if (imageLink) {
          imageLink.parentNode.insertBefore(trigger, imageLink);
        } else {
          image.parentNode.insertBefore(trigger, image);
        }
        trigger.appendChild(image);
        if (imageLink) { imageLink.remove(); }

        trigger.addEventListener('click', function () {
          activeTrigger = trigger;
          preview.src = image.currentSrc || image.src;
          preview.alt = image.alt;
          caption.textContent = image.alt;
          caption.hidden = !image.alt;
          dialog.showModal();
          closeButton.focus();
        });
      });

      closeButton.addEventListener('click', closeLightbox);
      dialog.addEventListener('cancel', function (event) {
        event.preventDefault();
        closeLightbox();
      });
      dialog.addEventListener('click', function (event) {
        if (event.target === dialog) { closeLightbox(); }
      });
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && dialog.open) {
          event.preventDefault();
          closeLightbox();
        }
      });
    }

    initNavigation();
    initHeroMotion();
    initIslandView();
    initBlogLightbox();
  }());

})();
//# sourceMappingURL=site.js.map
