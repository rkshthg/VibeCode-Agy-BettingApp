const express = require('express');
const localtunnel = require('localtunnel');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DB_DIR, 'db.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure database directory and file exist
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

if (!fs.existsSync(DB_FILE)) {
  const initialData = {
    users: [],
    events: []
  };
  fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
}

// Database Helpers
function readDb() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading database file:', err);
    return { users: [], events: [] };
  }
}

function writeDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error writing to database file:', err);
  }
}

// API Routes

// Get complete state (users, events, leaderboard)
app.get('/api/state', (req, res) => {
  const db = readDb();
  
  // Sort users for leaderboard (wins descending, then balance descending)
  const leaderboard = [...db.users].sort((a, b) => {
    if ((b.wins || 0) !== (a.wins || 0)) {
      return (b.wins || 0) - (a.wins || 0);
    }
    return b.balance - a.balance;
  });

  res.json({
    users: db.users,
    events: db.events,
    leaderboard
  });
});

// Create/Register a user
app.post('/api/users', (req, res) => {
  const { username } = req.body;
  if (!username || typeof username !== 'string' || !username.trim()) {
    return res.status(400).json({ error: 'Username is required' });
  }

  const trimmedUsername = username.trim();
  const db = readDb();

  let user = db.users.find(u => u.username.toLowerCase() === trimmedUsername.toLowerCase());
  if (user) {
    return res.status(400).json({ error: 'Username is already taken' });
  }

  user = {
    id: Date.now().toString(),
    username: trimmedUsername,
    balance: 100000,
    wins: 0
  };

  db.users.push(user);
  writeDb(db);

  res.status(201).json(user);
});

// Create an Event
app.post('/api/events', (req, res) => {
  const { title, description, options, creator } = req.body;

  if (!title || !options || !Array.isArray(options) || options.length < 2) {
    return res.status(400).json({ error: 'Title and at least 2 options are required' });
  }

  if (!creator) {
    return res.status(400).json({ error: 'Event creator username is required' });
  }

  const db = readDb();
  
  // Validate creator exists
  const userExists = db.users.some(u => u.username.toLowerCase() === creator.toLowerCase());
  if (!userExists) {
    return res.status(400).json({ error: 'Creator username not registered' });
  }

  const newEvent = {
    id: Date.now().toString(),
    title: title.trim(),
    description: (description || '').trim(),
    options: options.map(o => o.trim()).filter(Boolean),
    creator: creator.trim(),
    status: 'open', // 'open' | 'resolved'
    winningOption: null,
    bets: [] // Array of { username, option, amount }
  };

  if (newEvent.options.length < 2) {
    return res.status(400).json({ error: 'At least 2 non-empty options are required' });
  }

  db.events.push(newEvent);
  writeDb(db);

  res.status(201).json(newEvent);
});

// Delete an Event (Refunds active bets)
app.delete('/api/events/:id', (req, res) => {
  const { id } = req.params;
  const db = readDb();

  const eventIndex = db.events.findIndex(e => e.id === id);
  if (eventIndex === -1) {
    return res.status(404).json({ error: 'Event not found' });
  }

  const event = db.events[eventIndex];

  // Refund all bets
  if (event.status === 'open' && event.bets.length > 0) {
    event.bets.forEach(bet => {
      const user = db.users.find(u => u.username.toLowerCase() === bet.username.toLowerCase());
      if (user) {
        user.balance += bet.amount;
      }
    });
  }

  db.events.splice(eventIndex, 1);
  writeDb(db);

  res.json({ message: 'Event deleted successfully and bets refunded' });
});

// Place a Bet on an Event
app.post('/api/events/:id/bet', (req, res) => {
  const { id } = req.params;
  const { username, option, amount } = req.body;

  const parsedAmount = parseInt(amount, 10);
  if (isNaN(parsedAmount) || parsedAmount !== 500) {
    return res.status(400).json({ error: 'Bet amount must be exactly 500 ShitCoins' });
  }

  const db = readDb();

  const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const event = db.events.find(e => e.id === id);
  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }

  if (event.status !== 'open') {
    return res.status(400).json({ error: 'Event is already resolved and closed' });
  }

  if (!event.options.includes(option)) {
    return res.status(400).json({ error: 'Invalid option selected for this event' });
  }

  if (user.balance < parsedAmount) {
    return res.status(400).json({ error: 'Insufficient Shit Coins balance' });
  }

  // Deduct balance
  user.balance -= parsedAmount;

  // Record/aggregate bet
  const existingBet = event.bets.find(
    b => b.username.toLowerCase() === username.toLowerCase() && b.option === option
  );

  if (existingBet) {
    existingBet.amount += parsedAmount;
  } else {
    event.bets.push({
      username: user.username,
      option,
      amount: parsedAmount
    });
  }

  writeDb(db);
  res.json({ message: 'Bet placed successfully', event, balance: user.balance });
});

// Resolve an Event
app.post('/api/events/:id/resolve', (req, res) => {
  const { id } = req.params;
  const { winningOption } = req.body;

  if (!winningOption) {
    return res.status(400).json({ error: 'Winning option is required' });
  }

  const db = readDb();

  const event = db.events.find(e => e.id === id);
  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }

  if (event.status !== 'open') {
    return res.status(400).json({ error: 'Event is already resolved' });
  }

  if (!event.options.includes(winningOption)) {
    return res.status(400).json({ error: 'Winning option must be one of the original event options' });
  }

  const totalPool = event.bets.reduce((sum, b) => sum + b.amount, 0);
  const winningBets = event.bets.filter(b => b.option === winningOption);
  const totalWinningPool = winningBets.reduce((sum, b) => sum + b.amount, 0);

  if (totalPool > 0) {
    if (totalWinningPool === 0) {
      // Refund all bets because nobody won
      event.bets.forEach(bet => {
        const user = db.users.find(u => u.username.toLowerCase() === bet.username.toLowerCase());
        if (user) {
          user.balance += bet.amount;
        }
      });
    } else {
      // Payout winners proportionally
      winningBets.forEach(bet => {
        const user = db.users.find(u => u.username.toLowerCase() === bet.username.toLowerCase());
        if (user) {
          const payout = Math.round((bet.amount / totalWinningPool) * totalPool);
          user.balance += payout;
          user.wins = (user.wins || 0) + 1;
        }
      });
    }
  }

  event.status = 'resolved';
  event.winningOption = winningOption;

  writeDb(db);
  res.json({ message: 'Event resolved successfully', event });
});

// Serve frontend fallback for SPA (if any)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = app.listen(PORT, async () => {
  console.log(`ShitCoin server running on port ${PORT}`);

  // Start localtunnel programmatically
  try {
    const subdomain = process.env.SUBDOMAIN || `shitcoin-bets-${Date.now().toString().slice(-6)}`;
    const tunnel = await localtunnel({
      port: PORT,
      subdomain: subdomain
    });
    console.log(`\n--------------------------------------------------`);
    console.log(`🚀 Public Tunnel URL: ${tunnel.url}`);
    console.log(`--------------------------------------------------\n`);

    tunnel.on('close', () => {
      console.log('Public tunnel closed');
    });
  } catch (err) {
    console.error('Error starting localtunnel:', err.message);
  }
});
