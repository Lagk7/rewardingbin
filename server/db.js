// server/db.js - SQLite Database for ECO BIN
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'ecobin.sqlite');
const db = new DatabaseSync(dbPath);

// Enable WAL mode and foreign keys for high performance and integrity
db.exec('PRAGMA foreign_keys = ON;');

// Initialize Tables
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      total_points INTEGER DEFAULT 0,
      total_weight_grams REAL DEFAULT 0,
      deposit_count INTEGER DEFAULT 0,
      avatar TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS deposits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      device_id TEXT NOT NULL DEFAULT 'ECOBIN-001',
      weight_grams REAL NOT NULL,
      average_weight_grams REAL NOT NULL,
      points_earned INTEGER NOT NULL,
      source TEXT DEFAULT 'arduino',
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bin_devices (
      device_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'offline',
      last_weight REAL DEFAULT 0,
      active_user_id INTEGER,
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (active_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Ensure default bin device exists
  const checkBin = db.prepare('SELECT device_id FROM bin_devices WHERE device_id = ?').get('ECOBIN-001');
  if (!checkBin) {
    db.prepare(`
      INSERT INTO bin_devices (device_id, name, status, last_weight, active_user_id)
      VALUES (?, ?, ?, ?, ?)
    `).run('ECOBIN-001', 'Eco Rewarding Bin (Arduino Uno + HX711)', 'ready', 0, null);
  }

  // Seed sample users & activity if empty
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count === 0) {
    seedDatabase();
  }
}

// Password hashing helpers
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const testHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return testHash === hash;
}

// Seed mock data for realistic presentation
function seedDatabase() {
  console.log('[DB] Seeding initial Eco Champions and default user...');

  const initialUsers = [
    { name: 'Eco Explorer (Demo)', email: 'demo@ecobin.com', password: 'password123', avatar: '🌱' },
    { name: 'Aarav Sharma', email: 'aarav@greenmail.org', password: 'password123', avatar: '🌿' },
    { name: 'Priya Patel', email: 'priya@ecoplanet.io', password: 'password123', avatar: '🍃' },
    { name: 'Rohan Mehta', email: 'rohan@recycle.net', password: 'password123', avatar: '🌍' },
    { name: 'Ananya Verma', email: 'ananya@cleanearth.com', password: 'password123', avatar: '🌲' },
  ];

  for (const u of initialUsers) {
    const { hash, salt } = hashPassword(u.password);
    db.prepare(`
      INSERT INTO users (name, email, password_hash, salt, avatar)
      VALUES (?, ?, ?, ?, ?)
    `).run(u.name, u.email, hash, salt, u.avatar);
  }

  // Add initial sample deposits to demonstrate leaderboard and history
  const demoUser = db.prepare('SELECT id FROM users WHERE email = ?').get('demo@ecobin.com');
  const aarav = db.prepare('SELECT id FROM users WHERE email = ?').get('aarav@greenmail.org');
  const priya = db.prepare('SELECT id FROM users WHERE email = ?').get('priya@ecoplanet.io');
  const rohan = db.prepare('SELECT id FROM users WHERE email = ?').get('rohan@recycle.net');
  const ananya = db.prepare('SELECT id FROM users WHERE email = ?').get('ananya@cleanearth.com');

  const sampleDeposits = [
    { userId: aarav.id, weight: 650, avg: 650, pts: 65, note: 'Plastic bottles & aluminum cans' },
    { userId: aarav.id, weight: 420, avg: 535, pts: 42, note: 'Cardboard carton packaging' },
    { userId: priya.id, weight: 890, avg: 890, pts: 89, note: 'Paper stationery & magazines' },
    { userId: priya.id, weight: 340, avg: 615, pts: 34, note: 'Beverage containers' },
    { userId: rohan.id, weight: 510, avg: 510, pts: 51, note: 'Clean PET bottles' },
    { userId: ananya.id, weight: 380, avg: 380, pts: 38, note: 'Glass beverage bottles' },
    { userId: demoUser.id, weight: 250, avg: 250, pts: 25, note: 'Crushed soda cans' },
    { userId: demoUser.id, weight: 180, avg: 215, pts: 18, note: 'Plastic bottles' }
  ];

  for (const dep of sampleDeposits) {
    db.prepare(`
      INSERT INTO deposits (user_id, device_id, weight_grams, average_weight_grams, points_earned, source, notes)
      VALUES (?, 'ECOBIN-001', ?, ?, ?, 'arduino', ?)
    `).run(dep.userId, dep.weight, dep.avg, dep.pts, dep.note);

    db.prepare(`
      UPDATE users 
      SET total_points = total_points + ?,
          total_weight_grams = total_weight_grams + ?,
          deposit_count = deposit_count + 1
      WHERE id = ?
    `).run(dep.pts, dep.weight, dep.userId);
  }

  // Bind demo user as the initial active user for ECOBIN-001
  db.prepare(`
    UPDATE bin_devices 
    SET active_user_id = ?, status = 'online'
    WHERE device_id = 'ECOBIN-001'
  `).run(demoUser.id);

  console.log('[DB] Seeding complete.');
}

// User methods
function registerUser(name, email, password) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (existing) {
    throw new Error('An account with this email already exists.');
  }
  const { hash, salt } = hashPassword(password);
  const avatars = ['🌱', '🌿', '🍃', '🌍', '🌲', '🌸', '🌻', '🌾'];
  const avatar = avatars[Math.floor(Math.random() * avatars.length)];

  const info = db.prepare(`
    INSERT INTO users (name, email, password_hash, salt, avatar)
    VALUES (?, ?, ?, ?, ?)
  `).run(name.trim(), email.trim().toLowerCase(), hash, salt, avatar);

  return getUserById(info.lastInsertRowid);
}

function authenticateUser(email, password) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (!user) {
    return null;
  }
  const valid = verifyPassword(password, user.password_hash, user.salt);
  if (!valid) {
    return null;
  }
  return getUserById(user.id);
}

function getUserById(id) {
  const user = db.prepare(`
    SELECT id, name, email, total_points, total_weight_grams, deposit_count, avatar, created_at
    FROM users WHERE id = ?
  `).get(id);

  if (!user) return null;

  // Compute average weight
  const avgWeight = user.deposit_count > 0 ? (user.total_weight_grams / user.deposit_count) : 0;
  return {
    ...user,
    average_weight_grams: Math.round(avgWeight * 10) / 10
  };
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
  db.prepare(`
    INSERT INTO sessions (token, user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(token, userId, expiresAt);
  return token;
}

function getSessionUser(token) {
  if (!token) return null;
  const session = db.prepare(`
    SELECT user_id FROM sessions 
    WHERE token = ? AND (expires_at IS NULL OR expires_at > datetime('now'))
  `).get(token);

  if (!session) return null;
  return getUserById(session.user_id);
}

function removeSession(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

// Deposit and Point methods
function recordDeposit({ userId, deviceId = 'ECOBIN-001', weightGrams, averageWeightGrams, pointsEarned, source = 'manual-entry', notes = '' }) {
  // If points not specified, calculate: 10 grams = 1 point
  const weight = parseFloat(weightGrams) || 0;
  if (weight <= 0) {
    throw new Error('Weight must be greater than 0 grams.');
  }

  // Points rule: 10 grams = 1 point
  const calculatedPoints = pointsEarned !== undefined ? parseInt(pointsEarned, 10) : Math.floor(weight / 10);
  
  // Calculate accurate running average weight for this user
  const existingUser = getUserById(userId);
  const newTotalWeight = (existingUser ? existingUser.total_weight_grams : 0) + weight;
  const newDepositCount = (existingUser ? existingUser.deposit_count : 0) + 1;
  const runningAvg = Math.round((newTotalWeight / newDepositCount) * 10) / 10;
  const avgWeight = averageWeightGrams ? parseFloat(averageWeightGrams) : runningAvg;

  const insertStmt = db.prepare(`
    INSERT INTO deposits (user_id, device_id, weight_grams, average_weight_grams, points_earned, source, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const info = insertStmt.run(userId, deviceId, weight, avgWeight, calculatedPoints, source, notes);

  // Update user statistics
  db.prepare(`
    UPDATE users
    SET total_points = total_points + ?,
        total_weight_grams = total_weight_grams + ?,
        deposit_count = deposit_count + 1
    WHERE id = ?
  `).run(calculatedPoints, weight, userId);

  // Update bin state
  db.prepare(`
    UPDATE bin_devices
    SET last_weight = ?, last_seen = CURRENT_TIMESTAMP, status = 'online'
    WHERE device_id = ?
  `).run(weight, deviceId);

  const updatedUser = getUserById(userId);
  const deposit = db.prepare('SELECT * FROM deposits WHERE id = ?').get(info.lastInsertRowid);

  return {
    deposit,
    user: updatedUser,
    pointsAwarded: calculatedPoints
  };
}

// Dashboard statistics
function getUserDashboard(userId) {
  const user = getUserById(userId);
  if (!user) return null;

  // User rank on leaderboard
  const rankQuery = db.prepare(`
    SELECT COUNT(*) + 1 as rank
    FROM users
    WHERE total_points > ? OR (total_points = ? AND total_weight_grams > ?)
  `).get(user.total_points, user.total_points, user.total_weight_grams);

  const rank = rankQuery ? rankQuery.rank : 1;

  // Recent 5 user deposits
  const recentDeposits = db.prepare(`
    SELECT id, device_id, weight_grams, points_earned, source, notes, created_at
    FROM deposits
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 5
  `).all(userId);

  // Global activity (last 5 from any user)
  const globalRecent = db.prepare(`
    SELECT d.id, d.device_id, d.weight_grams, d.points_earned, d.created_at, u.name as user_name, u.avatar
    FROM deposits d
    JOIN users u ON d.user_id = u.id
    ORDER BY d.created_at DESC
    LIMIT 6
  `).all();

  // Active bin status
  const bin = db.prepare('SELECT * FROM bin_devices WHERE device_id = ?').get('ECOBIN-001') || {
    device_id: 'ECOBIN-001',
    name: 'Eco Rewarding Bin (Arduino Uno + HX711)',
    status: 'ready',
    last_weight: 0
  };

  return {
    user,
    rank,
    totalKg: Math.round((user.total_weight_grams / 1000) * 100) / 100,
    averageGrams: user.average_weight_grams,
    recentDeposits,
    globalRecent,
    bin
  };
}

// Leaderboard query
function getLeaderboard(limit = 50) {
  const rows = db.prepare(`
    SELECT id, name, email, total_points, total_weight_grams, deposit_count, avatar, created_at
    FROM users
    ORDER BY total_points DESC, total_weight_grams DESC
    LIMIT ?
  `).all(limit);

  return rows.map((u, index) => {
    const avg = u.deposit_count > 0 ? (u.total_weight_grams / u.deposit_count) : 0;
    return {
      ...u,
      rank: index + 1,
      total_weight_kg: Math.round((u.total_weight_grams / 1000) * 100) / 100,
      average_weight_grams: Math.round(avg * 10) / 10
    };
  });
}

// History query
function getUserHistory(userId, limit = 100) {
  return db.prepare(`
    SELECT id, device_id, weight_grams, average_weight_grams, points_earned, source, notes, created_at
    FROM deposits
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(userId, limit);
}

// Bin management
function getBinStatus(deviceId = 'ECOBIN-001') {
  const bin = db.prepare(`
    SELECT b.*, u.name as active_user_name, u.email as active_user_email
    FROM bin_devices b
    LEFT JOIN users u ON b.active_user_id = u.id
    WHERE b.device_id = ?
  `).get(deviceId);
  return bin;
}

function bindActiveUser(deviceId = 'ECOBIN-001', userId) {
  db.prepare(`
    UPDATE bin_devices
    SET active_user_id = ?, last_seen = CURRENT_TIMESTAMP
    WHERE device_id = ?
  `).run(userId, deviceId);
  return getBinStatus(deviceId);
}

function updateBinTelemetry(deviceId = 'ECOBIN-001', weight, status = 'online') {
  db.prepare(`
    UPDATE bin_devices
    SET last_weight = ?, status = ?, last_seen = CURRENT_TIMESTAMP
    WHERE device_id = ?
  `).run(weight, status, deviceId);
}

// Initialize tables immediately
initSchema();

module.exports = {
  db,
  registerUser,
  authenticateUser,
  getUserById,
  createSession,
  getSessionUser,
  removeSession,
  recordDeposit,
  getUserDashboard,
  getLeaderboard,
  getUserHistory,
  getBinStatus,
  bindActiveUser,
  updateBinTelemetry
};
