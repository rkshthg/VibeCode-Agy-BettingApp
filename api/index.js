const express = require('express');
const path = require('path');
const { Redis } = require('@upstash/redis');

const app = express();
app.use(express.json());

// Serve static files for local testing
app.use(express.static(path.join(__dirname, '../public')));

// Initialize Upstash Redis database (supports both Vercel KV and Upstash env names)
const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

if (!redisUrl || !redisToken) {
  console.warn('WARNING: KV_REST_API_URL and KV_REST_API_TOKEN must be configured in environment variables.');
}

const redis = new Redis({
  url: redisUrl || '',
  token: redisToken || ''
});

// Database Helpers (Async Redis)
async function readDb() {
  try {
    const data = await redis.get('shitcoin_state');
    return data || { users: [], events: [] };
  } catch (err) {
    console.error('Error reading from Redis KV:', err);
    return { users: [], events: [] };
  }
}

async function writeDb(data) {
  try {
    await redis.set('shitcoin_state', data);
  } catch (err) {
    console.error('Error writing to Redis KV:', err);
  }
}

// Access Control Middleware (Admin Only)
async function adminRequired(req, res, next) {
  const requester = req.headers['x-user-username'];
  if (!requester) {
    return res.status(401).json({ error: 'Authentication required. Missing x-user-username header.' });
  }

  const db = await readDb();
  const user = db.users.find(u => u.username.toLowerCase() === requester.toLowerCase());
  
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: 'Admin privileges required.' });
  }

  req.currentUser = user; // Attach user to request context
  next();
}

// API Routes

// Get complete state (users, events, leaderboard)
app.get('/api/state', async (req, res) => {
  const db = await readDb();
  
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
app.post('/api/users', async (req, res) => {
  const { username } = req.body;
  if (!username || typeof username !== 'string' || !username.trim()) {
    return res.status(400).json({ error: 'Username is required' });
  }

  const trimmedUsername = username.trim();
  const db = await readDb();

  let user = db.users.find(u => u.username.toLowerCase() === trimmedUsername.toLowerCase());
  if (user) {
    return res.status(400).json({ error: 'Username is already taken' });
  }

  // First user is automatically granted admin status
  const isFirstUser = db.users.length === 0;

  user = {
    id: Date.now().toString(),
    username: trimmedUsername,
    balance: 100000,
    wins: 0,
    isAdmin: isFirstUser
  };

  db.users.push(user);
  await writeDb(db);

  res.status(201).json(user);
});

// Promote another user to Admin (Admin Only)
app.post('/api/users/promote', adminRequired, async (req, res) => {
  const { targetUsername } = req.body;
  if (!targetUsername || typeof targetUsername !== 'string' || !targetUsername.trim()) {
    return res.status(400).json({ error: 'Target username is required.' });
  }

  const db = await readDb();
  const user = db.users.find(u => u.username.toLowerCase() === targetUsername.trim().toLowerCase());
  
  if (!user) {
    return res.status(404).json({ error: 'Target user not found.' });
  }

  if (user.isAdmin) {
    return res.status(400).json({ error: 'User is already an Admin.' });
  }

  user.isAdmin = true;
  await writeDb(db);

  res.json({ message: `Successfully promoted ${user.username} to Admin.`, user });
});

// Create an Event
app.post('/api/events', async (req, res) => {
  const { title, description, options, creator } = req.body;

  if (!title || !options || !Array.isArray(options) || options.length < 2) {
    return res.status(400).json({ error: 'Title and at least 2 options are required' });
  }

  if (!creator) {
    return res.status(400).json({ error: 'Event creator username is required' });
  }

  const db = await readDb();
  
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
    status: 'open',
    winningOption: null,
    bets: [] // Array of { username, option, amount }
  };

  if (newEvent.options.length < 2) {
    return res.status(400).json({ error: 'At least 2 non-empty options are required' });
  }

  db.events.push(newEvent);
  await writeDb(db);

  res.status(201).json(newEvent);
});

// Edit Event Details (Admin Only)
app.put('/api/events/:id', adminRequired, async (req, res) => {
  const { id } = req.params;
  const { title, description } = req.body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'Event title is required.' });
  }

  const db = await readDb();
  const event = db.events.find(e => e.id === id);
  if (!event) {
    return res.status(404).json({ error: 'Event not found.' });
  }

  if (event.status !== 'open') {
    return res.status(400).json({ error: 'Cannot edit details of a resolved event.' });
  }

  event.title = title.trim();
  event.description = (description || '').trim();

  await writeDb(db);
  res.json({ message: 'Event updated successfully.', event });
});

// Delete an Event (Admin Only - Refunds active bets)
app.delete('/api/events/:id', adminRequired, async (req, res) => {
  const { id } = req.params;
  const db = await readDb();

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
  await writeDb(db);

  res.json({ message: 'Event deleted successfully and bets refunded' });
});

// Place a Bet on an Event
app.post('/api/events/:id/bet', async (req, res) => {
  const { id } = req.params;
  const { username, option, amount } = req.body;

  const parsedAmount = parseInt(amount, 10);
  if (isNaN(parsedAmount) || parsedAmount !== 500) {
    return res.status(400).json({ error: 'Bet amount must be exactly 500 ShitCoins' });
  }

  const db = await readDb();

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

  // Check if user already placed a bet on this event
  const existingBet = event.bets.find(
    b => b.username.toLowerCase() === username.toLowerCase()
  );

  if (existingBet) {
    if (existingBet.option === option) {
      return res.status(400).json({ error: 'You have already placed a bet on this option.' });
    }
    // Switch the option, balance remains unchanged!
    const oldOption = existingBet.option;
    existingBet.option = option;
    await writeDb(db);
    return res.json({ 
      message: `Bet successfully changed from "${oldOption}" to "${option}".`, 
      event, 
      balance: user.balance 
    });
  }

  // Deduct balance for new bet
  if (user.balance < parsedAmount) {
    return res.status(400).json({ error: 'Insufficient Shit Coins balance' });
  }

  user.balance -= parsedAmount;
  event.bets.push({
    username: user.username,
    option,
    amount: parsedAmount
  });

  await writeDb(db);
  res.json({ message: 'Bet placed successfully', event, balance: user.balance });
});

// Remove an individual bet placed by a user (Admin Only)
app.delete('/api/events/:id/bets', adminRequired, async (req, res) => {
  const { id } = req.params;
  const { targetUsername, option } = req.body;

  if (!targetUsername || !option) {
    return res.status(400).json({ error: 'Target username and option are required.' });
  }

  const db = await readDb();
  const event = db.events.find(e => e.id === id);
  if (!event) {
    return res.status(404).json({ error: 'Event not found.' });
  }

  if (event.status !== 'open') {
    return res.status(400).json({ error: 'Cannot remove bets from a resolved event.' });
  }

  const betIndex = event.bets.findIndex(
    b => b.username.toLowerCase() === targetUsername.toLowerCase() && b.option === option
  );

  if (betIndex === -1) {
    return res.status(404).json({ error: 'Bet not found on this event.' });
  }

  const bet = event.bets[betIndex];

  // Refund the bet amount to the target user's balance
  const user = db.users.find(u => u.username.toLowerCase() === targetUsername.toLowerCase());
  if (user) {
    user.balance += bet.amount;
  }

  // Remove the bet
  event.bets.splice(betIndex, 1);

  await writeDb(db);
  res.json({ message: 'Wager removed and refunded successfully.', event });
});

// Add a custom option to an Event (Any logged in user)
app.post('/api/events/:id/options', async (req, res) => {
  const { id } = req.params;
  const { option } = req.body;

  if (!option || typeof option !== 'string' || !option.trim()) {
    return res.status(400).json({ error: 'Option text is required.' });
  }

  const trimmedOption = option.trim();
  const db = await readDb();

  const event = db.events.find(e => e.id === id);
  if (!event) {
    return res.status(404).json({ error: 'Event not found.' });
  }

  if (event.status !== 'open') {
    return res.status(400).json({ error: 'Cannot add options to a resolved event.' });
  }

  // Case-insensitive duplicate check
  const optionExists = event.options.some(
    o => o.toLowerCase() === trimmedOption.toLowerCase()
  );

  if (optionExists) {
    return res.status(400).json({ error: 'This option already exists on this event.' });
  }

  event.options.push(trimmedOption);
  await writeDb(db);

  res.json({ message: 'Option added successfully', event });
});

// Resolve an Event (Admin Only)
app.post('/api/events/:id/resolve', adminRequired, async (req, res) => {
  const { id } = req.params;
  const { winningOption } = req.body;

  if (!winningOption) {
    return res.status(400).json({ error: 'Winning option is required' });
  }

  const db = await readDb();

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

  await writeDb(db);
  res.json({ message: 'Event resolved successfully', event });
});

// Serve frontend fallback for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Export Express app instance for Vercel Serverless compatibility
module.exports = app;

// Start local port listener only for local testing (not in serverless environment)
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running locally on port ${PORT}`);
  });
}
