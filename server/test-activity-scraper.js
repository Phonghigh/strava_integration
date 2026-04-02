// test-activity-scraper.js
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';

puppeteer.use(StealthPlugin());
dotenv.config();

const clubId = process.env.STRAVA_CLUB_ID || '2034166';

const setStravaCookies = async (page) => {
  const cookies = [
    { name: 'strava_remember_id', value: process.env.STRAVA_REMEMBER_ID, domain: 'www.strava.com', path: '/' },
    { name: 'strava_remember_token', value: process.env.STRAVA_REMEMBER_TOKEN, domain: 'www.strava.com', path: '/' },
    { name: 'sp', value: process.env.STRAVA_SP_ID, domain: '.strava.com', path: '/' }
  ];
  await page.setCookie(...cookies);
};

async function testScraper() {
  console.log(`Starting Debug Scraper for Club: ${clubId}`);
  const browser = await puppeteer.launch({ 
    headless: true, 
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });

  try {
    const page = await browser.newPage();
    await setStravaCookies(page);

    // Monitor ALL network requests to find the right one
    page.on('request', request => {
      const url = request.url();
      if (url.includes('activities') || url.includes('feed')) {
         console.log(`[Network] Request: ${url.substring(0, 100)}...`);
      }
    });

    page.on('response', async response => {
      const url = response.url();
      if (url.includes('feed') && url.includes('club_id') && response.status() === 200) {
        console.log(`[Network] SUCCESS! Intercepted Feed JSON from: ${url}`);
        try {
          const json = await response.json();
          // The feed response is usually an object with an 'entries' array
          const entries = json.entries || [];
          console.log(`[Data] Found ${entries.length} entries in this feed.`);
          if (entries.length > 0) {
            const first = entries[0];
            console.log(`[Sample] Keys: ${Object.keys(first).join(', ')}`);
            // Deep inspect the first entry
            if (first.entityData) {
               console.log(`[Sample] Found entityData! Keys: ${Object.keys(first.entityData).join(', ')}`);
               console.log(`[Sample] Activity Title: ${first.entityData.title || 'N/A'}`);
               console.log(`[Sample] Athlete Name: ${first.entityData.athleteName || 'N/A'}`);
            } else if (first.activity) {
               console.log(`[Sample] Found activity! Keys: ${Object.keys(first.activity).join(', ')}`);
            }
          }
        } catch (e) {
          console.log(`[Data] Failed to parse JSON or not a JSON response.`);
        }
      }
    });

    console.log(`Navigating to Recent Activity tab...`);
    // TARGETING THE RECENT ACTIVITY TAB DIRECTLY
    await page.goto(`https://www.strava.com/clubs/${clubId}/recent_activity`, { 
      waitUntil: 'networkidle2' 
    });

    console.log(`Scrolling down to trigger feed...`);
    for (let i = 0; i < 3; i++) {
      console.log(`Scroll Step ${i+1}...`);
      await page.evaluate(() => window.scrollBy(0, 1500));
      await new Promise(r => setTimeout(r, 3000));
    }

    console.log(`Final wait for background requests...`);
    await new Promise(r => setTimeout(r, 10000));

    // Save screenshot for visual debugging
    await page.screenshot({ path: 'debug-activity-feed.png', fullPage: true });
    console.log(`Screenshot saved to debug-activity-feed.png`);

  } catch (err) {
    console.error(`ERROR:`, err);
  } finally {
    await browser.close();
    console.log(`Done.`);
  }
}

testScraper();
