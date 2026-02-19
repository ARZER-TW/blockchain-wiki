const { chromium } = require('/home/james/hackathons/blockchain-wiki/node_modules/playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const urls = [
    'http://localhost:4321/ethereum/accounts/eoa/',
    'http://localhost:4321/ethereum/accounts/contract-account/',
    'http://localhost:4321/ethereum/accounts/address-derivation/',
    'http://localhost:4321/ethereum/accounts/nonce/',
    'http://localhost:4321/ethereum/accounts/gas/',
    'http://localhost:4321/ethereum/accounts/eip-55/',
    'http://localhost:4321/ethereum/accounts/eip-155/',
    'http://localhost:4321/ethereum/accounts/eip-1559/',
  ];

  for (let i = 0; i < urls.length; i++) {
    await page.goto(urls[i], { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1500);
    const title = await page.title();
    const content = await page.innerText('main').catch(() => 'NO MAIN ELEMENT');
    const headings = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('main h1, main h2, main h3')).map(e => e.tagName + ': ' + e.textContent);
    });
    const linkCount = await page.evaluate(() => document.querySelectorAll('main a[href]').length);
    const codeCount = await page.evaluate(() => document.querySelectorAll('main pre, main code').length);
    const imgCount = await page.evaluate(() => document.querySelectorAll('main img, main svg').length);

    console.log('=== PAGE ' + (i+1) + ': ' + urls[i] + ' ===');
    console.log('Title:', title);
    console.log('Headings:', JSON.stringify(headings));
    console.log('Links:', linkCount, '| Code blocks:', codeCount, '| Images/SVG:', imgCount);
    console.log('Content length:', content.length);
    console.log('Content:');
    console.log(content);
    console.log('---END PAGE ' + (i+1) + '---\n');
  }

  await browser.close();
})();
