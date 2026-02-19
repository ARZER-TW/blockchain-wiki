const { chromium } = require('/home/james/hackathons/blockchain-wiki/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = '/home/james/hackathons/blockchain-wiki/qa-reports/screenshots/01-homepage';

async function reviewPages() {
  const results = {
    homepage: { desktop: {}, mobile: {}, content: {}, links: [], consoleErrors: [], interactions: [] },
    graph: { desktop: {}, mobile: {}, content: {}, links: [], consoleErrors: [], interactions: [] },
    paths: { desktop: {}, mobile: {}, content: {}, links: [], consoleErrors: [], interactions: [] },
  };

  const browser = await chromium.launch({ headless: true });

  // ============ HOMEPAGE ============
  console.log('\n=== REVIEWING HOMEPAGE ===');

  // Desktop
  const homePage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const homeConsoleErrors = [];
  homePage.on('console', msg => {
    if (msg.type() === 'error') homeConsoleErrors.push(msg.text());
  });

  await homePage.goto('http://localhost:4321/', { waitUntil: 'networkidle', timeout: 30000 });
  await homePage.waitForTimeout(2000);
  await homePage.screenshot({ path: path.join(SCREENSHOT_DIR, 'homepage-desktop-full.png'), fullPage: true });
  await homePage.screenshot({ path: path.join(SCREENSHOT_DIR, 'homepage-desktop-above-fold.png') });

  // Get homepage content
  const homeContent = await homePage.innerText('body').catch(() => 'FAILED TO GET CONTENT');
  results.homepage.content.bodyText = homeContent;
  results.homepage.consoleErrors = homeConsoleErrors;

  // Collect all links
  const homeLinks = await homePage.evaluate(() => {
    return Array.from(document.querySelectorAll('a')).map(a => ({
      href: a.href,
      text: a.textContent.trim().substring(0, 100),
      visible: a.offsetParent !== null
    }));
  });
  results.homepage.links = homeLinks;

  // Check page structure
  const homeStructure = await homePage.evaluate(() => {
    return {
      title: document.title,
      h1: Array.from(document.querySelectorAll('h1')).map(h => h.textContent.trim()),
      h2: Array.from(document.querySelectorAll('h2')).map(h => h.textContent.trim()),
      nav: document.querySelector('nav') !== null,
      main: document.querySelector('main') !== null,
      footer: document.querySelector('footer') !== null,
      images: Array.from(document.querySelectorAll('img')).map(img => ({
        src: img.src,
        alt: img.alt,
        loaded: img.complete && img.naturalWidth > 0
      })),
      buttons: Array.from(document.querySelectorAll('button, a[role="button"], .btn')).map(b => b.textContent.trim().substring(0, 50)),
      metaDescription: document.querySelector('meta[name="description"]')?.content || 'NONE',
    };
  });
  results.homepage.desktop.structure = homeStructure;

  // Try clicking CTA buttons
  const ctaButtons = await homePage.$$('a[href*="path"], a[href*="learn"], a[href*="start"], button');
  for (let i = 0; i < Math.min(ctaButtons.length, 5); i++) {
    try {
      const btnText = await ctaButtons[i].textContent();
      const btnHref = await ctaButtons[i].getAttribute('href');
      results.homepage.interactions.push({ button: btnText.trim(), href: btnHref });
    } catch (e) {}
  }

  // Mobile
  const homeMobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await homeMobile.goto('http://localhost:4321/', { waitUntil: 'networkidle', timeout: 30000 });
  await homeMobile.waitForTimeout(2000);
  await homeMobile.screenshot({ path: path.join(SCREENSHOT_DIR, 'homepage-mobile-full.png'), fullPage: true });
  await homeMobile.screenshot({ path: path.join(SCREENSHOT_DIR, 'homepage-mobile-above-fold.png') });

  // Check mobile nav
  const mobileNav = await homeMobile.evaluate(() => {
    const hamburger = document.querySelector('[class*="menu"], [class*="hamburger"], [aria-label*="menu"], button[class*="mobile"]');
    return {
      hasHamburger: hamburger !== null,
      hamburgerVisible: hamburger ? hamburger.offsetParent !== null : false,
      bodyOverflowX: getComputedStyle(document.body).overflowX,
      viewportFits: document.documentElement.scrollWidth <= 375,
    };
  });
  results.homepage.mobile = mobileNav;

  await homeMobile.close();
  await homePage.close();

  // ============ KNOWLEDGE GRAPH ============
  console.log('\n=== REVIEWING KNOWLEDGE GRAPH ===');

  const graphPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const graphConsoleErrors = [];
  graphPage.on('console', msg => {
    if (msg.type() === 'error') graphConsoleErrors.push(msg.text());
  });

  await graphPage.goto('http://localhost:4321/graph/', { waitUntil: 'networkidle', timeout: 30000 });
  await graphPage.waitForTimeout(3000); // extra time for graph to render
  await graphPage.screenshot({ path: path.join(SCREENSHOT_DIR, 'graph-desktop-full.png'), fullPage: true });

  const graphContent = await graphPage.innerText('body').catch(() => 'FAILED TO GET CONTENT');
  results.graph.content.bodyText = graphContent;
  results.graph.consoleErrors = graphConsoleErrors;

  // Check for canvas/SVG elements (graph rendering)
  const graphStructure = await graphPage.evaluate(() => {
    return {
      title: document.title,
      hasCanvas: document.querySelector('canvas') !== null,
      hasSVG: document.querySelector('svg') !== null,
      h1: Array.from(document.querySelectorAll('h1')).map(h => h.textContent.trim()),
      h2: Array.from(document.querySelectorAll('h2')).map(h => h.textContent.trim()),
      graphNodes: document.querySelectorAll('[class*="node"], circle, [data-node]').length,
      graphLinks: document.querySelectorAll('[class*="link"], line, [data-link]').length,
      hasLegend: document.querySelector('[class*="legend"]') !== null,
      hasControls: document.querySelector('[class*="control"], [class*="zoom"]') !== null,
    };
  });
  results.graph.desktop.structure = graphStructure;

  // Try interacting with the graph
  // Click on nodes if present
  const graphNodes = await graphPage.$$('circle, [class*="node"], [data-node]');
  console.log(`Found ${graphNodes.length} graph nodes`);
  for (let i = 0; i < Math.min(graphNodes.length, 3); i++) {
    try {
      await graphNodes[i].click();
      await graphPage.waitForTimeout(500);
      await graphPage.screenshot({ path: path.join(SCREENSHOT_DIR, `graph-node-click-${i}.png`) });
      results.graph.interactions.push({ action: `clicked node ${i}`, success: true });
    } catch (e) {
      results.graph.interactions.push({ action: `clicked node ${i}`, success: false, error: e.message });
    }
  }

  // Try zoom/drag interactions
  try {
    const graphContainer = await graphPage.$('canvas, svg, [class*="graph"]');
    if (graphContainer) {
      const box = await graphContainer.boundingBox();
      if (box) {
        // Try mouse wheel zoom
        await graphPage.mouse.move(box.x + box.width/2, box.y + box.height/2);
        await graphPage.mouse.wheel(0, -200);
        await graphPage.waitForTimeout(500);
        await graphPage.screenshot({ path: path.join(SCREENSHOT_DIR, 'graph-after-zoom.png') });
        results.graph.interactions.push({ action: 'zoom in', success: true });

        // Try drag
        await graphPage.mouse.move(box.x + box.width/2, box.y + box.height/2);
        await graphPage.mouse.down();
        await graphPage.mouse.move(box.x + box.width/2 + 100, box.y + box.height/2 + 50, { steps: 10 });
        await graphPage.mouse.up();
        await graphPage.waitForTimeout(500);
        await graphPage.screenshot({ path: path.join(SCREENSHOT_DIR, 'graph-after-drag.png') });
        results.graph.interactions.push({ action: 'drag', success: true });
      }
    }
  } catch (e) {
    results.graph.interactions.push({ action: 'zoom/drag', success: false, error: e.message });
  }

  // Graph Mobile
  const graphMobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await graphMobile.goto('http://localhost:4321/graph/', { waitUntil: 'networkidle', timeout: 30000 });
  await graphMobile.waitForTimeout(3000);
  await graphMobile.screenshot({ path: path.join(SCREENSHOT_DIR, 'graph-mobile-full.png'), fullPage: true });

  const graphMobileInfo = await graphMobile.evaluate(() => {
    return {
      viewportFits: document.documentElement.scrollWidth <= 375,
      graphVisible: (() => {
        const el = document.querySelector('canvas, svg, [class*="graph"]');
        return el ? el.offsetParent !== null : false;
      })(),
    };
  });
  results.graph.mobile = graphMobileInfo;

  await graphMobile.close();
  await graphPage.close();

  // ============ LEARNING PATHS ============
  console.log('\n=== REVIEWING LEARNING PATHS ===');

  const pathsPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pathsConsoleErrors = [];
  pathsPage.on('console', msg => {
    if (msg.type() === 'error') pathsConsoleErrors.push(msg.text());
  });

  await pathsPage.goto('http://localhost:4321/paths/', { waitUntil: 'networkidle', timeout: 30000 });
  await pathsPage.waitForTimeout(2000);
  await pathsPage.screenshot({ path: path.join(SCREENSHOT_DIR, 'paths-desktop-full.png'), fullPage: true });

  const pathsContent = await pathsPage.innerText('body').catch(() => 'FAILED TO GET CONTENT');
  results.paths.content.bodyText = pathsContent;
  results.paths.consoleErrors = pathsConsoleErrors;

  const pathsStructure = await pathsPage.evaluate(() => {
    return {
      title: document.title,
      h1: Array.from(document.querySelectorAll('h1')).map(h => h.textContent.trim()),
      h2: Array.from(document.querySelectorAll('h2')).map(h => h.textContent.trim()),
      h3: Array.from(document.querySelectorAll('h3')).map(h => h.textContent.trim()),
      pathCards: document.querySelectorAll('[class*="card"], [class*="path"]').length,
      links: Array.from(document.querySelectorAll('a')).map(a => ({
        href: a.href,
        text: a.textContent.trim().substring(0, 80),
      })),
    };
  });
  results.paths.desktop.structure = pathsStructure;

  // Click on path cards
  const pathCards = await pathsPage.$$('[class*="card"], [class*="path"] a, main a');
  for (let i = 0; i < Math.min(pathCards.length, 6); i++) {
    try {
      const text = await pathCards[i].textContent();
      const href = await pathCards[i].getAttribute('href');
      results.paths.interactions.push({ card: text.trim().substring(0, 50), href: href });
    } catch (e) {}
  }

  // Paths Mobile
  const pathsMobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await pathsMobile.goto('http://localhost:4321/paths/', { waitUntil: 'networkidle', timeout: 30000 });
  await pathsMobile.waitForTimeout(2000);
  await pathsMobile.screenshot({ path: path.join(SCREENSHOT_DIR, 'paths-mobile-full.png'), fullPage: true });

  const pathsMobileInfo = await pathsMobile.evaluate(() => {
    return {
      viewportFits: document.documentElement.scrollWidth <= 375,
      cardsStacked: (() => {
        const cards = document.querySelectorAll('[class*="card"], [class*="path"]');
        if (cards.length < 2) return 'N/A';
        const firstRect = cards[0].getBoundingClientRect();
        const secondRect = cards[1].getBoundingClientRect();
        return secondRect.top > firstRect.bottom; // stacked vertically
      })(),
    };
  });
  results.paths.mobile = pathsMobileInfo;

  await pathsMobile.close();
  await pathsPage.close();

  // ============ LINK VALIDATION ============
  console.log('\n=== VALIDATING LINKS ===');

  const allLinks = new Set();
  [...results.homepage.links, ...results.paths.desktop.structure.links].forEach(l => {
    if (l.href && l.href.startsWith('http://localhost:4321')) {
      allLinks.add(l.href);
    }
  });

  const linkResults = [];
  const linkPage = await browser.newPage();
  for (const link of allLinks) {
    try {
      const response = await linkPage.goto(link, { waitUntil: 'domcontentloaded', timeout: 10000 });
      const status = response ? response.status() : 'NO_RESPONSE';
      linkResults.push({ url: link, status: status, ok: status === 200 });
      if (status !== 200) {
        console.log(`[BROKEN] ${link} -> ${status}`);
      }
    } catch (e) {
      linkResults.push({ url: link, status: 'ERROR', ok: false, error: e.message });
      console.log(`[ERROR] ${link} -> ${e.message}`);
    }
  }
  await linkPage.close();

  results.linkValidation = linkResults;

  await browser.close();

  // Write raw results
  fs.writeFileSync(
    path.join(SCREENSHOT_DIR, 'raw-results.json'),
    JSON.stringify(results, null, 2)
  );

  console.log('\n=== REVIEW COMPLETE ===');
  console.log(`Screenshots saved to: ${SCREENSHOT_DIR}`);
  console.log(`Total links checked: ${linkResults.length}`);
  console.log(`Broken links: ${linkResults.filter(l => !l.ok).length}`);

  return results;
}

reviewPages().catch(console.error);
