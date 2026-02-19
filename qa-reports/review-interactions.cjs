const { chromium } = require('/home/james/hackathons/blockchain-wiki/node_modules/playwright');
const path = require('path');

const SCREENSHOT_DIR = '/home/james/hackathons/blockchain-wiki/qa-reports/screenshots/01-homepage';

async function reviewInteractions() {
  const browser = await chromium.launch({ headless: true });

  // Test 1: Click on learning path cards on homepage
  console.log('=== Testing Learning Path Card Expansion ===');
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:4321/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Find path cards with expand buttons (the chevrons)
  const expandButtons = await page.$$('[class*="path"] button, [class*="card"] button, details summary, [class*="expand"], [class*="chevron"]');
  console.log(`Found ${expandButtons.length} expand buttons`);

  // Try clicking the first path card
  const pathSections = await page.$$('section, [class*="path"], [class*="card"]');
  for (let i = 0; i < pathSections.length; i++) {
    const text = await pathSections[i].textContent().catch(() => '');
    if (text.includes('0%')) {
      try {
        await pathSections[i].click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `homepage-path-card-clicked-${i}.png`) });
        console.log(`Clicked path card ${i}, screenshot taken`);
        break;
      } catch (e) {
        console.log(`Could not click path card ${i}: ${e.message}`);
      }
    }
  }

  // Test 2: Try clicking the "start learning" CTA
  console.log('\n=== Testing CTA Button ===');
  const ctaLink = await page.$('a[href*="transaction-lifecycle"]');
  if (ctaLink) {
    const ctaText = await ctaLink.textContent();
    const ctaHref = await ctaLink.getAttribute('href');
    console.log(`CTA: "${ctaText.trim()}" -> ${ctaHref}`);
  }

  // Test 3: Check Knowledge Graph on /graph/ page - try category filter buttons
  console.log('\n=== Testing Graph Category Filters ===');
  const graphPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await graphPage.goto('http://localhost:4321/graph/', { waitUntil: 'networkidle', timeout: 30000 });
  await graphPage.waitForTimeout(3000);

  const filterButtons = await graphPage.$$('button');
  console.log(`Found ${filterButtons.length} buttons on graph page`);
  for (let i = 0; i < filterButtons.length; i++) {
    const text = await filterButtons[i].textContent().catch(() => '');
    const visible = await filterButtons[i].isVisible().catch(() => false);
    console.log(`  Button ${i}: "${text.trim()}" visible=${visible}`);

    if (visible && text.trim().length > 0 && i < 10) {
      try {
        await filterButtons[i].click();
        await graphPage.waitForTimeout(1000);
        await graphPage.screenshot({ path: path.join(SCREENSHOT_DIR, `graph-filter-${i}-${text.trim().substring(0, 10)}.png`) });
        console.log(`    -> Clicked and screenshotted`);
      } catch (e) {
        console.log(`    -> Click failed: ${e.message.substring(0, 80)}`);
      }
    }
  }

  // Test 4: Check if paths page cards are clickable/expandable
  console.log('\n=== Testing Paths Page Card Interaction ===');
  const pathsPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await pathsPage.goto('http://localhost:4321/paths/', { waitUntil: 'networkidle', timeout: 30000 });
  await pathsPage.waitForTimeout(2000);

  // Look for expandable elements
  const allClickables = await pathsPage.evaluate(() => {
    const elements = document.querySelectorAll('[class*="path"], [class*="card"], details, [role="button"]');
    return Array.from(elements).map(el => ({
      tag: el.tagName,
      class: el.className,
      text: el.textContent.trim().substring(0, 60),
      clickable: el.onclick !== null || el.tagName === 'DETAILS' || el.tagName === 'BUTTON'
    }));
  });
  console.log('Expandable elements on paths page:', JSON.stringify(allClickables, null, 2));

  // Try clicking first path card with chevron
  const chevrons = await pathsPage.$$('svg, [class*="chevron"], [class*="arrow"], [class*="expand"]');
  console.log(`Found ${chevrons.length} chevron/arrow elements`);

  // Check for font rendering issues
  console.log('\n=== Checking Font Rendering ===');
  const fontCheck = await page.evaluate(() => {
    const body = document.body;
    const style = getComputedStyle(body);
    return {
      fontFamily: style.fontFamily,
      direction: style.direction,
      lang: document.documentElement.lang,
    };
  });
  console.log('Font info:', JSON.stringify(fontCheck));

  // Test 5: Search functionality
  console.log('\n=== Testing Search ===');
  await page.goto('http://localhost:4321/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);

  // Click search
  const searchBtn = await page.$('button:has-text("搜索"), [class*="search"]');
  if (searchBtn) {
    await searchBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'search-opened.png') });
    console.log('Search dialog opened');

    // Type something
    await page.keyboard.type('Ethereum');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'search-typing.png') });
    console.log('Typed "Ethereum" in search');
  }

  await browser.close();
  console.log('\n=== INTERACTION TESTS COMPLETE ===');
}

reviewInteractions().catch(console.error);
