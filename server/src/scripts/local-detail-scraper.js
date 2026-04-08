import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Activity } from '../models/Activity.model.js';
import { connectDB } from '../db/connect.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
puppeteer.use(StealthPlugin());

const setStravaCookies = async (page) => {
  const cookies = [
    { name: 'strava_remember_id', value: process.env.STRAVA_REMEMBER_ID, domain: 'www.strava.com', path: '/' },
    { name: 'strava_remember_token', value: process.env.STRAVA_REMEMBER_TOKEN, domain: 'www.strava.com', path: '/' },
    { name: 'sp', value: process.env.STRAVA_SP_ID, domain: '.strava.com', path: '/' }
  ];
  await page.setCookie(...cookies);
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Simple polyline encoder
function encodePolyline(points) {
    if (!points || points.length === 0) return null;
    let plat = 0;
    let plng = 0;
    let encoded = "";

    for (let i = 0; i < points.length; i++) {
        let lat = Math.round(points[i][0] * 1e5);
        let lng = Math.round(points[i][1] * 1e5);

        let dlat = lat - plat;
        let dlng = lng - plng;

        encoded += encodeValue(dlat);
        encoded += encodeValue(dlng);

        plat = lat;
        plng = lng;
    }
    return encoded;
}

function encodeValue(value) {
    value = value < 0 ? ~(value << 1) : value << 1;
    let encoded = "";
    while (value >= 0x20) {
        encoded += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
        value >>= 5;
    }
    encoded += String.fromCharCode(value + 63);
    return encoded;
}

const runLocalDetailScraper = async (limit = 100) => {
  const force = process.argv.includes('--force');
  let browser;
  try {
    await connectDB();
    
    // Query logic: either un-scraped or force re-scrape everything
    const query = force ? { type: 'Run' } : { 
        $or: [
            { isDetailScraped: { $ne: true } }, 
            { polyline: { $exists: false } },
            { polyline: null }
        ],
        type: 'Run'
    };

    const activitiesToScrape = await Activity.find(query).sort({ startDate: -1 }).limit(limit);

    if (activitiesToScrape.length === 0) {
      console.log('✨ No activities found that need scraping.');
      process.exit(0);
    }

    console.log(`🚀 Scraper started${force ? ' (FORCE MODE)' : ''}. Target: ${activitiesToScrape.length} activities.`);

    browser = await puppeteer.launch({ 
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080'] 
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await setStravaCookies(page);
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    for (let i = 0; i < activitiesToScrape.length; i++) {
        const activity = activitiesToScrape[i];
        console.log(`\n[${i + 1}/${activitiesToScrape.length}] Scrapping: ${activity.name} (ID: ${activity.stravaId})...`);

        let capturedPolyline = null;
        let capturedLaps = [];

        // Network Interception Handler
        const interceptResponse = async (response) => {
            try {
                const url = response.url();
                if (url.includes('/streams') && url.includes('latlng')) {
                    const data = await response.json();
                    const points = data.latlng || (Array.isArray(data) && data.find(s => s.type === 'latlng')?.data);
                    if (Array.isArray(points) && points.length > 0) {
                        capturedPolyline = encodePolyline(points);
                        console.log(`   📍 Network: Captured ${points.length} points.`);
                    }
                }
            } catch (e) {}
        };

        page.on('response', interceptResponse);

        try {
            await page.goto(`https://www.strava.com/activities/${activity.stravaId}`, { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });

            if (page.url().includes('/login')) {
                console.log('   ❌ Login redirect detected. Session expired?');
                break;
            }

            // Scroll to trigger data loading
            await page.evaluate(() => window.scrollBy(0, 600));
            await delay(4000);

            // Fallback for polyline if network capture missed it
            if (!capturedPolyline) {
                capturedPolyline = await page.evaluate(() => {
                    const scripts = Array.from(document.querySelectorAll('script'));
                    for (const s of scripts) {
                        const m = s.innerText.match(/\"polyline\":\"(.*?)\"/);
                        if (m && m[1] && m[1].length > 10) return m[1];
                    }
                    return null;
                });
                if (capturedPolyline) console.log('   📍 DOM: Found polyline string.');
            }

            // Extract Laps/Splits
            capturedLaps = await page.evaluate(() => {
                const table = document.querySelector('.mile-splits table') || 
                              document.querySelector('.splits-table') || 
                              document.querySelector('#splits') || 
                              document.querySelector('[data-testid="splits"]');
                if (!table) return [];
                
                const rows = Array.from(table.querySelectorAll('tbody tr'));
                return rows.map((row) => {
                    const cols = row.querySelectorAll('td');
                    if (cols.length < 2) return null;
                    const splitIdx = parseInt(cols[0].innerText.trim());
                    const paceText = cols[1].innerText.trim().split(' ')[0];
                    const paceParts = paceText.split(':').map(Number);
                    let sec = 0;
                    if (paceParts.length === 2) sec = paceParts[0] * 60 + paceParts[1];
                    else if (paceParts.length === 3) sec = paceParts[0] * 3600 + paceParts[1] * 60 + paceParts[2];

                    return {
                        split: splitIdx,
                        distance: 1000,
                        movingTime: sec,
                        averageSpeed: sec > 0 ? (1000 / sec) : 0
                    };
                }).filter(l => l !== null && !isNaN(l.split));
            });

            // Update Database
            if (capturedPolyline) {
                await Activity.updateOne(
                    { _id: activity._id },
                    { 
                        $set: { 
                            polyline: capturedPolyline, 
                            summaryLaps: capturedLaps, 
                            isDetailScraped: true 
                        } 
                    }
                );
                console.log(`   ✅ Success! Laps: ${capturedLaps.length}.`);
            } else {
                console.log(`   ⚠️ No map data found for ${activity.stravaId}.`);
            }

        } catch (err) {
            console.error(`   💥 Error: ${err.message}`);
        } finally {
            page.off('response', interceptResponse);
        }

        // Wait between requests to mimic human behavior
        const waitTime = 6000 + Math.random() * 4000;
        await delay(waitTime);
    }

    console.log('\n🏁 Scraper process complete.');
  } catch (err) {
    console.error('💥 Fatal error:', err);
  } finally {
    if (browser) await browser.close();
    process.exit(0);
  }
};

runLocalDetailScraper();
