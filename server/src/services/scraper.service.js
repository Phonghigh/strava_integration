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
    // Scroll loop until we reach the target date (April 1st, 2026)
    while (!reachedTargetDate) {
        console.log(`[Scraper] Rhythmic scrolling (Step ${scrollCount + 1})...`);
        
        // Scroll down in many small steps to simulate human reading/scrolling
        for (let j = 0; j < 12; j++) {
            await page.evaluate(() => window.scrollBy(0, 400));
            await new Promise(r => setTimeout(r, 300));
        }

        // Wait for the infinite scroll to trigger and finalize
        await new Promise(r => setTimeout(r, 5000));
        
        scrollCount++;

        // Check the last activity date to see if we should stop
        if (activities.length > 0) {
            // Find the last entry that has an activity object
            const lastActivityEntry = [...activities].reverse().find(entries => entries.activity);
            const lastAct = lastActivityEntry?.activity;

            if (lastAct && lastAct.startDate) {
                const lastDate = new Date(lastAct.startDate);
                if (lastDate < TARGET_DATE) {
                    console.log(`[Scraper] Reached target date: ${lastDate.toISOString()}. Stopping scrolls.`);
                    reachedTargetDate = true;
                }
            }
        }
        
        // Safety break to prevent infinite loops in case of unexpected page behavior
        if (scrollCount > 200) {
            console.log("[Scraper] Safety limit of 200 scrolls reached. Stopping to prevent infinite loop.");
            break;
        }
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

        const distanceStr = act.stats?.find(s => s.label === 'Distance')?.value || '0';
        let distanceMeters = 0;
        if (distanceStr.includes('km')) {
            distanceMeters = parseFloat(distanceStr) * 1000;
        } else {
            distanceMeters = parseFloat(distanceStr);
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
