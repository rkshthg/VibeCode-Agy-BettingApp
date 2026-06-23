# ShitCoin - Team Betting Dashboard (Vercel Edition)

ShitCoin (₹) is an interactive, collaborative betting web application designed for small teams to track wagers on various events. The app uses a **parimutuel betting system** where all wagers go into a shared pool and are distributed proportionally to the winners upon event resolution.

This repository is optimized **specifically for deployment on Vercel** and connects to a serverless Redis database (like Upstash Redis or Vercel KV) for persistent global state.

---

## ✨ Features

- **Decentralized Passwordless Accounts:** Users choose a username, claim a starting balance of **₹100,000**, and log in. Data is preserved in browser `localStorage`.
- **Fixed Wagers:** All wagers are locked to exactly **₹500** per bet, keeping the stakes consistent and fair.
- **Parimutuel Payouts:** Winnings are calculated using a parimutuel algorithm. If nobody wins, wagers are refunded.
- **Live Leaderboard:** Tracks members ranked by wins and total balance.
- **Interactive Odds Simulator:** Dynamically previews estimated odds multiplier and payout returns before you submit a bet.
- **Serverless Ready:** Built with a stateless Express backend designed to run on Vercel Serverless Functions.
- **Gold & Brown Theme:** Sleek glassmorphic dashboard styled with gold accents, deep mocha backgrounds, and custom ambient glows.

---

## 🚀 How to Deploy on Vercel

To host this application for your team, you will need a Vercel account and a free Upstash Redis database.

### Step 1: Set Up a Free Database
Since serverless environments do not have persistent local files, we use a cloud database. We recommend **Upstash Redis** (which is 100% free up to 10,000 requests/day):
1. Go to the [Upstash Console](https://console.upstash.com/) and log in (e.g. with GitHub).
2. Click **Create Database**.
3. Name it `shitcoin-db`, select a region close to your team, and click **Create**.
4. Scroll down to the **REST API** section and copy:
   - `UPSTASH_REDIS_REST_URL` (this will map to `KV_REST_API_URL` in Vercel)
   - `UPSTASH_REDIS_REST_TOKEN` (this will map to `KV_REST_API_TOKEN` in Vercel)

### Step 2: Deploy to Vercel
1. Go to [Vercel](https://vercel.com/) and sign up with GitHub.
2. Click **Add New > Project**.
3. Import your **`VibeCode-Agy-BettingApp`** repository.
4. Expand the **Environment Variables** section and add the two variables copied from Upstash:
   - **Key:** `KV_REST_API_URL` / **Value:** *(paste the REST URL)*
   - **Key:** `KV_REST_API_TOKEN` / **Value:** *(paste the REST Token)*
5. Click **Deploy**.

Vercel will build and deploy your project, giving you a secure, public domain (e.g., `https://vibecode-agy-bettingapp.vercel.app`) where your team can access the dashboard.

---

## 💻 Local Development

If you want to run the application locally for testing:
1. Create a `.env` file in the root of the project with your database variables:
   ```env
   KV_REST_API_URL=https://your-database-url.upstash.io
   KV_REST_API_TOKEN=your-token-here
   ```
2. Run:
   ```bash
   npm install
   npm start
   ```
3. Open your browser to `http://localhost:3000`.

---

## 📂 File Structure

```text
├── public/
│   ├── index.html      # Main HTML structure
│   ├── style.css       # Custom glassmorphic CSS styling
│   └── app.js          # Interactive frontend logic and client API handlers
├── api/
│   └── index.js        # Serverless Express API endpoints
├── vercel.json         # Vercel Serverless Function & SPA Routing configuration
├── package.json        # Node dependency configurations
└── README.md           # Documentation
```
