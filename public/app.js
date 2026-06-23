let currentUser = null;
let appState = {
  users: [],
  events: [],
  leaderboard: []
};
let selectedOptions = {}; // eventId -> selectedOptionName
let searchQuery = '';

// DOM Elements
const loginModal = document.getElementById('login-modal');
const loginForm = document.getElementById('login-form');
const loginUsername = document.getElementById('login-username');
const loginError = document.getElementById('login-error');

const userPanel = document.getElementById('user-panel');
const eventSearch = document.getElementById('event-search');
const toggleCreatorBtn = document.getElementById('toggle-creator-btn');
const closeCreatorBtn = document.getElementById('close-creator-btn');
const createEventCard = document.getElementById('create-event-card');
const createEventForm = document.getElementById('create-event-form');
const addOptionBtn = document.getElementById('add-option-btn');
const optionsContainer = document.getElementById('options-container');
const eventsList = document.getElementById('events-list');
const leaderboardList = document.getElementById('leaderboard-list');

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  checkUserSession();
  setupEventListeners();
  
  // Refresh state every 5 seconds for basic real-time updates
  setInterval(() => {
    if (currentUser) {
      fetchState(false); // fetch silently without rebuilding whole DOM if focused
    }
  }, 5000);
});

// Check localStorage for user session
function checkUserSession() {
  const savedUser = localStorage.getItem('shitcoin_username');
  if (savedUser) {
    currentUser = savedUser;
    loginModal.classList.add('hidden');
    fetchState(true);
  } else {
    loginModal.classList.remove('hidden');
  }
}

// Set up UI Event Listeners
function setupEventListeners() {
  // Login Form
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = loginUsername.value.trim();
    if (!username) return;

    try {
      // Try to create user
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });

      const data = await res.json();

      if (res.status === 201) {
        // Success
        currentUser = data.username;
        localStorage.setItem('shitcoin_username', currentUser);
        loginModal.classList.add('hidden');
        loginForm.reset();
        fetchState(true);
      } else if (res.status === 400 && data.error === 'Username is already taken') {
        // Since this is a simple local/team app, log in directly if user already exists
        currentUser = username;
        localStorage.setItem('shitcoin_username', currentUser);
        loginModal.classList.add('hidden');
        loginForm.reset();
        fetchState(true);
      } else {
        showLoginError(data.error || 'Failed to login');
      }
    } catch (err) {
      console.error(err);
      showLoginError('Network error. Is server running?');
    }
  });

  // Toggle Creator Card
  toggleCreatorBtn.addEventListener('click', () => {
    createEventCard.classList.toggle('hidden');
  });

  closeCreatorBtn.addEventListener('click', () => {
    createEventCard.classList.add('hidden');
  });

  // Add Option Input Dynamically
  addOptionBtn.addEventListener('click', () => {
    const optionCount = optionsContainer.children.length + 1;
    const div = document.createElement('div');
    div.className = 'option-input-wrapper';
    div.innerHTML = `
      <input type="text" class="event-option-input" placeholder="Option ${optionCount}" required>
      <button type="button" class="btn-remove-opt"><i class="fa-solid fa-trash"></i></button>
    `;

    // Remove option listener
    div.querySelector('.btn-remove-opt').addEventListener('click', () => {
      div.remove();
      // Re-index placeholders
      Array.from(optionsContainer.children).forEach((child, index) => {
        child.querySelector('input').placeholder = `Option ${index + 1}`;
      });
    });

    optionsContainer.appendChild(div);
    div.querySelector('input').focus();
  });

  // Create Event Form Submit
  createEventForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('event-title').value.trim();
    const description = document.getElementById('event-desc').value.trim();
    
    const optionInputs = document.querySelectorAll('.event-option-input');
    const options = Array.from(optionInputs).map(input => input.value.trim()).filter(Boolean);

    if (options.length < 2) {
      alert('Please add at least 2 options.');
      return;
    }

    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          options,
          creator: currentUser
        })
      });

      const data = await res.json();
      if (res.ok) {
        createEventForm.reset();
        // Reset option fields to initial 2 fields
        optionsContainer.innerHTML = `
          <div class="option-input-wrapper">
            <input type="text" class="event-option-input" placeholder="Option 1" required>
          </div>
          <div class="option-input-wrapper">
            <input type="text" class="event-option-input" placeholder="Option 2" required>
          </div>
        `;
        createEventCard.classList.add('hidden');
        fetchState(true);
      } else {
        alert(data.error || 'Failed to create event');
      }
    } catch (err) {
      console.error(err);
      alert('Error creating event');
    }
  });

  // Search filter
  eventSearch.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderEvents();
  });
}

// Fetch complete state from backend
async function fetchState(triggerRender = true) {
  try {
    const res = await fetch('/api/state');
    if (!res.ok) throw new Error('Failed to load state');
    
    appState = await res.json();
    
    // Check if current user still exists on server, if not (e.g. db wiped), log out
    const userExists = appState.users.find(u => u.username.toLowerCase() === currentUser.toLowerCase());
    if (!userExists && currentUser) {
      // Silently re-register
      try {
        await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: currentUser })
        });
      } catch (e) {
        logout();
        return;
      }
    }

    renderUserPanel();
    if (triggerRender) {
      renderEvents();
      renderLeaderboard();
    } else {
      // Soft-update: only update elements that don't disrupt user input (payouts, pools, leaderboard data)
      updateDynamicData();
    }
  } catch (err) {
    console.error('State fetching error:', err);
  }
}

// Render User Panel in Header
function renderUserPanel() {
  if (!currentUser) return;
  const user = appState.users.find(u => u.username.toLowerCase() === currentUser.toLowerCase());
  const balance = user ? user.balance : 0;

  userPanel.innerHTML = `
    <div class="user-info">
      <div class="user-name">
        <i class="fa-solid fa-user-ninja"></i>
        <span>${currentUser}</span>
      </div>
      <div class="user-balance">
        <i class="fa-solid fa-coins"></i>
        <span>₹${balance.toLocaleString()}</span>
      </div>
    </div>
    <button id="logout-btn" class="btn btn-secondary btn-sm" title="Switch User">
      <i class="fa-solid fa-right-from-bracket"></i>
    </button>
  `;

  document.getElementById('logout-btn').addEventListener('click', logout);
}

// Log out/Switch user
function logout() {
  localStorage.removeItem('shitcoin_username');
  currentUser = null;
  userPanel.innerHTML = '<div class="loader-spinner"></div>';
  loginModal.classList.remove('hidden');
}

// Show Login Error
function showLoginError(msg) {
  loginError.textContent = msg;
  loginError.classList.remove('hidden');
}

// Render Leaderboard
function renderLeaderboard() {
  if (appState.leaderboard.length === 0) {
    leaderboardList.innerHTML = `<div class="empty-state">No members registered yet.</div>`;
    return;
  }

  leaderboardList.innerHTML = appState.leaderboard.map((user, index) => {
    const rank = index + 1;
    let rankClass = '';
    let rankIcon = rank;

    if (rank === 1) {
      rankClass = 'top-1';
      rankIcon = '<i class="fa-solid fa-crown"></i>';
    } else if (rank === 2) {
      rankClass = 'top-2';
      rankIcon = '<i class="fa-solid fa-medal"></i>';
    } else if (rank === 3) {
      rankClass = 'top-3';
      rankIcon = '<i class="fa-solid fa-award"></i>';
    }

    const isMe = user.username.toLowerCase() === currentUser.toLowerCase() ? 'current-user' : '';

    return `
      <div class="leaderboard-item">
        <span class="rank-val ${rankClass}">${rankIcon}</span>
        <span class="user-val ${isMe}">
          ${user.username} ${isMe ? '<small>(You)</small>' : ''}
        </span>
        <span class="wins-val">${user.wins || 0}</span>
        <span class="bal-val">${user.balance.toLocaleString()}</span>
      </div>
    `;
  }).join('');
}

// Render Events List
function renderEvents() {
  const filteredEvents = appState.events.filter(event => {
    const matchesSearch = event.title.toLowerCase().includes(searchQuery) ||
                          event.description.toLowerCase().includes(searchQuery);
    return matchesSearch;
  });

  // Sort events so open ones are on top, then newer events first
  const sortedEvents = [...filteredEvents].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === 'open' ? -1 : 1;
    }
    return b.id - a.id;
  });

  if (sortedEvents.length === 0) {
    eventsList.innerHTML = `
      <div class="empty-state glass">
        <i class="fa-solid fa-magnifying-glass"></i>
        <p>${searchQuery ? 'No events match your search.' : 'No bets active yet. Create one above!'}</p>
      </div>
    `;
    return;
  }

  eventsList.innerHTML = sortedEvents.map(event => {
    const totalPool = event.bets.reduce((sum, b) => sum + b.amount, 0);
    const userBets = event.bets.filter(b => b.username.toLowerCase() === currentUser.toLowerCase());
    const isResolved = event.status === 'resolved';

    // Group bets by option for calculations
    const optionPools = {};
    event.options.forEach(opt => { optionPools[opt] = 0; });
    event.bets.forEach(b => {
      if (optionPools[b.option] !== undefined) {
        optionPools[b.option] += b.amount;
      }
    });

    if (isResolved) {
      // Render Resolved Event Card
      const winningPool = optionPools[event.winningOption] || 0;
      const payoutItems = event.bets
        .filter(b => b.option === event.winningOption)
        .map(b => {
          const payout = Math.round((b.amount / winningPool) * totalPool);
          return `
            <div class="payout-item">
              <span><strong>${b.username}</strong> bet ₹${b.amount.toLocaleString()}</span>
              <span>Won <strong>+₹${payout.toLocaleString()}</strong></span>
            </div>
          `;
        }).join('');

      return `
        <div class="event-card glass resolved" data-event-id="${event.id}">
          <div class="event-card-header">
            <div class="event-title-area">
              <span class="badge-resolved"><i class="fa-solid fa-circle-check"></i> Resolved</span>
              <h3>${event.title}</h3>
              <div class="meta-info">
                <span><i class="fa-solid fa-user"></i> Creator: ${event.creator}</span>
                <span><i class="fa-solid fa-coins"></i> Total Pool: ₹${totalPool.toLocaleString()}</span>
              </div>
            </div>
            <button class="btn-delete-event" onclick="deleteEvent('${event.id}')" title="Delete History">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
          
          <p class="event-desc">${event.description || 'No description provided.'}</p>
          
          <div class="winning-banner">
            <p>Winning Option: <strong>${event.winningOption}</strong></p>
            ${payoutItems ? `
              <div class="payouts-list">
                <h4 style="font-size:0.8rem; margin-bottom:0.25rem;">Payouts:</h4>
                ${payoutItems}
              </div>
            ` : '<p style="font-size:0.8rem; color:var(--text-secondary);">No winning bets were placed. All wagers refunded.</p>'}
          </div>
        </div>
      `;
    }

    // Render Open Event Card
    const selectedOption = selectedOptions[event.id] || '';
    
    // Generate Option Selector buttons with odds
    const optionButtons = event.options.map(opt => {
      const optPool = optionPools[opt] || 0;
      // Parimutuel odds calculation: totalPool / optionPool
      const odds = optPool > 0 ? (totalPool / optPool).toFixed(2) + 'x' : 'New';
      const isActive = selectedOption === opt ? 'active' : '';
      
      return `
        <button class="option-select-btn ${isActive}" onclick="selectEventOption('${event.id}', '${opt}')">
          <span class="option-name">${opt}</span>
          <span class="option-odds">${odds} (₹${optPool.toLocaleString()})</span>
        </button>
      `;
    }).join('');

    // List of all user wagers
    const wagerBadges = event.bets.map(b => `
      <div class="bet-badge">
        <span><strong>${b.username}</strong> on ${b.option}</span>
        <span>₹${b.amount.toLocaleString()}</span>
      </div>
    `).join('');

    return `
      <div class="event-card glass" data-event-id="${event.id}">
        <div class="event-card-header">
          <div class="event-title-area">
            <h3>${event.title}</h3>
            <div class="meta-info">
              <span><i class="fa-solid fa-user"></i> Creator: ${event.creator}</span>
              <span><i class="fa-solid fa-clock"></i> Status: Open</span>
            </div>
          </div>
          <button class="btn-delete-event" onclick="deleteEvent('${event.id}')" title="Delete & Refund">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>

        <p class="event-desc">${event.description || 'No description provided.'}</p>

        <div class="pool-info">
          <span>Active Pool:</span>
          <span class="pool-amount">₹${totalPool.toLocaleString()}</span>
        </div>

        <!-- Betting Form -->
        <div class="bet-form-section">
          <div class="options-selector-grid">
            ${optionButtons}
          </div>

          <div class="bet-input-row" style="justify-content: space-between;">
            <div class="static-bet-badge" style="font-family: var(--font-title); font-weight: 700; font-size: 1.05rem; color: var(--primary); display: flex; align-items: center; gap: 0.5rem; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); padding: 0.6rem 1rem; border-radius: 10px;">
              <span>Wager Size:</span>
              <span style="background: linear-gradient(135deg, var(--primary), var(--primary-hover)); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">₹500</span>
            </div>
            <button class="btn btn-primary" onclick="placeBet('${event.id}')">
              <i class="fa-solid fa-coins"></i> Place Bet
            </button>
          </div>

          <div id="projection-${event.id}" class="odds-preview hidden">
            <span>Projected Odds: <strong id="proj-odds-${event.id}">1.0x</strong></span>
            <span>Est. Payout: <strong id="proj-payout-${event.id}">₹0</strong></span>
          </div>
        </div>

        <!-- Display Bets placed so far -->
        ${event.bets.length > 0 ? `
          <div class="active-bets-display">
            <div class="active-bets-header">
              <i class="fa-solid fa-receipt"></i> Active Bets (${event.bets.length})
            </div>
            <div class="active-bets-list">
              ${wagerBadges}
            </div>
          </div>
        ` : ''}

        <!-- Settlement (Admin/Creator resolving options) -->
        <div class="resolve-panel">
          <h4>Settle Event:</h4>
          <div class="resolve-input-group">
            <select id="resolve-select-${event.id}" class="resolve-select">
              <option value="" disabled selected>Select Winning Option</option>
              ${event.options.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
            </select>
            <button class="btn btn-success btn-sm" onclick="resolveEvent('${event.id}')">
              Resolve
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Handle option selection
window.selectEventOption = function(eventId, option) {
  selectedOptions[eventId] = option;
  
  // Update UI buttons state directly
  const card = document.querySelector(`.event-card[data-event-id="${eventId}"]`);
  if (card) {
    const buttons = card.querySelectorAll('.option-select-btn');
    buttons.forEach(btn => {
      const name = btn.querySelector('.option-name').textContent;
      if (name === option) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }
  
  updatePayoutProjection(eventId);
};

// Set quick bet amounts
window.setQuickBet = function(eventId, amount) {
  const input = document.getElementById(`bet-input-${eventId}`);
  if (!input) return;

  const user = appState.users.find(u => u.username.toLowerCase() === currentUser.toLowerCase());
  const maxBalance = user ? user.balance : 0;

  if (amount === 'max') {
    input.value = maxBalance;
  } else {
    const currentVal = parseInt(input.value) || 0;
    input.value = Math.min(currentVal + amount, maxBalance);
  }

  updatePayoutProjection(eventId);
};

// Update payout prediction in real-time
window.updatePayoutProjection = function(eventId) {
  const event = appState.events.find(e => e.id === eventId);
  const projectionDiv = document.getElementById(`projection-${eventId}`);
  
  if (!event || !projectionDiv) return;

  const selectedOption = selectedOptions[eventId];
  const betAmount = 500; // Hardcoded to 500!

  if (!selectedOption) {
    projectionDiv.classList.add('hidden');
    return;
  }

  projectionDiv.classList.remove('hidden');

  // Perform parimutuel math
  const totalPool = event.bets.reduce((sum, b) => sum + b.amount, 0);
  
  // Calculate total wagers on selected option
  const optPool = event.bets
    .filter(b => b.option === selectedOption)
    .reduce((sum, b) => sum + b.amount, 0);

  const simulatedTotalPool = totalPool + betAmount;
  const simulatedOptPool = optPool + betAmount;

  const multiplier = (simulatedTotalPool / simulatedOptPool).toFixed(2);
  const estPayout = Math.round((betAmount / simulatedOptPool) * simulatedTotalPool);

  document.getElementById(`proj-odds-${eventId}`).textContent = `${multiplier}x`;
  document.getElementById(`proj-payout-${eventId}`).textContent = `₹${estPayout.toLocaleString()}`;
};

// Place Bet API call
window.placeBet = async function(eventId) {
  const option = selectedOptions[eventId];
  if (!option) {
    alert('Please select a betting option first!');
    return;
  }

  const amount = 500; // Fixed bet size of 500!

  try {
    const res = await fetch(`/api/events/${eventId}/bet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: currentUser,
        option,
        amount
      })
    });

    const data = await res.json();
    if (res.ok) {
      delete selectedOptions[eventId];
      fetchState(true);
    } else {
      alert(data.error || 'Failed to place bet');
    }
  } catch (err) {
    console.error(err);
    alert('Error placing bet');
  }
};

// Resolve Event API call
window.resolveEvent = async function(eventId) {
  const select = document.getElementById(`resolve-select-${eventId}`);
  if (!select) return;

  const winningOption = select.value;
  if (!winningOption) {
    alert('Please select a winning option first.');
    return;
  }

  const confirmed = confirm(`Are you sure you want to resolve this event with winning option: "${winningOption}"? This will payout all winners.`);
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/events/${eventId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ winningOption })
    });

    const data = await res.json();
    if (res.ok) {
      fetchState(true);
    } else {
      alert(data.error || 'Failed to resolve event');
    }
  } catch (err) {
    console.error(err);
    alert('Error resolving event');
  }
};

// Delete Event API call
window.deleteEvent = async function(eventId) {
  const confirmed = confirm('Are you sure you want to delete this event? Active bets will be fully refunded to user balances.');
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/events/${eventId}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      fetchState(true);
    } else {
      alert(data.error || 'Failed to delete event');
    }
  } catch (err) {
    console.error(err);
    alert('Error deleting event');
  }
};

// Soft-update data in the background (avoid rebuilding layout if user typing)
function updateDynamicData() {
  // Update user panel balance
  const user = appState.users.find(u => u.username.toLowerCase() === currentUser.toLowerCase());
  if (user) {
    const balSpan = document.querySelector('.user-balance span');
    if (balSpan) balSpan.textContent = `₹${user.balance.toLocaleString()}`;
  }

  // Update leaderboard
  renderLeaderboard();

  // We only update event pools and existing odds, but we do not reload the whole DOM
  // to avoid clearing selected option states.
  appState.events.forEach(event => {
    const card = document.querySelector(`.event-card[data-event-id="${event.id}"]`);
    if (!card) return;

    const totalPool = event.bets.reduce((sum, b) => sum + b.amount, 0);
    const poolAmtSpan = card.querySelector('.pool-amount');
    if (poolAmtSpan) {
      poolAmtSpan.textContent = `₹${totalPool.toLocaleString()}`;
    }

    // Group bets by option
    const optionPools = {};
    event.options.forEach(opt => { optionPools[opt] = 0; });
    event.bets.forEach(b => {
      if (optionPools[b.option] !== undefined) {
        optionPools[b.option] += b.amount;
      }
    });

    // Update odds badge text inside options
    if (event.status === 'open') {
      const optButtons = card.querySelectorAll('.option-select-btn');
      optButtons.forEach(btn => {
        const optName = btn.querySelector('.option-name').textContent;
        const optPool = optionPools[optName] || 0;
        const odds = optPool > 0 ? (totalPool / optPool).toFixed(2) + 'x' : 'New';
        const oddsSpan = btn.querySelector('.option-odds');
        if (oddsSpan) {
          oddsSpan.textContent = `${odds} (₹${optPool.toLocaleString()})`;
        }
      });

      // Update projected values if currently estimating
      updatePayoutProjection(event.id);
    }
  });
}
