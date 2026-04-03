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
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  
  try {
    const page = await browser.newPage();
    await setStravaCookies(page);

    let activities = [];

    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('feed') && url.includes('club_id') && response.status() === 200) {
        try {
          const data = await response.json();
          if (data && data.entries) {
            console.log(`[Network] Found ${data.entries.length} entries in packet.`);
            activities.push(...data.entries);
          }
        } catch (e) {}
      }
    });

    console.log(`[Scraper] Triggering activities feed for club ${clubId}...`);
    // Optimize viewport for lazy loading
    await page.setViewport({ width: 1280, height: 2000 });

    await page.goto(`https://www.strava.com/clubs/${clubId}/recent_activity`, { 
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    const TARGET_DATE = new Date('2026-04-01T00:00:00Z');
    let reachedTargetDate = false;
    let scrollCount = 0;
    let lastHeight = await page.evaluate('document.body.scrollHeight');
    let stagnantCount = 0;
    
    // Safety check for session
    const checkedInSession = new Set();

    while (!reachedTargetDate) {
        console.log(`[Scraper] Precise scrolling (Step ${scrollCount + 1}). Captured: ${activities.length}`);
        
        // --- STUTTER SCROLL LOGIC ---
        // 1. Move down
        await page.evaluate(() => window.scrollBy(0, 1500));
        await new Promise(r => setTimeout(r, 800));
        
        // 2. "Stutter" (Scroll up slightly to trigger observers)
        await page.evaluate(() => window.scrollBy(0, -500));
        await new Promise(r => setTimeout(r, 400));
        
        // 3. Move down again to absolute bottom
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await new Promise(r => setTimeout(r, 5000)); // Longer wait for network
        
        const newHeight = await page.evaluate('document.body.scrollHeight');
        if (newHeight <= lastHeight + 10) {
            stagnantCount++;
            if (stagnantCount > 25) { 
                console.log(`[Scraper] Page height stagnant for 25 steps. Stopping.`);
                break;
            }
        } else {
            stagnantCount = 0;
            lastHeight = newHeight;
        }

        scrollCount++;

        // --- EARLY STOP OPTIMIZATION (DB existence check) ---
        if (activities.length > 0) {
            // Take the last 20 captured activities to check existence in DB
            const recentActIds = activities
                .filter(entry => entry.activity && !checkedInSession.has(entry.activity.id))
                .slice(-20)
                .map(entry => entry.activity.id.toString());

            if (recentActIds.length > 0) {
                const existingCount = await Activity.countDocuments({ 
                    stravaId: { $in: recentActIds } 
                });

                if (existingCount > 5) { // If more than 5 in this batch are already synced, we stop
                    console.log(`[Scraper] Found ${existingCount} already synced activities. Stopping.`);
                    reachedTargetDate = true;
                    break; 
                }
                recentActIds.forEach(id => checkedInSession.add(id));
            }

            // Check if we passed the absolute hard-limit target date
            const lastActivityEntry = [...activities].reverse().find(entry => entry.activity);
            const lastAct = lastActivityEntry?.activity;
            if (lastAct && lastAct.startDate) {
                const lastDate = new Date(lastAct.startDate);
                if (lastDate < TARGET_DATE) {
                    console.log(`[Scraper] Reached target date: ${lastDate.toISOString()}. Stopping.`);
                    reachedTargetDate = true;
                }
            }
        }
        
        if (scrollCount > 150) break;
    }

    const uniqueEntries = Array.from(new Map(
        activities
          .filter(entry => entry.activity)
          .map(entry => [entry.activity.id.toString(), entry])
    ).values());

    console.log(`[Scraper] Processing ${uniqueEntries.length} unique activities.`);

    // Performance Optimization: Fetch all users once to avoid redundant DB queries in the loop
    const allUsers = await User.find({});
    const userByStravaId = new Map(allUsers.filter(u => u.stravaId).map(u => [u.stravaId, u]));
    
    // Create a mapping for name-based lookup (case-insensitive)
    const userByName = new Map(allUsers.map(u => {
        const fullName = `${u.firstName} ${u.lastName || ''}`.trim().toLowerCase();
        return [fullName, u];
    }));

    for (const entry of uniqueEntries) {
        const act = entry.activity;
        const actDate = new Date(act.startDate);
        if (actDate < TARGET_DATE) continue;
        if (act.type !== 'Run') continue;

        const athleteId = (act.athlete?.athleteId || act.athlete?.id || entry.athleteId)?.toString();
        const fullName = (act.athlete?.athleteName || act.athlete?.name || entry.athleteName || "").trim();
        
        let userId = null;
        let matchedUser = null;

        // Try linking by ID first (Most precise)
        if (athleteId && userByStravaId.has(athleteId)) {
            matchedUser = userByStravaId.get(athleteId);
        } 
        // FALLBACK: Link by Name
        else if (fullName) {
            matchedUser = userByName.get(fullName.toLowerCase());
            
            // If matched by name, link the stravaId for future syncs
            if (matchedUser && athleteId && !matchedUser.stravaId) {
                matchedUser.stravaId = athleteId;
                await matchedUser.save();
                // Update our local cache
                userByStravaId.set(athleteId, matchedUser);
            }
        }

        if (matchedUser) userId = matchedUser._id;
         // Data Extraction (Pace & Moving Time)
        let distanceMeters = 0;
        let pace = "-";
        let movingTimeSeconds = 0;
        const stats = act.stats || [];
        
        const distanceSubtitleIndex = stats.findIndex(s => s.value === 'Distance');
        if (distanceSubtitleIndex !== -1 && distanceSubtitleIndex > 0) {
            const rawValue = stats[distanceSubtitleIndex - 1].value || "0";
            const cleanValue = rawValue.replace(/<[^>]*>/g, '').trim();
            distanceMeters = cleanValue.toLowerCase().includes('km') ? parseFloat(cleanValue) * 1000 : parseFloat(cleanValue);
        }

        const paceSubtitleIndex = stats.findIndex(s => s.value === 'Pace');
        if (paceSubtitleIndex !== -1 && paceSubtitleIndex > 0) {
            const rawValue = stats[paceSubtitleIndex - 1].value || "";
            pace = rawValue.replace(/<[^>]*>/g, '').replace('/km', '').trim();
        }

        const timeSubtitleIndex = stats.findIndex(s => s.value === 'Time');
        if (timeSubtitleIndex !== -1 && timeSubtitleIndex > 0) {
            const rawValue = stats[timeSubtitleIndex - 1].value || "";
            const cleanTime = rawValue.replace(/<[^>]*>/g, '').trim();
            const hMatch = cleanTime.match(/(\d+)h/);
            const mMatch = cleanTime.match(/(\d+)m/);
            const sMatch = cleanTime.match(/(\d+)s/);
            movingTimeSeconds = (hMatch ? parseInt(hMatch[1]) * 3600 : 0) + 
                                (mMatch ? parseInt(mMatch[1]) * 60 : 0) + 
                                (sMatch ? parseInt(sMatch[1]) : 0);
        }

        const runLocation = act.timeAndLocation?.location || act.timeAndLocation?.displayLocation || '';

        // --- VALIDATION RULES ---
        // 1. Type must be 'Run'
        const isTypeValid = act.type === 'Run';
        
        // 2. Distance >= 1.0 km (1000 meters)
        const isDistanceValid = distanceMeters >= 1000;
        
        // 3. Pace 4:00 - 15:00 /km
        let isPaceValid = false;
        if (pace !== "-") {
            const [min, sec] = pace.split(':').map(val => parseInt(val) || 0);
            const totalPaceSeconds = (min * 60) + sec;
            // 4:00 = 240s, 15:00 = 900s
            isPaceValid = totalPaceSeconds >= 240 && totalPaceSeconds <= 900;
        }

        const isActivityValid = isTypeValid && isDistanceValid && isPaceValid;

        await Activity.findOneAndUpdate(
          { stravaId: act.id.toString() },
          {
            userId,
            athleteName: act.athlete?.name,
            name: act.activityName,
            distance: distanceMeters,
            movingTime: movingTimeSeconds,
            pace,
            location: runLocation,
            type: act.type,
            startDate: act.startDate,
            isValid: isActivityValid 
          },
          { upsert: true }
        );
    }

    return activities;
  } finally {
    await browser.close();
  }
};
