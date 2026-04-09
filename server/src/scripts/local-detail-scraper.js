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

const runLocalDetailScraper = async () => {
  const force = process.argv.includes('--force');
  
  // Parse limit from command line --limit=XXX
  let limitValue = 100;
  const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
  if (limitArg) {
      const val = limitArg.split('=')[1];
      limitValue = val === 'all' ? 999999 : parseInt(val);
  } else if (process.argv.includes('--all')) {
      limitValue = 999999;
  }

  let browser;
  let summary = {
      total: 0,
      success: 0,
      failed: 0,
      newlyScraped: 0,
      forceUpdated: 0
  };

  try {
    await connectDB();
    
    // Query logic: either un-scraped or force re-scrape everything
    const query = force ? { type: 'Run' } : { 
        $or: [
            { isDetailScraped: { $ne: true } }, 
            { polyline: { $exists: false } },
            { polyline: null },
            { streams: { $exists: false } }
        ],
        type: 'Run'
    };

    const activitiesToScrape = await Activity.find(query).sort({ startDate: -1 }).limit(limitValue);
    summary.total = activitiesToScrape.length;

    if (activitiesToScrape.length === 0) {
      console.log('✨ No activities found that need scraping.');
      process.exit(0);
    }

    console.log(`🚀 Scraper started. Mode: ${force ? 'FORCE' : 'INCREMENTAL'}. Target: ${activitiesToScrape.length} activities.`);

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
        const wasScraped = activity.isDetailScraped;
        
        console.log(`\n[${i + 1}/${activitiesToScrape.length}] Scrapping: ${activity.name} (ID: ${activity.stravaId})...`);

        let capturedStreams = {};
        let capturedPolyline = null;
        let capturedLaps = [];

        const interceptResponse = async (response) => {
            try {
                const url = response.url();
                if (url.includes('/streams') && (url.includes('latlng') || url.includes('altitude'))) {
                    const data = await response.json();
                    if (!Array.isArray(data)) {
                        if (data.latlng) capturedStreams.latlng = data.latlng;
                        if (data.altitude) capturedStreams.altitude = data.altitude;
                        if (data.time) capturedStreams.time = data.time;
                        if (data.velocity_smooth) capturedStreams.velocitySmooth = data.velocity_smooth;
                        if (data.heartrate) capturedStreams.heartrate = data.heartrate;
                        if (data.cadence) capturedStreams.cadence = data.cadence;
                        if (data.distance) capturedStreams.distance = data.distance;
                        if (data.grade_smooth) capturedStreams.gradeSmooth = data.grade_smooth;
                    } else {
                        data.forEach(s => {
                            if (s.type === 'latlng') capturedStreams.latlng = s.data;
                            if (s.type === 'altitude') capturedStreams.altitude = s.data;
                            if (s.type === 'time') capturedStreams.time = s.data;
                            if (s.type === 'velocity_smooth') capturedStreams.velocitySmooth = s.data;
                            if (s.type === 'heartrate') capturedStreams.heartrate = s.data;
                            if (s.type === 'cadence') capturedStreams.cadence = s.data;
                            if (s.type === 'distance') capturedStreams.distance = s.data;
                            if (s.type === 'grade_smooth') capturedStreams.gradeSmooth = s.data;
                        });
                    }

                    if (capturedStreams.latlng) {
                        capturedPolyline = encodePolyline(capturedStreams.latlng);
                    }
                }
            } catch (e) {}
        };

        page.on('response', interceptResponse);

        try {
            await page.goto(`https://www.strava.com/activities/${activity.stravaId}`, { 
                waitUntil: 'networkidle2',
                timeout: 35000 
            });

            if (page.url().includes('/login')) {
                console.log('   ❌ Login redirect detected. Session expired?');
                break;
            }

            await page.evaluate(() => window.scrollBy(0, 800));
            await delay(5000);

            if (!capturedPolyline) {
                capturedPolyline = await page.evaluate(() => {
                    const scripts = Array.from(document.querySelectorAll('script'));
                    for (const s of scripts) {
                        const m = s.innerText.match(/\"polyline\":\"(.*?)\"/);
                        if (m && m[1] && m[1].length > 10) return m[1];
                    }
                    return null;
                });
            }

            const extraData = await page.evaluate(() => {
                const results = { totalElevationGain: 0, calories: 0, elapsedTime: 0, deviceName: '', description: '', athleteAvatar: '', laps: [] };
                const statsSelectors = ['.inline-stats li', '.secondary-stats li', 'table.stats-table td'];
                const allStats = [];
                statsSelectors.forEach(sel => document.querySelectorAll(sel).forEach(el => allStats.push(el.innerText)));

                allStats.forEach(text => {
                    if (text.includes('Elevation')) { const m = text.match(/([\d,.]+)/); if (m) results.totalElevationGain = parseFloat(m[0].replace(',', '')); }
                    if (text.includes('Calories')) { const m = text.match(/([\d,.]+)/); if (m) results.calories = parseFloat(m[0].replace(',', '')); }
                    if (text.includes('Elapsed Time')) {
                        const timeStr = text.split('\n')[0].trim();
                        const parts = timeStr.split(':').map(Number);
                        if (parts.length === 2) results.elapsedTime = parts[0] * 60 + parts[1];
                        else if (parts.length === 3) results.elapsedTime = parts[0] * 3600 + parts[1] * 60 + parts[2];
                    }
                });

                const deviceEl = document.querySelector('.device-name') || document.querySelector('[data-testid="device-name"]');
                if (deviceEl) results.deviceName = deviceEl.innerText.trim();
                const descEl = document.querySelector('.activity-description') || document.querySelector('.description-text');
                if (descEl) results.description = descEl.innerText.trim();
                const avatarImg = document.querySelector('.current-athlete img.avatar') || document.querySelector('a.athlete-name + img') || document.querySelector('img[alt$="avatar"]');
                if (avatarImg) results.athleteAvatar = avatarImg.src;

                const table = document.querySelector('.mile-splits table') || document.querySelector('.splits-table');
                if (table) {
                    const rows = Array.from(table.querySelectorAll('tbody tr'));
                    results.laps = rows.map((row) => {
                        const cols = row.querySelectorAll('td');
                        if (cols.length < 2) return null;
                        const paceParts = cols[1].innerText.trim().split(' ')[0].split(':').map(Number);
                        let sec = paceParts.length === 2 ? paceParts[0] * 60 + paceParts[1] : (paceParts.length === 3 ? paceParts[0]*3600 + paceParts[1]*60 + paceParts[2] : 0);
                        let elev = 0; if (cols[2]) { const m = cols[2].innerText.match(/(-?[\d,.]+)/); if (m) elev = parseFloat(m[0]); }
                        return { split: parseInt(cols[0].innerText), distance: 1000, movingTime: sec, averageSpeed: sec > 0 ? (1000 / sec) : 0, totalElevationGain: elev };
                    }).filter(l => l !== null && !isNaN(l.split));
                }
                return results;
            });

            if (capturedPolyline || capturedStreams.latlng) {
                await Activity.updateOne( { _id: activity._id }, { $set: { polyline: capturedPolyline, summaryLaps: extraData.laps, streams: capturedStreams, totalElevationGain: extraData.totalElevationGain || activity.totalElevationGain, calories: extraData.calories, elapsedTime: extraData.elapsedTime, deviceName: extraData.deviceName, description: extraData.description, athleteAvatar: extraData.athleteAvatar, isDetailScraped: true } } );
                console.log(`   ✅ Success! Streams: ${Object.keys(capturedStreams).length}. Laps: ${extraData.laps.length}.`);
                summary.success++;
                if (wasScraped) summary.forceUpdated++; else summary.newlyScraped++;
            } else {
                console.log(`   ⚠️ No map data found for ${activity.stravaId}.`);
                summary.failed++;
            }

        } catch (err) {
            console.error(`   💥 Error on ${activity.stravaId}: ${err.message}`);
            summary.failed++;
        } finally {
            page.off('response', interceptResponse);
        }

        const waitTime = 6000 + Math.random() * 4000;
        await delay(waitTime);
    }

    console.log('\n' + '='.repeat(40));
    console.log('🏁 SCRAPER REPORT');
    console.log('='.repeat(40));
    console.log(`Total Handled:    ${summary.total}`);
    console.log(`Successfully:     ${summary.success}`);
    console.log(`Failed:           ${summary.failed}`);
    console.log(`  - Newly Scraped:  ${summary.newlyScraped}`);
    console.log(`  - Force Updated:  ${summary.forceUpdated}`);
    console.log('='.repeat(40));

  } catch (err) {
    console.error('💥 Fatal error in scraper:', err);
  } finally {
    if (browser) { try { await browser.close(); } catch(e) {} }
    process.exit(0);
  }
};

runLocalDetailScraper();
