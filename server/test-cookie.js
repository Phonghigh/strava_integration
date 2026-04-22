import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

puppeteer.use(StealthPlugin());

async function testCookies() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  const cookies = [
    {
      name: 'strava_remember_id',
      value: process.env.STRAVA_REMEMBER_ID,
      domain: 'www.strava.com',
      path: '/',
    },
    {
      name: 'strava_remember_token',
      value: process.env.STRAVA_REMEMBER_TOKEN,
      domain: 'www.strava.com',
      path: '/',
    },
    {
      name: 'sp',
      value: process.env.STRAVA_SP_ID,
      domain: '.strava.com',
      path: '/',
    }
  ];

  const clubId = process.env.STRAVA_CLUB_ID || '2034166';

  await page.setCookie(...cookies);

  console.log(`Navigating to club members page for ${clubId}...`);
  await page.goto(`https://www.strava.com/clubs/${clubId}/members`, { waitUntil: 'networkidle2' });

  const currentUrl = page.url();
  if (currentUrl.includes('login')) {
    console.error('FAILED: Redirected to login. Cookies might be invalid or expired.');
  } else {
    console.log('SUCCESS: Accessed members page!');
    
    const members = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.member-list tbody tr'));
      return rows.map(row => {
        const nameLink = row.querySelector('.athlete-name');
        const avatarImg = row.querySelector('.avatar img');
        return {
          name: nameLink?.innerText.trim() || 'Unknown',
          id: nameLink?.href.split('/').pop(),
          avatar: avatarImg?.src
        };
      });
    });
    console.log(`Found ${members.length} members on this page.`);
    if (members.length === 0) {
      const html = await page.content();
      fs.writeFileSync('debug-page.html', html);
      console.log('Saved debug-page.html for inspection.');
    }
    console.log('First 3 members:', members.slice(0, 3));
  }

  await browser.close();
}

testCookies().catch(console.error);
