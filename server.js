const express = require('express');
const crypto = require('crypto');
const db = require('./db');

const app = express();
app.use(express.json({ limit: '3mb' }));
app.use(express.static('public'));

const ALLOWED_NAMES = ['Joao', 'Jenna', 'Guest'];

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

function trackUserActivity(name) {
    if (name === 'Jenna') {
        db.run(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('jennaLastActive', ?)`, [String(Date.now())]);
    }
}

function createSessionToken(name, callback) {
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = Date.now() + 30 * 86400000;
    db.run('DELETE FROM sessions WHERE expires_at <= ?', [Date.now()], () => {
        db.run('INSERT INTO sessions (token_hash, user, expires_at) VALUES (?, ?, ?)', [tokenHash, name, expiresAt], err => {
            callback(err, err ? '' : token);
        });
    });
}

function getSessionToken(req) {
    const cookie = req.headers.cookie || '';
    const entry = cookie.split(';').map(part => part.trim()).find(part => part.startsWith('p3_session='));
    return entry ? entry.slice('p3_session='.length) : '';
}

function requireAuth(req, res, next) {
    const sessionToken = getSessionToken(req);
    if (sessionToken) {
        const tokenHash = crypto.createHash('sha256').update(String(sessionToken)).digest('hex');
        return db.get('SELECT user FROM sessions WHERE token_hash = ? AND expires_at > ?', [tokenHash, Date.now()], (err, row) => {
            if (err) return res.status(500).json({ error: 'Could not verify the login session.' });
            if (!row) {
                const secure = new URL(process.env.WEBAUTHN_ORIGIN || 'https://randomizer.achando.dev').protocol === 'https:' ? '; Secure' : '';
                res.setHeader('Set-Cookie', `p3_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`);
                return res.status(401).json({ error: 'Session expired. Please sign in again.' });
            }
            req.user = row.user;
            trackUserActivity(req.user);
            next();
        });
    }

    const name = req.headers['x-user-name'];
    const password = req.headers['x-user-password'];

    if (name === 'Guest') {
        if (req.method !== 'GET') {
            return res.status(403).json({ error: 'Guests cannot modify the database.' });
        }
        req.user = 'Guest';
        return next();
    }

    if (!name || !password) return res.status(401).json({ error: 'Missing credentials.' });

    db.get('SELECT password_hash FROM users WHERE name = ?', [name], (err, row) => {
        if (err || !row || row.password_hash !== hashPassword(password)) {
            return res.status(401).json({ error: 'Unauthorized.' });
        }
        req.user = name;

        trackUserActivity(name);
        next();
    });
}

const hubModule = require('./routes-hub')(requireAuth);
app.use('/api', hubModule.router);
app.use('/api', require('./routes-ideas')(requireAuth, hashPassword, ALLOWED_NAMES, hubModule.notifyPartner, createSessionToken, getSessionToken));
app.use('/api', require('./routes-restaurants')(requireAuth, hubModule.notifyPartner));
app.use('/api', require('./routes-tracker')(requireAuth));

app.listen(3000, () => console.log('P³ Server running on port 3000'));