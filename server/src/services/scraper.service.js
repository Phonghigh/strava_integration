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

      // Extract members based on the provided HTML structure
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

      console.log(`[Scraper] Page ${pageCount}: Found ${members.length} members.`);

      // Save/Update in DB
      for (const member of members) {
        await User.findOneAndUpdate(
          { stravaId: member.stravaId },
          { 
            firstName: member.name.split(' ')[0],
            lastName: member.name.split(' ').slice(1).join(' '),
            profile: member.profile,
            location: member.location, // New field
          },
          { upsert: true, new: true }
        );
      }
      
      totalScraped += members.length;

      // Check for pagination
      const nextButton = await page.$('ul.pagination li.next_page a[rel="next"]');
      if (nextButton) {
        const nextPageUrl = await page.evaluate(el => el.href, nextButton);
        console.log(`[Scraper] Moving to next page: ${nextPageUrl}`);
        pageCount++;
        
        // Navigate and wait for content instead of network idle
        await page.goto(nextPageUrl, { waitUntil: 'domcontentloaded' });
        try {
          await page.waitForSelector('ul.list-athletes li', { timeout: 15000 });
        } catch (e) {
          console.log(`[Scraper] Warning: Timeout waiting for members list on page ${pageCount}. Continuing...`);
        }
        await new Promise(resolve => setTimeout(resolve, 3000)); // Respectful delay
      } else {
        console.log(`[Scraper] No more pages found.`);
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

    // Listener to catch the JSON response from Strava's internal feed API
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('feed') && url.includes('club_id') && response.status() === 200) {
        try {
          console.log(`[Network] Intercepted feed packet: ${url.substring(0, 100)}...`);
          const data = await response.json();
          if (data && data.entries) {
            console.log(`[Network] Found ${data.entries.length} entries in this packet.`);
            activities.push(...data.entries);
          }
        } catch (e) {
          // Response might not be JSON
        }
      }
    });

    console.log(`[Scraper] Triggering activities feed for club ${clubId}...`);
    // Direct navigation to the recent activity tab for better reliability
    await page.goto(`https://www.strava.com/clubs/${clubId}/recent_activity`, { 
      waitUntil: 'networkidle2' 
    });

    // Set the target threshold date (April 1st, 2026)
    const TARGET_DATE = new Date('2026-04-01T00:00:00Z');
    let reachedTargetDate = false;
    let scrollCount = 0;
    
    // Track seen IDs during this session to avoid redundant DB checks
    const checkedInSession = new Set();

    // Scroll loop until we reach the target date (April 1st, 2026) or find already synced data
    let lastHeight = await page.evaluate('document.body.scrollHeight');
    let stagnantCount = 0;

    while (!reachedTargetDate) {
        console.log(`[Scraper] Precise scrolling (Step ${scrollCount + 1}). Total captured: ${activities.length}`);
        
        // --- IMPROVED SCROLL LOGIC ---
        // 1. Scroll to the absolute bottom of the current rendered page
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        
        // 2. Add some "jitter" scrolling to trigger the intersection observer
        await page.evaluate(() => window.scrollBy(0, -150)); 
        await new Promise(r => setTimeout(r, 400));
        await page.evaluate(() => window.scrollBy(0, 200));

        // 3. Wait for the infinite scroll to trigger and load content
        await new Promise(r => setTimeout(r, 2500));
        
        // 4. Check if page height increased
        const newHeight = await page.evaluate('document.body.scrollHeight');
        if (newHeight === lastHeight) {
            stagnantCount++;
            if (stagnantCount > 5) {
                console.log(`[Scraper] Page height stagnant for 5 steps. End of feed reached.`);
                break;
            }
        } else {
            stagnantCount = 0;
            lastHeight = newHeight;
        }

        scrollCount++;

        // --- EARLY STOP OPTIMIZATION: Check if we hit already synced items ---
        if (activities.length > 0) {
            // Take the last 20 captured activities to check existence in DB
            // (We check a batch to ensure we didn't just hit a single random already-synced item)
            const recentActIds = activities
                .filter(entry => entry.activity && !checkedInSession.has(entry.activity.id))
                .slice(-20)
                .map(entry => entry.activity.id.toString());

            if (recentActIds.length > 0) {
                const existingCount = await Activity.countDocuments({ 
                    stravaId: { $in: recentActIds } 
                });

                if (existingCount > 5) { // If more than 5 in this batch are already synced, we can stop
                    console.log(`[Scraper] Found ${existingCount} already synced activities in recent batch. Stopping scroll.`);
                    reachedTargetDate = true;
                    break; 
                }
                
                // Add to checked cache so we don't query DB for these same IDs again
                recentActIds.forEach(id => checkedInSession.add(id));
            }

            // Check if we passed the absolute hard-limit target date
            const lastActivityEntry = [...activities].reverse().find(entry => entry.activity);
            const lastAct = lastActivityEntry?.activity;

            if (lastAct && lastAct.startDate) {
                const lastDate = new Date(lastAct.startDate);
                if (lastDate < TARGET_DATE) {
                    console.log(`[Scraper] Reached absolute target date: ${lastDate.toISOString()}. Stopping.`);
                    reachedTargetDate = true;
                }
            }
        }
        
        // Safety break
        if (scrollCount > 150) break;
    }

    // Deduplicate and filter by date
    const uniqueEntries = Array.from(new Map(
        activities
          .filter(entry => entry.activity)
          .map(entry => [entry.activity.id, entry])
    ).values());

    console.log(`[Scraper] Processing ${uniqueEntries.length} unique activities after deduplication.`);

    // Map and save to DB
    for (const entry of uniqueEntries) {
        const act = entry.activity;
        const actDate = new Date(act.startDate);
        if (actDate < TARGET_DATE) continue; // Skip if older than April 1st
        
        if (act.type !== 'Run') continue;

        // Priority 1: activity.athlete (Targeting athleteId and athleteName from Strava JSON)
        const athleteId = (act.athlete?.athleteId || act.athlete?.id || entry.athleteId)?.toString();
        const fullName = (act.athlete?.athleteName || act.athlete?.name || entry.athleteName || "").trim();
        
        console.log(`[Link Audit] Processing activity "${act.activityName || act.name}" by athlete: "${fullName}" (ID: ${athleteId})`);

        let userId = null;

        // Try linking by ID first (Most precise)
        if (athleteId) {
          const user = await User.findOne({ stravaId: athleteId });
          if (user) userId = user._id;
        }

        // FALLBACK: Link by Name (More flexible)
        if (!userId && fullName) {
           // Try exact full name match first (case-insensitive)
           const users = await User.find({}); 
           const matchedUser = users.find(u => {
              const dbFullName = `${u.firstName} ${u.lastName || ''}`.trim();
              return dbFullName.toLowerCase() === fullName.toLowerCase();
           });

           if (matchedUser) {
             userId = matchedUser._id;
             // Link the stravaId for future
             if (athleteId && !matchedUser.stravaId) {
                matchedUser.stravaId = athleteId;
                await matchedUser.save();
             }
           } else {
             console.log(`[Link Warning] Could not match activity owner: "${fullName}" (ID: ${athleteId})`);
           }
        }

        // Improved Distance Extraction: Look for the stat whose subtitle is "Distance"
        let distanceMeters = 0;
        const stats = act.stats || [];
        const distanceSubtitleIndex = stats.findIndex(s => s.value === 'Distance');
        
        if (distanceSubtitleIndex !== -1 && distanceSubtitleIndex > 0) {
            // The value is usually in the element just before the subtitle
            let rawValue = stats[distanceSubtitleIndex - 1].value || "0";
            // Remove HTML tags like <abbr>...
            const cleanValue = rawValue.replace(/<[^>]*>/g, '').trim();
            
            if (cleanValue.toLowerCase().includes('km')) {
                distanceMeters = parseFloat(cleanValue) * 1000;
            } else {
                distanceMeters = parseFloat(cleanValue);
            }
        }

        // Extract run location (e.g. "Phường Phước Vĩnh, Thừa Thiên Huế Province")
        const runLocation = act.timeAndLocation?.location || act.timeAndLocation?.displayLocation || '';

        await Activity.findOneAndUpdate(
          { stravaId: act.id.toString() },
          {
            userId: userId,
            athleteName: act.athlete?.name,
            name: act.activityName,
            distance: distanceMeters,
            location: runLocation, // New field
            type: act.type,
            startDate: act.startDate,
            isValid: true 
          },
          { upsert: true }
        );
    }

    return activities;
  } finally {
    await browser.close();
  }
};
