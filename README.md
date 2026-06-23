# ShitCoin - Collaborative Team Betting Board

ShitCoin (₹) is an interactive, collaborative betting web application designed for small teams to track wagers on various events. The app uses a **parimutuel betting system** where all wagers go into a shared pool and are distributed proportionally to the winners upon event resolution.

---

## ✨ Features

- **Decentralized Passwordless Accounts:** Users choose a username, claim a starting balance of **₹100,000**, and log in. Data is preserved in browser `localStorage`.
- **Fixed Wagers:** All wagers are locked to exactly **₹500** per bet, keeping the stakes consistent and fair.
- **Parimutuel Payouts:** Winnings are calculated using a parimutuel algorithm. If nobody wins, wagers are refunded.
- **Live Leaderboard:** Tracks members ranked by wins and total balance.
- **Interactive Odds Simulator:** Dynamically previews estimated odds multiplier and payout returns before you submit a bet.
- **Auto-Tunneling (Public Access):** Features a built-in tunnel that exposes the application to the public internet on container startup—no router configuration or custom domains required.
- **Gold & Brown Theme:** Sleek glassmorphic dashboard styled with gold accents, deep mocha backgrounds, and custom ambient glows.

---

## 🚀 How to Run the Application

### Prerequisites
- [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/) installed.

### Start the Container
1. Clone this repository and navigate to the directory:
   ```bash
   cd VibeCode-Agy-BettingApp
   ```
2. Start the container in detached mode:
   ```bash
   docker compose up -d
   ```
3. Access the web app locally at:
   [http://localhost:3000](http://localhost:3000)

### Share with Outside Networks
Every time the container starts, it establishes a secure, public tunnel using `localtunnel`. To retrieve your unique URL:
1. Run the logs command:
   ```bash
   docker logs shitbets-app-1
   ```
2. Look for the public tunnel address:
   ```text
   --------------------------------------------------
   🚀 Public Tunnel URL: https://shitcoin-bets-XXXXXX.loca.lt
   --------------------------------------------------
   ```
3. Share that link with your teammates outside your local network.

---

## 📂 File Structure

```text
├── data/
│   └── db.json         # Local JSON Database (seeded automatically, git ignored)
├── public/
│   ├── index.html      # Main HTML structure
│   ├── style.css       # Custom glassmorphic CSS styling
│   └── app.js          # Interactive frontend logic and client API handlers
├── Dockerfile          # Multi-stage Docker build recipe
├── docker-compose.yml  # Docker Compose config mapping volume mount & port 3000
├── package.json        # Node dependency configurations
├── server.js           # Express API endpoints & programmtic localtunnel client
└── README.md           # Documentation
```

---

## ⚙️ How it Works (Parimutuel Calculation)

When an event is resolved, the backend calculates the payout for each winner using:
$$\text{Payout} = \frac{\text{User Bet (₹500)}}{\text{Total Wagers on Winning Option}} \times \text{Total Pool}$$

If an event is deleted or if it is resolved with an option that received no bets, all participants receive a **100% refund**.
