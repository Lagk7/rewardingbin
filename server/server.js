// server/server.js - ECO BIN Web Server & Arduino API Bridge
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// SSE Client Registry for real-time live scale & deposit events
const sseClients = new Set();

function broadcastSSE(eventType, data) {
  const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.res.write(message);
    } catch (err) {
      console.error('[SSE] Error writing to client:', err.message);
      sseClients.delete(client);
    }
  }
}

// In-memory live bin state cache for instant scale feedback
const liveBinState = {
  deviceId: 'ECOBIN-001',
  currentWeight: 0,
  averageWeight: 0,
  isStable: false,
  readingsWindow: [],
  lastUpdated: Date.now(),
  status: 'online'
};

// Authentication Middleware
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const user = db.getSessionUser(token);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Invalid or expired session' });
  }

  req.user = user;
  req.token = token;
  next();
}

// Optional Auth (attaches req.user if token present)
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    req.user = db.getSessionUser(token);
    req.token = token;
  }
  next();
}

// ==================== AUTH ROUTES ====================

// Register
app.post('/api/auth/register', (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Name, email, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    const user = db.registerUser(name, email, password);
    const token = db.createSession(user.id);

    // Automatically bind the newly registered user to ECOBIN-001
    db.bindActiveUser('ECOBIN-001', user.id);

    broadcastSSE('bin-status', db.getBinStatus('ECOBIN-001'));

    res.status(201).json({
      success: true,
      user,
      token,
      message: 'Account created successfully! Welcome to Eco Bin.'
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Login
app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const user = db.authenticateUser(email, password);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const token = db.createSession(user.id);

    // Bind this user to ECOBIN-001
    db.bindActiveUser('ECOBIN-001', user.id);
    broadcastSSE('bin-status', db.getBinStatus('ECOBIN-001'));

    res.json({
      success: true,
      user,
      token,
      message: `Welcome back, ${user.name}!`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Quick Demo Login (Convenient 1-click test for examiners/users)
app.post('/api/auth/quick-demo', (req, res) => {
  try {
    const demoUser = db.authenticateUser('demo@ecobin.com', 'password123');
    if (!demoUser) {
      return res.status(404).json({ success: false, error: 'Demo user not found' });
    }

    const token = db.createSession(demoUser.id);
    db.bindActiveUser('ECOBIN-001', demoUser.id);
    broadcastSSE('bin-status', db.getBinStatus('ECOBIN-001'));

    res.json({
      success: true,
      user: demoUser,
      token,
      message: 'Logged in as Eco Explorer (Demo User)!'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Current User Profile
app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ success: true, user: req.user });
});

// Logout
app.post('/api/auth/logout', authMiddleware, (req, res) => {
  db.removeSession(req.token);
  res.json({ success: true, message: 'Logged out successfully' });
});

// ==================== DASHBOARD & METRICS ====================

app.get('/api/dashboard', authMiddleware, (req, res) => {
  try {
    const dashboard = db.getUserDashboard(req.user.id);
    res.json({ success: true, dashboard });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Leaderboard
app.get('/api/leaderboard', (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const leaderboard = db.getLeaderboard(limit);
    res.json({ success: true, leaderboard });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reward History
app.get('/api/history', authMiddleware, (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 100;
    const history = db.getUserHistory(req.user.id, limit);
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== GARBAGE WEIGHT & REWARD CALCULATION ====================

// Manual or Form Weight Deposit
// Rule: 10 grams = 1 point
app.post('/api/deposits/manual', optionalAuth, (req, res) => {
  try {
    const { weightGrams, notes, category, deviceId = 'ECOBIN-001' } = req.body;
    const weight = parseFloat(weightGrams);

    if (isNaN(weight) || weight <= 0) {
      return res.status(400).json({ success: false, error: 'Please enter a valid weight greater than 0 grams.' });
    }

    // Determine target user
    // Priority:
    // 1. Authenticated user from Bearer token
    // 2. Explicit userId passed in request
    // 3. Current active user assigned to the bin
    // 4. Default demo user
    let targetUserId = null;
    let sessionToken = null;

    if (req.user) {
      targetUserId = req.user.id;
      sessionToken = req.token;
    } else if (req.body.userId) {
      targetUserId = req.body.userId;
    } else {
      const bin = db.getBinStatus(deviceId);
      if (bin && bin.active_user_id) {
        targetUserId = bin.active_user_id;
      } else {
        const defaultUser = db.authenticateUser('demo@ecobin.com', 'password123');
        targetUserId = defaultUser ? defaultUser.id : 1;
      }
      // Issue session token so browser can seamlessly retain points and profile
      sessionToken = db.createSession(targetUserId);
    }

    // 10 grams = 1 point rule
    const pointsEarned = Math.floor(weight / 10);
    const itemDescription = notes || (category ? `${category} Recycling` : 'Manual Eco Deposit');

    const result = db.recordDeposit({
      userId: targetUserId,
      deviceId,
      weightGrams: weight,
      pointsEarned,
      source: 'manual-input',
      notes: itemDescription
    });

    // Reset live scale cache to zero after successful deposit
    liveBinState.currentWeight = 0;
    liveBinState.averageWeight = 0;
    liveBinState.isStable = false;

    // Notify real-time stream of deposit celebration
    broadcastSSE('deposit-awarded', {
      user: result.user,
      deposit: result.deposit,
      pointsAwarded: pointsEarned,
      averageWeight: result.user.average_weight_grams,
      deviceId,
      message: `🎉 Great job! You earned ${pointsEarned} Eco Points for depositing ${weight}g!`
    });

    // Also broadcast updated zeroed scale reading
    broadcastSSE('scale-reading', {
      deviceId,
      weight: 0,
      averageWeight: 0,
      isStable: false,
      timestamp: Date.now(),
      previewPoints: 0
    });

    res.json({
      success: true,
      pointsEarned,
      deposit: result.deposit,
      user: result.user,
      token: sessionToken,
      message: `Successfully deposited ${weight}g and earned ${pointsEarned} Eco Points!`
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ==================== ARDUINO & PYTHON BRIDGE API ====================

// 1. Live Telemetry stream from Arduino / Python Bridge
// Python bridge posts live readings (e.g. every 200-500ms)
app.post('/api/bin/telemetry', (req, res) => {
  const { deviceId = 'ECOBIN-001', weight = 0, isStable = false, rawReadings = [] } = req.body;

  liveBinState.deviceId = deviceId;
  liveBinState.currentWeight = Math.round(parseFloat(weight) * 10) / 10;
  liveBinState.isStable = !!isStable;
  liveBinState.lastUpdated = Date.now();
  liveBinState.status = 'online';

  if (Array.isArray(rawReadings) && rawReadings.length > 0) {
    const sum = rawReadings.reduce((a, b) => a + Number(b), 0);
    liveBinState.averageWeight = Math.round((sum / rawReadings.length) * 10) / 10;
    liveBinState.readingsWindow = rawReadings;
  } else {
    liveBinState.averageWeight = liveBinState.currentWeight;
  }

  // Update DB telemetry
  db.updateBinTelemetry(deviceId, liveBinState.currentWeight, 'online');

  // Broadcast to all open web browser clients
  broadcastSSE('scale-reading', {
    deviceId,
    weight: liveBinState.currentWeight,
    averageWeight: liveBinState.averageWeight,
    isStable: liveBinState.isStable,
    timestamp: liveBinState.lastUpdated,
    // Calculate preview points in real-time (10g = 1pt)
    previewPoints: Math.floor(liveBinState.averageWeight / 10)
  });

  res.json({ success: true, received: true });
});

// 2. Arduino Final Deposit - Automatic Point Awarding based on Average Weight!
// Called by Python bridge when weight stabilizes on the HX711 scale
app.post('/api/bin/deposit', optionalAuth, (req, res) => {
  try {
    const {
      deviceId = 'ECOBIN-001',
      weightGrams,
      averageWeightGrams,
      readingsCount = 5,
      source = 'arduino-hx711',
      notes = 'Arduino HX711 Automated Deposit'
    } = req.body;

    // Determine target user
    // Priority:
    // 1. If explicit userId provided in body
    // 2. If authenticated token provided in header
    // 3. Otherwise, use the user currently bound to the bin in DB
    let targetUserId = req.body.userId;
    if (!targetUserId && req.user) {
      targetUserId = req.user.id;
    }
    if (!targetUserId) {
      const bin = db.getBinStatus(deviceId);
      if (bin && bin.active_user_id) {
        targetUserId = bin.active_user_id;
      }
    }

    if (!targetUserId) {
      // Fallback to first user in system if no one is explicitly logged in
      const defaultUser = db.authenticateUser('demo@ecobin.com', 'password123');
      targetUserId = defaultUser ? defaultUser.id : 1;
    }

    const avgWeight = averageWeightGrams !== undefined ? parseFloat(averageWeightGrams) : parseFloat(weightGrams);
    const weight = weightGrams !== undefined ? parseFloat(weightGrams) : avgWeight;

    if (isNaN(avgWeight) || avgWeight <= 0) {
      return res.status(400).json({ success: false, error: 'Valid positive weight is required' });
    }

    // RULE: 10 grams = 1 point based on average weight!
    const pointsAwarded = Math.floor(avgWeight / 10);

    const result = db.recordDeposit({
      userId: targetUserId,
      deviceId,
      weightGrams: weight,
      averageWeightGrams: avgWeight,
      pointsEarned: pointsAwarded,
      source,
      notes: `${notes} (Avg: ${avgWeight}g over ${readingsCount} readings)`
    });

    const targetUser = db.getUserById(targetUserId);

    // Reset live state
    liveBinState.currentWeight = 0;
    liveBinState.averageWeight = 0;
    liveBinState.isStable = false;

    // Broadcast celebratory event to all web clients!
    broadcastSSE('deposit-awarded', {
      user: targetUser,
      deposit: result.deposit,
      pointsAwarded,
      averageWeight: avgWeight,
      deviceId,
      message: `🌿 ${targetUser.name} deposited ${avgWeight}g average weight & earned ${pointsAwarded} Eco Points!`
    });

    // Also broadcast updated scale zeroing
    broadcastSSE('scale-reading', {
      deviceId,
      weight: 0,
      averageWeight: 0,
      isStable: false,
      timestamp: Date.now(),
      previewPoints: 0
    });

    res.json({
      success: true,
      deviceId,
      userId: targetUserId,
      userName: targetUser.name,
      averageWeightGrams: avgWeight,
      pointsAwarded,
      user: targetUser,
      deposit: result.deposit,
      message: `Points awarded: ${pointsAwarded} pts for ${avgWeight}g average weight!`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Bind Logged-in User to ECOBIN-001
app.post('/api/bin/bind', authMiddleware, (req, res) => {
  const { deviceId = 'ECOBIN-001' } = req.body;
  const updatedBin = db.bindActiveUser(deviceId, req.user.id);
  broadcastSSE('bin-status', updatedBin);
  res.json({
    success: true,
    bin: updatedBin,
    message: `Your account (${req.user.name}) is now connected to ${deviceId}!`
  });
});

// Get Bin Status
app.get('/api/bin/status', (req, res) => {
  const deviceId = req.query.deviceId || 'ECOBIN-001';
  const bin = db.getBinStatus(deviceId);
  res.json({
    success: true,
    bin,
    liveState: liveBinState
  });
});

// Interactive Bin Simulator Endpoint (Test live weighing, averaging, and reward without hardware!)
app.post('/api/bin/simulate', optionalAuth, (req, res) => {
  try {
    const { action = 'deposit', weight = 150, readingsCount = 6 } = req.body;
    const deviceId = 'ECOBIN-001';

    let targetUserId = req.body.userId;
    if (!targetUserId && req.user) targetUserId = req.user.id;
    if (!targetUserId) {
      const bin = db.getBinStatus(deviceId);
      targetUserId = bin && bin.active_user_id ? bin.active_user_id : 1;
    }

    if (action === 'live-stream') {
      // Stream simulated fluctuating load cell reading
      const jitter = (Math.random() - 0.5) * 4;
      const currentGrams = Math.max(0, Math.round((parseFloat(weight) + jitter) * 10) / 10);
      liveBinState.currentWeight = currentGrams;
      liveBinState.averageWeight = parseFloat(weight);
      liveBinState.isStable = true;

      broadcastSSE('scale-reading', {
        deviceId,
        weight: currentGrams,
        averageWeight: parseFloat(weight),
        isStable: true,
        previewPoints: Math.floor(parseFloat(weight) / 10),
        timestamp: Date.now()
      });

      return res.json({ success: true, simulatedWeight: currentGrams });
    }

    // Deposit action
    const avgWeight = Math.round(parseFloat(weight) * 10) / 10;
    const pointsAwarded = Math.floor(avgWeight / 10);

    const result = db.recordDeposit({
      userId: targetUserId,
      deviceId,
      weightGrams: avgWeight,
      averageWeightGrams: avgWeight,
      pointsEarned: pointsAwarded,
      source: 'arduino-simulation',
      notes: `Simulated HX711 measurement (${avgWeight}g over ${readingsCount} samples)`
    });

    const user = db.getUserById(targetUserId);

    broadcastSSE('deposit-awarded', {
      user,
      deposit: result.deposit,
      pointsAwarded,
      averageWeight: avgWeight,
      deviceId,
      message: `🌿 ${user.name} deposited ${avgWeight}g and earned ${pointsAwarded} Eco Points!`
    });

    // Reset live scale
    liveBinState.currentWeight = 0;
    liveBinState.averageWeight = 0;
    liveBinState.isStable = false;
    broadcastSSE('scale-reading', {
      deviceId,
      weight: 0,
      averageWeight: 0,
      isStable: false,
      previewPoints: 0,
      timestamp: Date.now()
    });

    res.json({
      success: true,
      user,
      pointsAwarded,
      deposit: result.deposit,
      message: `Simulated deposit completed! Awarded ${pointsAwarded} points for ${avgWeight}g.`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== REAL-TIME SERVER-SENT EVENTS (SSE) ====================

app.get('/api/live-stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const client = { id: Date.now(), res };
  sseClients.add(client);

  // Send initial state immediately
  res.write(`event: init\ndata: ${JSON.stringify({
    binStatus: db.getBinStatus('ECOBIN-001'),
    liveState: liveBinState
  })}\n\n`);

  req.on('close', () => {
    sseClients.delete(client);
  });
});

// Fallback to index.html for SPA client navigation
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` 🌱 ECO BIN Web Server is running!`);
  console.log(` 🌐 Website URL:        http://localhost:${PORT}`);
  console.log(` 🔌 Arduino Bridge API: http://localhost:${PORT}/api/bin`);
  console.log(` 📡 Realtime SSE:       http://localhost:${PORT}/api/live-stream`);
  console.log(` 📦 Device ID:          ECOBIN-001`);
  console.log(`=======================================================`);
});
