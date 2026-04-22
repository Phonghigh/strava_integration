import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { User } from '../models/User.model.js';
import { Activity } from '../models/Activity.model.js';

puppeteer.use(StealthPlugin());

/**
 * Utility to set session cookies for a Puppeteer page.
 */
export const setStravaCookies = async (page) => {
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
 * Robust navigation helper with retries for "Navigating frame was detached"
 */
const robustGoto = async (page, url, options = {}, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000, ...options });
    } catch (err) {
      const isDetached = err.message.includes('detached');
      const isTimeout = err.message.includes('timeout');
      
      if ((isDetached || isTimeout) && i < retries - 1) {
        console.warn(`[Nav] Navigation failed (Attempt ${i+1}/${retries}): ${err.message}. Retrying...`);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      throw err;
    }
  }
};

/**
 * Utility: Pace Calculation & Validation
 */
export const calculatePaceSeconds = (distanceMeters, movingTimeSeconds) => {
  if (!distanceMeters || !movingTimeSeconds || distanceMeters === 0) return null;
  return movingTimeSeconds / (distanceMeters / 1000);
};

export const formatPace = (seconds) => {
  if (!seconds || isNaN(seconds) || seconds === Infinity) return null;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const parsePaceToSeconds = (paceStr) => {
  if (!paceStr || paceStr === "-" || typeof paceStr !== 'string') return null;
  const parts = paceStr.split(':').map(v => parseInt(v));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return (parts[0] * 60) + parts[1];
  }
  return null;
};

export const checkIsValidActivity = (distanceMeters, paceSeconds, type) => {
  if (!['Run', 'VirtualRun'].includes(type)) return false;
  if (!distanceMeters || distanceMeters < 1000) return false;
  if (!paceSeconds) return false;
  // Valid pace range: 4:00 (240s) to 15:00 (900s)
  return paceSeconds >= 240 && paceSeconds <= 900;
};

/**
 * Extracts pre-fetched activity entries from the Strava profile HTML.
 */
const extractPreFetchedEntries = async (page) => {
  return await page.evaluate(() => {
    try {
      const entries = [];
      const elements = document.querySelectorAll('[data-react-class="Microfrontend"]');
      
      elements.forEach(el => {
        try {
          const props = JSON.parse(el.getAttribute('data-react-props'));
          if (props) {
            // Check both standard location and appContext location
            const foundEntries = props.preFetchedEntries || props.appContext?.preFetchedEntries;
            if (Array.isArray(foundEntries)) {
              entries.push(...foundEntries);
            }
          }
        } catch (e) {
          // Individual component parse error shouldn't block others
        }
      });
      
      return entries;
    } catch (e) {
      return [];
    }
  });
};

/**
 * Scrapes granular detail for a single activity including streams and laps.
 */
export const scrapeActivityDetail = async (page, activityId) => {
  const url = `https://www.strava.com/activities/${activityId}`;
  console.log(`[Detail] Scraping activity: ${url}`);

  const details = {
    isDetailScraped: true,
    streams: {},
    summaryLaps: [],
    totalElevationGain: 0,
    elapsedTime: 0,
    calories: 0,
    averageSpeed: 0,
    maxSpeed: 0,
    deviceName: '',
    description: ''
  };

  // Enable response interception to capture streams JSON
  const streamUrlPattern = `/activities/${activityId}/streams`;
  
  const responseHandler = async (response) => {
    const resUrl = response.url();
    if (resUrl.includes(streamUrlPattern)) {
      try {
        if (response.status() === 200) {
          const data = await response.json();
          if (data) {
            // Strava streams are returned as an object where keys are stream types
            if (data.heartrate) details.streams.heartrate = data.heartrate;
            if (data.cadence) details.streams.cadence = data.cadence;
            if (data.latlng) details.streams.latlng = data.latlng;
            if (data.altitude) details.streams.altitude = data.altitude;
            if (data.distance) details.streams.distance = data.distance;
            if (data.time) details.streams.time = data.time;
            if (data.velocity_smooth) details.streams.velocitySmooth = data.velocity_smooth;
            if (data.grade_smooth) details.streams.gradeSmooth = data.grade_smooth;
            console.log(`[Detail] Captured streams: ${Object.keys(data).join(', ')}`);
          }
        }
      } catch (e) {}
    }
  };

  page.on('response', responseHandler);

  try {
    await robustGoto(page, url);

    // Extract detailed summary from React props
    const propsList = await page.evaluate(() => {
      const elements = document.querySelectorAll('[data-react-class="Microfrontend"]');
      return Array.from(elements).map(el => {
        try {
          return JSON.parse(el.getAttribute('data-react-props'));
        } catch (e) { return null; }
      }).filter(p => p !== null);
    });

    const activityProps = propsList.find(p => p.component === './ActivityDetail' || p.activity);
    
    if (activityProps) {
        const act = activityProps.activity || activityProps;
        details.totalElevationGain = act.elevationGain || act.elev_gain || 0;
        details.elapsedTime = act.elapsedTime || act.moving_time || 0;
        details.calories = act.calories || 0;
        details.averageSpeed = act.averageSpeed || act.avg_speed || 0;
        details.maxSpeed = act.maxSpeed || 0;
        details.deviceName = act.deviceName || act.device_name || '';
        details.description = act.description || '';
        
        const lapList = act.laps || act.splits_metric || act.splits_standard;
        if (Array.isArray(lapList)) {
            details.summaryLaps = lapList.map((l, idx) => ({
                id: l.id || idx + 1,
                distance: l.distance,
                movingTime: l.moving_time || l.movingTime,
                averageSpeed: l.average_speed || l.averageSpeed,
                split: l.split || l.split_index,
                totalElevationGain: l.total_elevation_gain || l.elevation_gain || 0
            }));
            console.log(`[Detail] Captured ${details.summaryLaps.length} laps/splits.`);
        }

        // --- NEW: Calculate Pace and Re-evaluate Validity ---
        const dist = act.distance || act.distance_meters || 0;
        const speed = details.averageSpeed || 0;
        let paceSeconds = speed > 0 ? (1000 / speed) : null;
        
        // Fallback to moving time / distance if average speed is zero or weird
        if (!paceSeconds || paceSeconds > 3600) {
           paceSeconds = calculatePaceSeconds(dist, details.elapsedTime);
        }

        details.pace = formatPace(paceSeconds);
        details.isValid = checkIsValidActivity(dist, paceSeconds, act.type || 'Run');
        
        if (details.pace) {
            console.log(`[Detail] Calculated Pace: ${details.pace} | Valid: ${details.isValid}`);
        } else {
            details.pace = null; // As requested: set to null if missing
            console.log(`[Detail] Pace could not be determined. Marked as Invalid.`);
        }
    }

    // Save to DB
    await Activity.updateOne({ stravaId: activityId.toString() }, { $set: details });
    
    console.log(`[Detailed Crawler] Sync Complete for ID: ${activityId}`);
    console.log(` >> Elevation: ${details.totalElevationGain}m | Calories: ${details.calories} | Device: ${details.deviceName}`);
    if (details.streams.heartrate) console.log(` >> Streams: Captured Heart Rate data (${details.streams.heartrate.length} points)`);
    if (details.streams.latlng) console.log(` >> Streams: Captured GPS map data (${details.streams.latlng.length} points)`);

    return true;
  } catch (err) {
    console.error(`[Detail] Error scraping activity ${activityId}:`, err.message);
    return false;
  } finally {
    page.off('response', responseHandler);
  }
};

/**
 * Helper to process and normalize raw Strava feed entries.
 */
export const processStravaEntries = async (entries) => {
  const TARGET_DATE = new Date('2026-04-01T00:00:00Z');
  
  if (!entries || entries.length === 0) return { processed: 0, skipped: 0, newIds: [], existingCount: 0 };

  // Optimized discovery: Check existing IDs in one go to report new vs existing
  const incomingIds = entries.filter(e => e.activity).map(e => e.activity.id.toString());
  const alreadyInDb = await Activity.find({ stravaId: { $in: incomingIds } }).select('stravaId').lean();
  const existingSet = new Set(alreadyInDb.map(a => a.stravaId));

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

  const results = { processed: 0, skipped: 0, newIds: [], existingCount: 0 };

  for (const entry of entries) {
    const act = entry.activity;
    if (!act) continue;

    const stravaId = act.id.toString();
    const athleteId = (entry.athleteId || findDeep(entry, 'athleteId'))?.toString();
    const athleteName = (entry.athleteName || findDeep(entry, 'athleteName') || "Unknown").toString().trim();
    
    const actDate = new Date(act.startDate);
    // Filter by date and type
    if (actDate < TARGET_DATE || (act.type !== 'Run' && act.type !== 'VirtualRun')) {
      results.skipped++;
      continue;
    }

    // New vs Existing logic
    if (existingSet.has(stravaId)) {
        results.existingCount++;
    } else {
        results.newIds.push(stravaId);
    }

    let matchedUser = userByStravaId.get(athleteId) || userByName.get(athleteName.toLowerCase());
    let userId = matchedUser ? matchedUser._id : null;

    // Link User if stravaId is missing
    if (matchedUser && athleteId && !matchedUser.stravaId && !processedUserIds.has(matchedUser._id.toString())) {
      userBulkOps.push({ updateOne: { filter: { _id: matchedUser._id }, update: { $set: { stravaId: athleteId } } } });
      processedUserIds.add(matchedUser._id.toString());
    }

    const stats = act.stats || [];
    let distanceMeters = 0, pace = null, movingTimeSeconds = 0;

    const findStat = (key) => {
      const idx = stats.findIndex(s => s.value === key);
      return (idx !== -1 && idx > 0) ? (stats[idx - 1].value || "").replace(/<[^>]*>/g, '').trim() : null;
    };

    const distVal = findStat('Distance');
    if (distVal) {
        distanceMeters = distVal.toLowerCase().includes('km') ? parseFloat(distVal) * 1000 : parseFloat(distVal);
    }
    
    const paceStr = findStat('Pace');
    const timeVal = findStat('Time');
    if (timeVal) {
      const h = timeVal.match(/(\d+)h/), m = timeVal.match(/(\d+)m/), s = timeVal.match(/(\d+)s/);
      movingTimeSeconds = (h ? parseInt(h[1]) * 3600 : 0) + (m ? parseInt(m[1]) * 60 : 0) + (s ? parseInt(s[1]) : 0);
    }

    // --- NEW: Robust Pace Logic ---
    let paceSeconds = parsePaceToSeconds(paceStr);
    if (!paceSeconds && distanceMeters > 0 && movingTimeSeconds > 0) {
        paceSeconds = calculatePaceSeconds(distanceMeters, movingTimeSeconds);
    }
    
    pace = formatPace(paceSeconds); // Will be "M:SS" or null

    activityBulkOps.push({
      updateOne: {
        filter: { stravaId: stravaId },
        update: {
          $set: {
            userId, 
            athleteName, 
            name: act.activityName || act.name, 
            distance: distanceMeters,
            movingTime: movingTimeSeconds, 
            pace, 
            type: act.type, 
            startDate: act.startDate,
            isValid: true, // Initially true to allow re-crawling and evaluation in detail phase
            location: act.timeAndLocation?.location || act.timeAndLocation?.displayLocation || '',
            polyline: act.activityMap?.polyline || null,
            athleteAvatar: entry.athleteAvatar || findDeep(entry, 'athleteAvatar') || null
          }
        },
        upsert: true
      }
    });

    console.log(`[Crawler] Processing Activity: ${act.activityName || act.name} (ID: ${act.id}) ${existingSet.has(stravaId) ? '[Existing]' : '[NEW]'}`);
    results.processed++;
  }

  if (userBulkOps.length > 0) await User.bulkWrite(userBulkOps).catch(e => console.error('[DB] User bulk error:', e));
  if (activityBulkOps.length > 0) await Activity.bulkWrite(activityBulkOps).catch(e => console.error('[DB] Activity bulk error:', e));

  // Return discovery results for reporting
  return { 
    ...results, 
    processedActivityIds: activityBulkOps.map(op => op.updateOne.filter.stravaId) 
  };
};

/**
 * Scrapes all members of a specific Strava club.
 */
export const scrapeClubMembers = async (clubId) => {
  const browser = await puppeteer.launch({ 
    headless: "new",
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ] 
  });
  
  try {
    const page = await browser.newPage();
    await setStravaCookies(page);

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    console.log(`[Scraper] Navigating to members page for club ${clubId}...`);
    await robustGoto(page, `https://www.strava.com/clubs/${clubId}/members`);

    console.log(`[Scraper] Landed on: ${page.url()}`);
    if (page.url().includes('/login')) {
      throw new Error("AUTHENTICATION FAILED: Redirected to login page. Check your STRAVA_REMEMBER_ID and STRAVA_REMEMBER_TOKEN secrets.");
    }

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
        
        await robustGoto(page, nextPageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
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
 * PHASE 3: Iterates through each member and scrapes their individual profiles 
 * to capture activities no longer visible in the club-wide feed.
 */
export const scrapeClubMembersActivities = async (clubId, mode = 'normal', limit = 0, specificAthleteId = null, targetMonth = null, concurrency = 3, targetWeek = null) => {
  const TARGET_DATE = new Date('2026-04-01T00:00:00Z');
  
  let members;
  if (specificAthleteId) {
    const dbUser = await User.findOne({ stravaId: specificAthleteId }).lean();
    members = [dbUser || { stravaId: specificAthleteId, firstName: 'Unknown', lastName: 'Athlete' }];
  } else {
    members = await User.find({ stravaId: { $exists: true, $ne: null } }).lean();
  }
  
  console.log(`[Phase 3] Starting Member-Based Sync (${mode}) ${targetMonth ? `for month ${targetMonth}` : ''} ${targetWeek ? `for week ${targetWeek}` : ''} for ${members.length} members (Concurrency: ${concurrency})...`);
  
  let browser = null;
  const launchBrowser = async () => {
    if (browser) {
      console.log(`[Phase 3] Closing stale browser instance...`);
      await browser.close().catch(() => {});
    }
    browser = await puppeteer.launch({ 
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] 
    });
    return browser;
  };

  await launchBrowser();

  try {
    const targetMembers = limit > 0 ? members.slice(0, limit) : members;
    let athletesProcessed = 0;
    let totalCaptured = 0;
    let allNewIds = [];
    let totalExistingCount = 0;

    // Concurrency Worker
    const processMember = async (member) => {
        let page = null;
        try {
            // Health check: Ensure browser is still connected
            if (!browser || !browser.isConnected()) {
              console.warn(`[Phase 3] Browser disconnected before processing ${member.stravaId}. Restarting...`);
              await launchBrowser();
            }

            page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await page.setViewport({ width: 1280, height: 1000 });
            await setStravaCookies(page);

            const currentAthleteActivities = new Map();
            const responseHandler = async (response) => {
              const url = response.url();
              if (url.includes('/feed') && (url.includes('athlete') || url.includes('athlete_id'))) {
                  try {
                      if (response.status() === 200) {
                          const data = await response.json();
                          if (data && data.entries) {
                              data.entries.filter(e => e.activity).forEach(e => {
                                  currentAthleteActivities.set(e.activity.id.toString(), e);
                              });
                          }
                      }
                  } catch (e) {}
              }
            };
            page.on('response', responseHandler);

            athletesProcessed++;
            console.log(`[Phase 3] [${athletesProcessed}/${targetMembers.length}] Athlete: ${member.firstName} ${member.lastName || ''} (${member.stravaId})`);

            let profileUrl = `https://www.strava.com/athletes/${member.stravaId}`;
            if (targetMonth) {
              profileUrl += `#interval_type?chart_type=miles&interval_type=month&interval=${targetMonth}&year_offset=0`;
            } else if (targetWeek) {
              profileUrl += `#interval?interval=${targetWeek}&interval_type=week&chart_type=miles&year_offset=0`;
            }

            await robustGoto(page, profileUrl);

            const preFetched = await extractPreFetchedEntries(page);
            preFetched.filter(e => e.activity).forEach(e => {
                currentAthleteActivities.set(e.activity.id.toString(), e);
            });

            const finalEntries = Array.from(currentAthleteActivities.values());
            if (finalEntries.length > 0) {
                const results = await processStravaEntries(finalEntries);
                totalCaptured += results.processed;
                allNewIds.push(...(results.newIds || []));
                totalExistingCount += (results.existingCount || 0);
                console.log(`[Phase 3] Processed ${member.firstName}: ${results.newIds?.length || 0} NEW, ${results.existingCount || 0} Exist.`);
            }
            
            page.off('response', responseHandler);
        } catch (err) {
            console.log(`[Phase 3] Error on profile ${member.stravaId}: ${err.message}`);
            // If connection closed error, attempt browser restart for next items
            if (err.message.includes('Connection closed') || err.message.includes('target closed')) {
                await launchBrowser().catch(() => {});
            }
        } finally {
            if (page) await page.close().catch(() => {});
        }
    };

    // Run with simple pool
    for (let i = 0; i < targetMembers.length; i += concurrency) {
        // Periodic recycling: Restart browser every 40 athletes to prevent memory bloat
        if (athletesProcessed > 0 && athletesProcessed % 40 === 0) {
            console.log(`[Phase 3] Recycling browser instance to clear resources (Processed: ${athletesProcessed})...`);
            await launchBrowser();
        }

        const chunk = targetMembers.slice(i, i + concurrency);
        await Promise.all(chunk.map(m => processMember(m)));
        // Jitter between chunks to avoid hard-limit detection
        if (i + concurrency < targetMembers.length) await new Promise(r => setTimeout(r, 2000));
    }

    console.log(`\n[Phase 3] Sync Complete. Total unique activities saved: ${totalCaptured}`);
    return { totalCaptured, athletesProcessed, allNewIds, totalExistingCount };

  } finally {
    if (browser) await browser.close().catch(() => {});
  }
};
