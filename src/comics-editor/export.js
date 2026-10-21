import { renderComposition, waitForRenderReady } from './renderer.js';
import { serializeComposition } from './composition.js';

async function hrefToDataUri(href) {
  if (!href || href.startsWith('data:')) return href;
  try {
    const res = await fetch(href);
    if (!res.ok) return href;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    const ct = res.headers.get('content-type') || '';
    let mime = 'application/octet-stream';
    if (ct.includes('svg') || /\.svg(?:$|\?)/i.test(href)) mime = 'image/svg+xml';
    else if (ct.includes('png') || /\.png(?:$|\?)/i.test(href)) mime = 'image/png';
    else if (ct.includes('jpeg') || ct.includes('jpg') || /\.jpe?g(?:$|\?)/i.test(href)) mime = 'image/jpeg';
    else if (ct.includes('webp')) mime = 'image/webp';
    else if (ct) mime = ct.split(';')[0].trim();
    return `data:${mime};base64,${btoa(bin)}`;
  } catch (e) {
    return href;
  }
}

/** Blob-URL rasterisation cannot load same-origin /art/… nested images — embed as data URIs. */
async function materializeImageHrefs(svg) {
  const images = Array.from(svg.querySelectorAll('image'));
  const cache = new Map();
  await Promise.all(images.map(async (image) => {
    const href = image.getAttribute('href') || image.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
    if (!href || href.startsWith('data:')) return;
    if (!cache.has(href)) cache.set(href, hrefToDataUri(href));
    const data = await cache.get(href);
    image.setAttribute('href', data);
    image.setAttributeNS('http://www.w3.org/1999/xlink', 'href', data);
  }));
}

/**
 * Export PNG via canvas. Uses shared renderer.
 * @returns {Promise<{ blob: Blob, width: number, height: number }>}
 */
export async function exportPng(composition, options = {}) {
  const scale = options.scale || 2;
  const transparent = !!options.transparent;
  const width = Math.round(composition.page.width * scale);
  const height = Math.round(composition.page.height * scale);

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:0;height:0;overflow:hidden;';
  document.body.appendChild(host);

  const pageBg = composition.page.background;
  const comp = transparent
    ? Object.assign({}, composition, {
      page: Object.assign({}, composition.page, { background: 'rgba(0,0,0,0)' })
    })
    : composition;

  const svg = renderComposition(comp, host, {
    mode: 'export',
    assetBase: options.assetBase || '',
    characterDefs: options.characterDefs || {},
    svgCache: options.svgCache || {}
  });
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));

  await waitForRenderReady(svg);
  await materializeImageHrefs(svg);

  const xml = new XMLSerializer().serializeToString(svg);
  const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const image = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!transparent) {
      ctx.fillStyle = pageBg || '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(image, 0, 0, width, height);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png');
    });
    return { blob, width, height };
  } finally {
    URL.revokeObjectURL(url);
    host.remove();
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to rasterise SVG for PNG export'));
    img.src = url;
  });
}

export function exportJson(composition) {
  return serializeComposition(composition);
}

/**
 * Attempt SVG export. Reports limitations for features that may not round-trip.
 */
export function exportSvg(composition, options = {}) {
  const limitations = [];
  composition.panels.forEach((panel) => {
    panel.layers.forEach((layer) => {
      if (layer.effects && layer.effects.pulseGlow && layer.effects.pulseGlow.enabled) {
        limitations.push(`Layer ${layer.id}: pulseGlow becomes a still glow in static SVG`);
      }
      if (layer.type === 'image' && layer.src && layer.src.endsWith('.svg')) {
        limitations.push(`Layer ${layer.id}: nested SVG referenced as image (not inlined)`);
      }
    });
  });

  composition.panels.forEach((panel) => {
    panel.layers.forEach((layer) => {
      if (layer.type === 'character') {
        limitations.push(`Layer ${layer.id}: character parts referenced as nested images`);
      }
    });
  });

  const host = document.createElement('div');
  const svg = renderComposition(composition, host, {
    mode: 'export',
    assetBase: options.assetBase || '',
    characterDefs: options.characterDefs || {},
    svgCache: options.svgCache || {}
  });
  const xml = new XMLSerializer().serializeToString(svg);
  return {
    svg: `<?xml version="1.0" encoding="UTF-8"?>\n${xml}\n`,
    limitations
  };
}
