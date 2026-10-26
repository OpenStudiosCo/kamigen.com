const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PAGES = path.join(ROOT, 'src', 'pages');
const ORIGIN = 'https://kamigen.com';
const OMITTED_PAGES = new Set(['comics/page_new.pug', 'comics/composition-demo.pug']);

function walk(directory) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

function escapeXml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeAttribute(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function plainText(value) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function imageAltFromSource(source) {
  let filename;
  try {
    filename = decodeURIComponent(path.basename(source));
  } catch (error) {
    filename = path.basename(source);
  }

  const label = filename
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]01$/, '')
    .replaceAll('_', ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const page = label.match(/^Kamigen Page (\d+)$/i);
  const issue = label.match(/^Kamigen Issue (\d+) Cover$/i);
  if (page) return `Kamigen comic page ${Number(page[1])}`;
  if (issue) return `Kamigen Issue ${issue[1]} cover`;
  return label;
}

function normaliseLegacyImages(html) {
  return html.replace(/<img\b[^>]*>/gi, (image) => {
    let normalised = image.replace(/\s+target="_blank"/gi, '');
    if (/\balt\s*=/i.test(normalised)) return normalised;
    const source = normalised.match(/\bsrc="([^"]+)"/i);
    if (!source) return normalised;
    return normalised.replace(/>$/, ` alt="${escapeAttribute(imageAltFromSource(source[1]))}">`);
  });
}

function routeFromSource(relativeSource) {
  if (relativeSource === 'index.pug') return '/';
  return `/${relativeSource.replace(/\.pug$/, '.html')}`;
}

function descriptionFor(route, title) {
  const shortTitle = title.split('|')[0].trim();
  if (route === '/') {
    return 'Kamigen is a solarpunk world based around Visayan culture. Read the comics, explore the world or play the game demo.';
  }
  if (/^\/comics\/page_\d+\.html$/.test(route)) {
    return `Read Kamigen comic ${shortTitle}, with a page transcript and previous and next navigation.`;
  }
  if (/^\/comics\/(issue|cover)/.test(route)) {
    return `Read ${shortTitle} of Kamigen and continue through the comic in order.`;
  }
  if (route.startsWith('/blog/')) {
    return `${shortTitle}. Read this production update from the Kamigen team.`;
  }
  if (route.startsWith('/wiki/')) {
    return `Explore ${shortTitle} in the Kamigen world guide.`;
  }
  return `${shortTitle}. Read the Kamigen comics, explore the world and follow production updates.`;
}

function articleData(route, title) {
  const match = route.match(/^\/blog\/(\d{4})(\d{2})(\d{2})-/);
  if (!match) return '';
  const datePublished = `${match[1]}-${match[2]}-${match[3]}`;
  return `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title.split('|')[0].trim(),
    datePublished,
    mainEntityOfPage: `${ORIGIN}${route}`,
    publisher: {'@id': `${ORIGIN}/#organization`}
  })}</script>`;
}

const sources = walk(PAGES)
  .filter((file) => file.endsWith('.pug'))
  .map((file) => path.relative(PAGES, file).split(path.sep).join('/'))
  .filter((file) => !OMITTED_PAGES.has(file))
  .sort((a, b) => routeFromSource(a).localeCompare(routeFromSource(b), 'en', {numeric: true}));

for (const source of OMITTED_PAGES) {
  const output = path.join(ROOT, source.replace(/\.pug$/, '.html'));
  if (!fs.existsSync(output)) continue;
  const html = fs.readFileSync(output, 'utf8')
    .replace(
      /<meta name="robots" content="[^"]*">/i,
      '<meta name="robots" content="noindex, nofollow">'
    )
    .replace(/[ \t]+$/gm, '');
  fs.writeFileSync(output, html);
}

const routes = [];
for (const source of sources) {
  const route = routeFromSource(source);
  const output = path.join(ROOT, source.replace(/\.pug$/, '.html'));
  if (!fs.existsSync(output)) {
    throw new Error(`Expected generated page does not exist: ${output}`);
  }

  let html = fs.readFileSync(output, 'utf8');
  html = html.replace(/\s*<!-- generated-site-metadata -->[\s\S]*?<!-- \/generated-site-metadata -->\s*/g, '\n');

  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (!titleMatch) throw new Error(`Generated page has no title: ${output}`);
  const title = plainText(titleMatch[1]);
  const description = descriptionFor(route, title);
  const canonical = `${ORIGIN}${route}`;
  const article = articleData(route, title);
  const metadata = [
    '    <!-- generated-site-metadata -->',
    `    <link rel="canonical" href="${escapeAttribute(canonical)}">`,
    `    <meta property="og:url" content="${escapeAttribute(canonical)}">`,
    `    <meta property="og:title" content="${escapeAttribute(title)}">`,
    `    <meta property="og:description" content="${escapeAttribute(description)}">`,
    `    <meta name="twitter:title" content="${escapeAttribute(title)}">`,
    `    <meta name="twitter:description" content="${escapeAttribute(description)}">`,
    article ? `    ${article}` : '',
    '    <!-- /generated-site-metadata -->'
  ].filter(Boolean).join('\n');

  html = html.replace(
    /<meta name="description" content="[^"]*">/i,
    `<meta name="description" content="${escapeAttribute(description)}">`
  );
  html = html.replace(/(\s*)<\/head>/i, `\n${metadata}$1</head>`);
  html = normaliseLegacyImages(html);
  html = html.replace(/[ \t]+$/gm, '');
  fs.writeFileSync(output, html);
  routes.push(route);
}

const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...routes.map((route) => `  <url><loc>${escapeXml(`${ORIGIN}${route}`)}</loc></url>`),
  '</urlset>',
  ''
].join('\n');

fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap);
fs.writeFileSync(path.join(ROOT, 'robots.txt'), [
  'User-agent: *',
  'Allow: /',
  '',
  `Sitemap: ${ORIGIN}/sitemap.xml`,
  ''
].join('\n'));

fs.writeFileSync(path.join(ROOT, 'llms.txt'), [
  '# Kamigen',
  '',
  '> Kamigen is a solarpunk comic and game world based around Visayan culture, independently developed by Open Studios.',
  '',
  '## Main sections',
  '',
  `- [Homepage](${ORIGIN}/): Introduction and latest release`,
  `- [Comics](${ORIGIN}/comics.html): Issues and pages in reading order`,
  `- [World guide](${ORIGIN}/wiki.html): Characters, locations, lore and production material`,
  `- [Blog](${ORIGIN}/blog.html): Project news and production updates`,
  `- [Game demo](${ORIGIN}/game.html): Interactive WebGL prototype`,
  '',
  '## Machine-readable access',
  '',
  `- [XML sitemap](${ORIGIN}/sitemap.xml)`,
  '- Comic reader pages include a text transcript below each image.',
  '- Navigation and content use semantic HTML and descriptive links.',
  ''
].join('\n'));

console.log(`Added canonical metadata and generated crawler files for ${routes.length} public pages.`);
