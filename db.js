const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const DB_PATH = './data/ideas.db';
const BACKUP_DIR = './data/backups';

const STARTER_SYMPTOMS = [
    { tag: '⚡ Cramps', hasSeverity: 1 },
    { tag: '🤕 Migraine', hasSeverity: 1 },
    { tag: '🍫 Cravings', hasSeverity: 1 },
    { tag: '😴 Fatigue', hasSeverity: 1 },
    { tag: '🥺 Moody', hasSeverity: 1 },
    { tag: '🎈 Bloating', hasSeverity: 1 },
    { tag: '😣 Tender Breasts', hasSeverity: 1 },
    { tag: '💤 Poor Sleep', hasSeverity: 1 },
    { tag: '✨ High Energy', hasSeverity: 0 },
    { tag: '🌶️ Horny', hasSeverity: 1 }
];

const STARTER_CUISINES = [
    '🍝 Italian', '🍣 Sushi/Asian', '🌮 Mexican', '🍔 Burgers',
    '🥐 Brunch/Cafe', '🥩 Steakhouse', '🦐 Seafood', '🍸 Bar/Tapas', '🍦 Dessert'
];

// Automated Server-Side SQLite Backup (Keeps last 7 daily backups)
function runServerSideBackup() {
    try {
        if (!fs.existsSync(DB_PATH)) return;
        if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

        const dateStamp = new Date().toISOString().split('T')[0];
        const destFile = path.join(BACKUP_DIR, `ideas-${dateStamp}.db.bak`);
        if (!fs.existsSync(destFile)) {
            fs.copyFileSync(DB_PATH, destFile);
            console.log(`[P³ Backup] Saved daily backup: ${destFile}`);
        }

        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.endsWith('.db.bak'))
            .sort()
            .reverse();
        files.slice(7).forEach(oldFile => {
            fs.unlinkSync(path.join(BACKUP_DIR, oldFile));
        });
    } catch (e) {
        console.error('[P³ Backup Error]:', e.message);
    }
}

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) console.error(err.message);
    console.log('Connected to the P³ SQLite database.');
    runServerSideBackup();
    setInterval(runServerSideBackup, 86400000); // Run every 24h
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS ideas (
                                                 id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, location TEXT, duration TEXT, effort TEXT,
                                                 budget TEXT, vibe TEXT, food TEXT, timeOfDay TEXT, social TEXT, prep TEXT,
                                                 spicy BOOLEAN, isSecret BOOLEAN, addedBy TEXT, isDone BOOLEAN DEFAULT 0, isWishlist BOOLEAN DEFAULT 0,
                                                 isPinned BOOLEAN DEFAULT 0, rating INTEGER DEFAULT 0, joaoRating INTEGER DEFAULT 0, jennaRating INTEGER DEFAULT 0,
                                                 memory TEXT, completedDate TEXT, tripFolder TEXT DEFAULT '', photoData TEXT DEFAULT ''
            )`);
    db.run(`CREATE TABLE IF NOT EXISTS restaurants (
                                                       id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                       name TEXT NOT NULL, city TEXT NOT NULL, neighborhood TEXT DEFAULT '',
                                                       cuisine TEXT, vibe TEXT, price TEXT, socialLink TEXT, mapsLink TEXT, mustOrder TEXT,
                                                       addedBy TEXT, isVisited BOOLEAN DEFAULT 0, rating INTEGER DEFAULT 0,
                                                       joaoRating INTEGER DEFAULT 0, jennaRating INTEGER DEFAULT 0,
                                                       review TEXT, visitedDate TEXT, spotType TEXT DEFAULT 'dining',
                                                       tripFolder TEXT DEFAULT '', thumbnailUrl TEXT DEFAULT '',
                                                       lat REAL, lng REAL, photoData TEXT DEFAULT ''
            )`);
    db.run(`CREATE TABLE IF NOT EXISTS custom_cuisines (tag TEXT PRIMARY KEY)`);
    db.run(`CREATE TABLE IF NOT EXISTS users (name TEXT PRIMARY KEY, password_hash TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS cycles (
                                                  id INTEGER PRIMARY KEY AUTOINCREMENT, startDate TEXT NOT NULL, endDate TEXT, notes TEXT
            )`);
    db.run(`CREATE TABLE IF NOT EXISTS cycle_logs (
                                                      date TEXT PRIMARY KEY, flow TEXT, symptoms TEXT, notes TEXT
            )`);
    db.run(`CREATE TABLE IF NOT EXISTS custom_symptoms (
                                                           tag TEXT PRIMARY KEY, hasSeverity BOOLEAN DEFAULT 1
            )`);
    db.run(`CREATE TABLE IF NOT EXISTS app_settings (
                                                        key TEXT PRIMARY KEY, value TEXT
            )`);
    db.run(`CREATE TABLE IF NOT EXISTS daily_answers (
                                                         date TEXT PRIMARY KEY, question TEXT, joaoAnswer TEXT, jennaAnswer TEXT,
                                                         joaoReaction TEXT DEFAULT '', jennaReaction TEXT DEFAULT '', isStarred BOOLEAN DEFAULT 0
            )`);
    db.run(`CREATE TABLE IF NOT EXISTS visit_checklist (
                                                           id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                           text TEXT NOT NULL,
                                                           category TEXT DEFAULT 'bring',
                                                           addedBy TEXT,
                                                           isDone BOOLEAN DEFAULT 0
            )`);
    db.run(`CREATE TABLE IF NOT EXISTS notifications (
                                                         id INTEGER PRIMARY KEY AUTOINCREMENT, targetUser TEXT, title TEXT, body TEXT, createdAt INTEGER, isRead BOOLEAN DEFAULT 0
            )`);
    db.run(`CREATE TABLE IF NOT EXISTS push_subscriptions (
                                                              endpoint TEXT PRIMARY KEY, user TEXT, keysJson TEXT
            )`);

    // Safe column migrations for existing databases
    const safeCols = [
        `ALTER TABLE ideas ADD COLUMN isDone BOOLEAN DEFAULT 0`,
        `ALTER TABLE ideas ADD COLUMN isWishlist BOOLEAN DEFAULT 0`,
        `ALTER TABLE ideas ADD COLUMN isPinned BOOLEAN DEFAULT 0`,
        `ALTER TABLE ideas ADD COLUMN rating INTEGER DEFAULT 0`,
        `ALTER TABLE ideas ADD COLUMN joaoRating INTEGER DEFAULT 0`,
        `ALTER TABLE ideas ADD COLUMN jennaRating INTEGER DEFAULT 0`,
        `ALTER TABLE ideas ADD COLUMN memory TEXT`,
        `ALTER TABLE ideas ADD COLUMN completedDate TEXT`,
        `ALTER TABLE ideas ADD COLUMN tripFolder TEXT DEFAULT ''`,
        `ALTER TABLE ideas ADD COLUMN photoData TEXT DEFAULT ''`,
        `ALTER TABLE restaurants ADD COLUMN spotType TEXT DEFAULT 'dining'`,
        `ALTER TABLE restaurants ADD COLUMN tripFolder TEXT DEFAULT ''`,
        `ALTER TABLE restaurants ADD COLUMN neighborhood TEXT DEFAULT ''`,
        `ALTER TABLE restaurants ADD COLUMN thumbnailUrl TEXT DEFAULT ''`,
        `ALTER TABLE restaurants ADD COLUMN lat REAL`,
        `ALTER TABLE restaurants ADD COLUMN lng REAL`,
        `ALTER TABLE restaurants ADD COLUMN joaoRating INTEGER DEFAULT 0`,
        `ALTER TABLE restaurants ADD COLUMN jennaRating INTEGER DEFAULT 0`,
        `ALTER TABLE restaurants ADD COLUMN photoData TEXT DEFAULT ''`,
        `ALTER TABLE daily_answers ADD COLUMN joaoReaction TEXT DEFAULT ''`,
        `ALTER TABLE daily_answers ADD COLUMN jennaReaction TEXT DEFAULT ''`,
        `ALTER TABLE daily_answers ADD COLUMN isStarred BOOLEAN DEFAULT 0`,
        `ALTER TABLE cycle_logs ADD COLUMN flow TEXT`,
        `ALTER TABLE custom_symptoms ADD COLUMN hasSeverity BOOLEAN DEFAULT 1`
    ];
    safeCols.forEach(sql => db.run(sql, () => {}));

    db.run(`INSERT OR IGNORE INTO custom_symptoms (tag, hasSeverity) VALUES ('💤 Poor Sleep', 1)`, () => {});

    db.get(`SELECT COUNT(*) AS cnt FROM custom_symptoms`, [], (err, row) => {
        if (!err && row && row.cnt <= 1) {
            const stmt = db.prepare(`INSERT OR IGNORE INTO custom_symptoms (tag, hasSeverity) VALUES (?, ?)`);
            STARTER_SYMPTOMS.forEach(s => stmt.run(s.tag, s.hasSeverity));
            stmt.finalize();
        }
    });

    db.get(`SELECT COUNT(*) AS cnt FROM custom_cuisines`, [], (err, row) => {
        if (!err && row && row.cnt === 0) {
            const stmt = db.prepare(`INSERT OR IGNORE INTO custom_cuisines (tag) VALUES (?)`);
            STARTER_CUISINES.forEach(tag => stmt.run(tag));
            stmt.finalize();
        }
    });
});

module.exports = db;