import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { User } from '../models/User.model.js';
import { Activity } from '../models/Activity.model.js';

puppeteer.use(StealthPlugin());

/**
 * Utility to set session cookies for a Puppeteer page.
 */
const setStravaCookies = async (page) => {
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
  await page.setCookie(...cookies);
};

/**
 * Scrapes all members of a specific Strava club.
 */
export const scrapeClubMembers = async (clubId) => {
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  
  try {
    const page = await browser.newPage();
    await setStravaCookies(page);

    console.log(`[Scraper] Navigating to members page for club ${clubId}...`);
    await page.goto(`https://www.strava.com/clubs/${clubId}/members`, { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });

    let hasNextPage = true;
    let pageCount = 1;
    let totalScraped = 0;

    while (hasNextPage) {
      console.log(`[Scraper] Processing Page ${pageCount}...`);

      const members = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('ul.list-athletes li'));
        return items.map(item => {
          const nameLink = item.querySelector('.text-headline a');
          const img = item.querySelector('.Avatar--imgWrapper--cIxoU img');
          const location = item.querySelector('.location')?.innerText.trim() || '';

          if (!nameLink) return null;

          const id = nameLink.href.split('/').pop();
          const rawName = nameLink.innerText.trim();
          const cleanName = rawName.replace(/^\d+[\s.]+\s*/, '');
          
          return {
            stravaId: id,
            name: cleanName,
            profile: img ? img.src : null,
            location: location
          };
        }).filter(m => m !== null);
      });

      console.log(`[Scraper] Page ${pageCount}: Found ${members.length} members. Updating DB...`);

      // Performance Optimization: Use bulkWrite instead of individual findOneAndUpdate
      if (members.length > 0) {
        const bulkOps = members.map(member => ({
          updateOne: {
            filter: { stravaId: member.stravaId },
            update: { 
              firstName: member.name.split(' ')[0],
              lastName: member.name.split(' ').slice(1).join(' '),
              profile: member.profile,
              location: member.location,
            },
            upsert: true
          }
        }));
        await User.bulkWrite(bulkOps);
        console.log(`[Scraper] Page ${pageCount}: DB batch update complete.`);
      }
      
      totalScraped += members.length;

      // Check for pagination
      console.log(`[Scraper] Page ${pageCount}: Checking for next page button...`);
      const nextButton = await page.$('ul.pagination li.next_page a[rel="next"]');
      
      if (nextButton) {
        const nextPageUrl = await page.evaluate(el => el.href, nextButton);
        console.log(`[Scraper] Page ${pageCount}: Moving to next page: ${nextPageUrl.split('/').pop()}`);
        pageCount++;
        
        await page.goto(nextPageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        try {
          await page.waitForSelector('ul.list-athletes li', { timeout: 10000 });
        } catch (e) {
          console.log(`[Scraper] Warning: Small timeout on page ${pageCount}.`);
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        console.log(`[Scraper] No more pages found. Member sync finished.`);
        hasNextPage = false;
      }
    }

    return { totalScraped, pageCount };
  } finally {
    await browser.close();
  }
};

/**
 * Intercepts and fetches club activities via the internal API.
 */
export const scrapeClubActivities = async (clubId) => {
  const TARGET_DATE = new Date('2026-04-01T00:00:00Z');
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  
  let activities = [];
  try {
    const page = await browser.newPage();
    await setStravaCookies(page);

    // Disable cache to ensure we catch the fresh initial packet
    await page.setCacheEnabled(false);

    page.on('response', async (response) => {
      const url = response.url();
      // Broad match for any club feed packet
      if (url.includes('/feed') && (url.includes('feed_type=club') || url.includes('club_id'))) {
        try {
          if (response.status() === 200) {
            console.log(`[Network] Captured Packet: ${url}`);
            const data = await response.json();
            if (data && data.entries) {
              console.log(`[Network] Added ${data.entries.length} entries. Total now: ${activities.length + data.entries.length}`);
              activities.push(...data.entries);
            }
          } else if (response.status() !== 204 && response.status() !== 304) {
             console.log(`[Network] Info: Observed packet ${url.split('/').pop()} with status ${response.status()}`);
          }
        } catch (e) {
          // Ignore parsing errors
        }
      }
    });
    // Optimize viewport for lazy loading
    await page.setViewport({ width: 1280, height: 2000 });

    const clubUrl = `https://www.strava.com/clubs/${clubId}/recent_activity`;
    let success = false;
    let retries = 0;
    const maxRetries = 3;

    while (!success && retries < maxRetries) {
      try {
        console.log(`[Scraper] Accessing club recent activities (Attempt ${retries + 1}/${maxRetries})...`);
        await page.goto(clubUrl, { 
          waitUntil: 'networkidle2', 
          timeout: 90000 // 90 seconds
        });
        success = true;
      } catch (e) {
        retries++;
        console.log(`[Scraper] Timeout/Error accessing club page. Retrying in 5s... (${e.message})`);
        await new Promise(r => setTimeout(r, 5000));
      }
    }

    if (!success) {
      throw new Error(`Failed to load club page after ${maxRetries} attempts.`);
    }

    // Small delay to ensure interceptor captures the initial packet
    await new Promise(r => setTimeout(r, 5000));

    // --- GOLDEN SOLUTION: Manually fetch the first packet that Strava hides in HTML ---
    try {
        console.log(`[Scraper] Manually fetching the MISSING first packet...`);
        const firstPacketUrl = `https://www.strava.com/clubs/${clubId}/feed?feed_type=club&club_id=${clubId}`;
        const firstPacketData = await page.evaluate(async (url) => {
            try {
                const response = await fetch(url);
                return await response.json();
            } catch (e) {
                return null;
            }
        }, firstPacketUrl);

        if (firstPacketData && firstPacketData.entries) {
            console.log(`[Scraper] SUCCESSFULLY FETCHED ${firstPacketData.entries.length} missing initial members.`);
            activities.push(...firstPacketData.entries);
        } else {
            console.log(`[Scraper] Failed to fetch initial packet manually. Relying on network...`);
        }
    } catch (e) {
        console.log(`[Scraper] Manual fetch error: ${e.message}`);
    }

    let reachedTargetDate = false;
    let scrollCount = 0;
    let lastHeight = await page.evaluate('document.body.scrollHeight');
    let stagnantCount = 0;
    
    // Safety check for session
    const checkedInSession = new Set();

    while (!reachedTargetDate && scrollCount < 150) {
        console.log(`[Scraper] Precise scrolling (Step ${scrollCount + 1}). Captured: ${activities.length}`);
        
        await page.evaluate(() => window.scrollBy(0, 1500));
        await new Promise(r => setTimeout(r, 800));
        await page.evaluate(() => window.scrollBy(0, -500));
        await new Promise(r => setTimeout(r, 400));
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

        if (stagnantCount > 0 && stagnantCount % 5 === 0) {
            console.log(`[Scraper] Stagnant steps: ${stagnantCount}. Refreshing position...`);
            await page.evaluate(() => window.scrollTo(0, 0));
            await new Promise(r => setTimeout(r, 1000));
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        }

        await new Promise(r => setTimeout(r, 5000));
        
        const newHeight = await page.evaluate('document.body.scrollHeight');
        if (newHeight <= lastHeight + 10) {
            stagnantCount++;
            if (stagnantCount > 50) break;
        } else {
            stagnantCount = 0;
            lastHeight = newHeight;
        }

        scrollCount++;

        if (activities.length > 0) {
            const lastActivityEntry = [...activities].reverse().find(entry => entry.activity);
            if (lastActivityEntry?.activity?.startDate) {
                const lastDate = new Date(lastActivityEntry.activity.startDate);
                if (lastDate < TARGET_DATE) {
                    console.log(`[Scraper] Reached ${lastDate.toISOString()}. Stopping.`);
                    reachedTargetDate = true;
                }
            }
        }
    }
  } catch (error) {
    console.error(`[Scraper] Fatal error:`, error);
    throw error;
  } finally {
    if (browser) {
      try {
        console.log(`[Scraper] Closing browser...`);
        const pages = await browser.pages();
        for (const p of pages) {
            p.removeAllListeners('response');
            await p.close().catch(() => {});
        }
        await Promise.race([browser.close(), new Promise(r => setTimeout(r, 5000))]);
        console.log(`[Scraper] Browser closed.`);
      } catch (e) {}
    }
  }

  // --- PROCESSING ---
  const uniqueEntries = Array.from(new Map(
    activities.filter(entry => entry.activity).map(entry => [entry.activity.id.toString(), entry])
  ).values());

  console.log(`[Scraper] Processing ${uniqueEntries.length} unique activities...`);
  
  const allUsers = await User.find({});
  const userByStravaId = new Map(allUsers.filter(u => u.stravaId).map(u => [u.stravaId, u]));
  const userByName = new Map(allUsers.map(u => [`${u.firstName} ${u.lastName || ''}`.trim().toLowerCase(), u]));

  const activityBulkOps = [];
  const userBulkOps = [];
  const processedUserIds = new Set();
  const findDeep = (obj, key) => {
    if (!obj || typeof obj !== 'object') return null;
    if (obj[key] !== undefined) return obj[key];
    for (const k in obj) {
      const f = findDeep(obj[k], key);
      if (f !== null) return f;
    }
    return null;
  };

  for (let i = 0; i < uniqueEntries.length; i++) {
    const entry = uniqueEntries[i];
    const act = entry.activity;
    const athleteId = (entry.athleteId || findDeep(entry, 'athleteId'))?.toString();
    const athleteName = (entry.athleteName || findDeep(entry, 'athleteName') || "Unknown").toString().trim();
    
    if (i < 3 || i === uniqueEntries.length - 1 || i % 20 === 0) {
        console.log(`[Processing] ${i + 1}/${uniqueEntries.length}: "${act.activityName || act.name}" by ${athleteName}`);
    }

    const actDate = new Date(act.startDate);
    if (actDate < TARGET_DATE || act.type !== 'Run') continue;

    let matchedUser = userByStravaId.get(athleteId) || userByName.get(athleteName.toLowerCase());
    let userId = matchedUser ? matchedUser._id : null;

    if (matchedUser && athleteId && !matchedUser.stravaId && !processedUserIds.has(matchedUser._id.toString())) {
      userBulkOps.push({ updateOne: { filter: { _id: matchedUser._id }, update: { $set: { stravaId: athleteId } } } });
      processedUserIds.add(matchedUser._id.toString());
    }

    const stats = act.stats || [];
    let distanceMeters = 0, pace = "-", movingTimeSeconds = 0;

    const findStat = (key) => {
      const idx = stats.findIndex(s => s.value === key);
      return (idx !== -1 && idx > 0) ? (stats[idx - 1].value || "").replace(/<[^>]*>/g, '').trim() : null;
    };

    const distVal = findStat('Distance');
    if (distVal) distanceMeters = distVal.toLowerCase().includes('km') ? parseFloat(distVal) * 1000 : parseFloat(distVal);
    
    pace = findStat('Pace') || "-";
    
    const timeVal = findStat('Time');
    if (timeVal) {
      const h = timeVal.match(/(\d+)h/), m = timeVal.match(/(\d+)m/), s = timeVal.match(/(\d+)s/);
      movingTimeSeconds = (h ? parseInt(h[1]) * 3600 : 0) + (m ? parseInt(m[1]) * 60 : 0) + (s ? parseInt(s[1]) : 0);
    }

    let isPaceValid = false;
    if (pace !== "-") {
      const [m, s] = pace.split(':').map(v => parseInt(v) || 0);
      const totalS = (m * 60) + s;
      isPaceValid = totalS >= 240 && totalS <= 900;
    }

    activityBulkOps.push({
      updateOne: {
        filter: { stravaId: act.id.toString() },
        update: {
          $set: {
            userId, athleteName, name: act.activityName, distance: distanceMeters,
            movingTime: movingTimeSeconds, pace, type: act.type, startDate: act.startDate,
            isValid: distanceMeters >= 1000 && isPaceValid,
            location: act.timeAndLocation?.location || act.timeAndLocation?.displayLocation || ''
          }
        },
        upsert: true
      }
    });
  }

  if (userBulkOps.length > 0) {
    console.time('[DB] Link Users');
    await User.bulkWrite(userBulkOps);
    console.timeEnd('[DB] Link Users');
  }

  if (activityBulkOps.length > 0) {
    console.time('[DB] Save Activities');
    const result = await Activity.bulkWrite(activityBulkOps);
    console.timeEnd('[DB] Save Activities');
    console.log(`[Scraper] Sync done. Upserted: ${result.upsertedCount}, Modified: ${result.modifiedCount}`);
  }

  return activities;
};
