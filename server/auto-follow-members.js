/**
 * auto-follow-members.js
 * Automatically follows Strava users from the local database.
 * Uses session cookies from .env for authentication.
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from './src/models/User.model.js';

dotenv.config();
puppeteer.use(StealthPlugin());

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

async function autoFollow() {
  let browser;
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("SUCCESS: Connected to MongoDB");

    // Add limit and offset support for testing
    const args = process.argv.slice(2);
    const limitArg = args.find(a => a.startsWith('--limit='));
    const offsetArg = args.find(a => a.startsWith('--offset='));
    
    const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 0;
    const offset = offsetArg ? parseInt(offsetArg.split('=')[1]) : 0;

    // Fetch users who have a Strava ID
    const query = User.find({ stravaId: { $exists: true, $ne: "" } });
    if (offset) query.skip(offset);
    if (limit) query.limit(limit);

    const users = await query;
    console.log(`Found ${users.length} users with Strava IDs (Limit: ${limit || 'None'}).`);

    if (users.length === 0) {
      console.log("No users to follow. Exiting.");
      process.exit(0);
    }

    browser = await puppeteer.launch({
      headless: false, // Set to false to watch the magic happen
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await setStravaCookies(page);

    let followCount = 0;
    let skipCount = 0;

    for (let i = 0; i < users.length; i++) {
        const user = users[i];
        const athleteUrl = `https://www.strava.com/athletes/${user.stravaId}`;
        
        console.log(`[${i+1}/${users.length}] Processing ${user.firstName} ${user.lastName} (${athleteUrl})...`);

        try {
            await page.goto(athleteUrl, { waitUntil: 'networkidle2', timeout: 30000 });
            
            // Wait a bit to simulate human behavior
            await delay(2000 + Math.random() * 2000);

            // Check if follow button exists and its state
            // Wait for the button to be stable
            await page.waitForSelector(`button[data-athlete-id="${user.stravaId}"]`, { timeout: 10000 }).catch(() => {});
            const followButton = await page.$(`button[data-athlete-id="${user.stravaId}"]`);
            
            if (!followButton) {
                console.log(`  - Follow button not found for ${user.stravaId}. Already following or profile private?`);
                skipCount++;
                continue;
            }

            const state = await page.evaluate(el => el.getAttribute('data-state'), followButton);
            const text = await page.evaluate(el => el.innerText.trim(), followButton);

            // Robust check: Click if "follow" OR "follow_with_approval" (Request to Follow)
            const canFollow = state === 'follow' || state === 'follow_with_approval';
            const isFollowText = text.toLowerCase() === 'follow' || text.toLowerCase().includes('request to follow');
            
            const alreadyFollowing = text.toLowerCase().includes('following') || 
                                     text.toLowerCase().includes('unfollow') || 
                                     state === 'following' || 
                                     state === 'unfollow';

            if (canFollow && isFollowText && !alreadyFollowing) {
                console.log(`  - Clicking ${state === 'follow' ? 'Follow' : 'Request'} button (State: ${state}, Text: ${text})...`);
                await followButton.click();
                followCount++;
                
                // Longer delay after a successful follow to avoid rate limits
                const waitTime = 5000 + Math.random() * 5000;
                console.log(`  - Action performed! Waiting ${Math.round(waitTime/1000)}s before next...`);
                await delay(waitTime);
            } else {
                console.log(`  - SKIPPING: Already following or state mismatch (State: "${state}", Text: "${text}").`);
                skipCount++;
            }
        } catch (error) {
            console.error(`  - ERROR processing ${user.stravaId}: ${error.message}`);
        }
    }

    console.log("--------------------------------------------------");
    console.log(`FINISH: Followed ${followCount} users, skipped ${skipCount} users.`);
    console.log("--------------------------------------------------");

  } catch (error) {
    console.error("CRITICAL ERROR:", error);
  } finally {
    if (browser) await browser.close();
    await mongoose.disconnect();
    process.exit(0);
  }
}

autoFollow();
