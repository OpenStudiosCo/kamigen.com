import {
  parseComposition,
  listCharacterRigPaths
} from './comics-editor/composition.js';
import {
  renderComposition,
  buildTranscriptHtml,
  waitForRenderReady
} from './comics-editor/renderer.js';

async function loadCharacterDefs(composition) {
  const defs = {};
  const paths = listCharacterRigPaths(composition);
  await Promise.all(paths.map(async (rigSrc) => {
    const res = await fetch(`/${rigSrc.replace(/^\//, '')}`);
    if (!res.ok) return;
    const def = await res.json();
    defs[def.id] = def;
    defs[rigSrc] = def;
  }));
  return defs;
}

async function boot() {
  const mount = document.getElementById('kce-mount');
  if (!mount) return;
  const transcriptHost = document.getElementById('kce-transcript');
  const url = mount.getAttribute('data-composition-url') || '/art/comics/compositions/demo-sample.json';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not load ${url}`);
    const composition = parseComposition(await res.text());
    const characterDefs = await loadCharacterDefs(composition);
    mount.innerHTML = '';
    const svg = renderComposition(composition, mount, {
      mode: 'reader',
      assetBase: '',
      characterDefs
    });
    await waitForRenderReady(svg);
    if (transcriptHost) {
      transcriptHost.innerHTML = '';
      transcriptHost.appendChild(buildTranscriptHtml(composition));
    }
  } catch (error) {
    mount.innerHTML = `<p class="kce-error">Failed to render composition: ${error.message}</p>`;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

export { parseComposition, renderComposition, buildTranscriptHtml, waitForRenderReady };
