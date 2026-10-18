const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'https://kamigen.com';
const SITEMAP_NAMESPACE = 'http://www.sitemaps.org/schemas/sitemap/0.9';

function outputForUrl(url) {
  const pathname = new URL(url).pathname;
  if (pathname === '/') return path.join(ROOT, 'index.html');
  return path.join(ROOT, decodeURIComponent(pathname.slice(1)));
}

function localTarget(reference) {
  if (/^(?:#|mailto:|tel:|javascript:|data:)/i.test(reference)) return null;
  const url = new URL(reference, `${ORIGIN}/`);
  if (url.origin !== ORIGIN) return null;
  const pathname = decodeURIComponent(url.pathname);
  return path.join(ROOT, pathname === '/' ? 'index.html' : pathname.slice(1));
}

function matches(html, expression) {
  return Array.from(html.matchAll(expression), (match) => match[1]);
}

const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
if (!sitemap.includes(SITEMAP_NAMESPACE)) {
  throw new Error('sitemap.xml does not declare the sitemap namespace');
}

const urls = matches(sitemap, /<loc>([^<]+)<\/loc>/g);
const errors = [];

for (const url of urls) {
  const output = outputForUrl(url);
  if (!fs.existsSync(output)) {
    errors.push(`${url}: generated page is missing`);
    continue;
  }

  const html = fs.readFileSync(output, 'utf8');
  const canonical = matches(html, /<link rel="canonical" href="([^"]+)">/g);
  if (canonical.length !== 1 || canonical[0] !== url) {
    errors.push(`${url}: canonical URL is missing, duplicated or incorrect`);
  }
  if (!/<title>\s*\S[\s\S]*?<\/title>/i.test(html)) {
    errors.push(`${url}: document title is missing`);
  }
  if (!/<meta name="description" content="\S[^"]*">/i.test(html)) {
    errors.push(`${url}: meta description is missing`);
  }

  const ids = matches(html, /\sid="([^"]+)"/g);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length) {
    errors.push(`${url}: duplicate IDs: ${Array.from(new Set(duplicateIds)).join(', ')}`);
  }

  const images = html.match(/<img\b[^>]*>/gi) || [];
  for (const image of images) {
    if (!/\balt\s*=/i.test(image)) {
      errors.push(`${url}: image is missing alt text`);
    }
  }

  const references = [
    ...matches(html, /<(?:a|link)\b[^>]*\shref="([^"]+)"/gi),
    ...matches(html, /<(?:img|script|iframe)\b[^>]*\ssrc="([^"]+)"/gi)
  ];
  for (const reference of references) {
    const target = localTarget(reference);
    if (target && !fs.existsSync(target)) {
      errors.push(`${url}: missing local target ${reference}`);
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Validated ${urls.length} public pages, their metadata and local targets.`);
}
