const { chromium } = require('/home/james/hackathons/blockchain-wiki/node_modules/playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // Page 14: Account Diagram
  console.log('=== PAGE 14: Account Diagram ===');
  await page.goto('http://localhost:4321/ethereum/visualize/account-diagram/', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);

  const title14 = await page.title();
  const content14 = await page.innerText('main').catch(() => 'NO MAIN');
  const headings14 = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('main h1, main h2, main h3')).map(e => e.tagName + ': ' + e.textContent);
  });
  const buttons14 = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('main button')).map(e => e.textContent.trim());
  });
  const svgCount14 = await page.evaluate(() => document.querySelectorAll('main svg').length);
  const tabCount14 = await page.evaluate(() => document.querySelectorAll('main [role="tab"], main [data-tab]').length);

  console.log('Title:', title14);
  console.log('Headings:', JSON.stringify(headings14));
  console.log('Buttons:', JSON.stringify(buttons14));
  console.log('SVGs:', svgCount14, '| Tabs:', tabCount14);
  console.log('Content:');
  console.log(content14);

  // Test interactions for Account Diagram
  console.log('\n--- Testing Interactions ---');
  const allButtons14 = await page.locator('main button').all();
  for (let btn of allButtons14) {
    const text = await btn.textContent();
    const isVisible = await btn.isVisible();
    if (isVisible) {
      try {
        await btn.click();
        await page.waitForTimeout(800);
        console.log('Clicked button: "' + text.trim() + '" - OK');
      } catch (e) {
        console.log('Clicked button: "' + text.trim() + '" - FAILED: ' + e.message);
      }
    }
  }

  console.log('---END PAGE 14---\n');

  // Page 15: Comparison Table
  console.log('=== PAGE 15: Comparison Table ===');
  await page.goto('http://localhost:4321/ethereum/visualize/comparison-table/', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);

  const title15 = await page.title();
  const content15 = await page.innerText('main').catch(() => 'NO MAIN');
  const headings15 = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('main h1, main h2, main h3')).map(e => e.tagName + ': ' + e.textContent);
  });
  const buttons15 = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('main button')).map(e => e.textContent.trim());
  });
  const tableCount15 = await page.evaluate(() => document.querySelectorAll('main table').length);
  const svgCount15 = await page.evaluate(() => document.querySelectorAll('main svg').length);

  console.log('Title:', title15);
  console.log('Headings:', JSON.stringify(headings15));
  console.log('Buttons:', JSON.stringify(buttons15));
  console.log('Tables:', tableCount15, '| SVGs:', svgCount15);
  console.log('Content:');
  console.log(content15);

  // Test interactions for Comparison Table
  console.log('\n--- Testing Interactions ---');
  const allButtons15 = await page.locator('main button').all();
  for (let btn of allButtons15) {
    const text = await btn.textContent();
    const isVisible = await btn.isVisible();
    if (isVisible) {
      try {
        await btn.click();
        await page.waitForTimeout(800);
        const newContent = await page.innerText('main').catch(() => '');
        console.log('Clicked button: "' + text.trim() + '" - OK (content length: ' + newContent.length + ')');
      } catch (e) {
        console.log('Clicked button: "' + text.trim() + '" - FAILED: ' + e.message);
      }
    }
  }

  console.log('---END PAGE 15---\n');

  await browser.close();
})();
