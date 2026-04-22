# VietSeeds Run - Advanced Strava Integration & Leaderboard System

A high-performance backend system designed to manage and track running challenges for large-scale communities. This project solves the limitations of the official Strava API by implementing a hybrid synchronization pipeline that combines **OAuth2 authentication** with a **custom scraping engine**.

## 🚀 Key Highlights for Portfolio

- **Hybrid Data Pipeline**: Solves Strava API's "Club Data" restriction by using a multi-phase scraping engine to reconcile activities from hundreds of members without requiring individual API tokens for every member.
- **Intelligent Normalization**: Implemented a Vietnamese-specific location and team normalization engine that maps raw text data into structured "Regions" (North, Central, South) for high-level analytics.
- **Scalable Aggregation**: Built complex MongoDB aggregation pipelines to calculate real-time leaderboards for individuals and teams, supporting filters for gender, region, and custom timeframes.
- **Automated Validation**: Rule-based engine that automatically validates activity eligibility (Pace: 4:00-15:00 min/km, Distance >= 1km, Type: Run/VirtualRun).

---

## 🛠 Technology Stack

- **Backend**: Node.js, Express.js
- **Database**: MongoDB with Mongoose (Aggregation framework)
- **Data Scraping**: Puppeteer (Headless Browser), Axios, Cheerio
- **Authentication**: JWT & Strava OAuth2
- **Integrations**: Google Sheets API (for registration reconciliation)
- **Deployment**: Configured for high-concurrency environments with parallel worker support.

---

## 🏗 System Architecture

The project follows the **Service-Controller-Model** pattern to ensure a clean separation of concerns:

1.  **Controllers**: Handle HTTP requests, input validation, and API responses.
2.  **Services**: Contain core business logic, Strava API interaction, and the scraping orchestration.
3.  **Models**: MongoDB schemas for Users, Activities, and Teams.
4.  **Data Pipeline**: A set of background scripts for deep sync, data backfilling, and fuzzy-matching user profiles.

---

## 🔍 Data Crawling & Sync Workflow

Since the official Strava API restricts access to club feeds, this system uses a proprietary **3-Phase Synchronization Workflow**:

### Phase 1: Member Discovery
Scrapes the Strava Club member list to identify and reconcile athletes with the internal system.

### Phase 2: Athlete-Based Deep Sync
Iterates through discovered athletes to fetch the latest activity feed, bypassing the need for individual access tokens while maintaining data integrity.

### Phase 3: Detail Scraper (The "Deep Dive")
A Puppeteer-powered headless engine that visits specific activity pages to extract:
- **Polylines**: Encoded GPS coordinates for map rendering.
- **Streams**: Real-time pace, heart rate, and elevation data.
- **Pace Recalculation**: Correcting Strava's moving time for exact competition measurement.

---

## 📊 Core API Features

- **Individual Leaderboard**: Filter by gender, region, search by name, and pagination.
- **Team Leaderboard**: Aggregated distance metrics grouped by teams, filtered by region.
- **Activity Feed**: Real-time live feed of valid activities across the community.
- **Heatmap Data**: Regional statistics (Provinces/Cities) for visual dashboard rendering.
- **Manual & Auto Sync**: Support for both webhook-triggered updates and manual trigger buttons.

---

## ⚙️ Setup & Execution

### Environment Variables
```env
PORT=5000
MONGODB_URI=mongodb+srv://...
JWT_SECRET=your_secret
STRAVA_CLIENT_ID=your_id
STRAVA_CLIENT_SECRET=your_secret
STRAVA_REMEMBER_TOKEN=cookie_for_scraper
```

### Key Commands
```bash
# Start the dev server
npm run dev

# Run a full club sync
node manual-club-sync.js --full --phase=3

# Scrape detailed coordinates/pace for new activities
node src/scripts/local-detail-scraper.js --all --concurrency=3

# Validate activity rules across the database
node verify-activities-validity.js
```

---

## 🎯 Use Case
This system was built for the **VietSeeds Run 2026** campaign, enabling 200+ runners to compete across Vietnam, raising funds through a structured, data-driven running challenge.
