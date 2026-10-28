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

function requireAuth(req, res, next) {
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

        // Silently track Jenna's last active timestamp (only visible to Joao)
        if (name === 'Jenna') {
            db.run(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('jennaLastActive', ?)`, [String(Date.now())]);
        }
        next();
    });
}

const hubModule = require('./routes-hub')(requireAuth);
app.use('/api', hubModule.router);
app.use('/api', require('./routes-ideas')(requireAuth, hashPassword, ALLOWED_NAMES, hubModule.notifyPartner));
app.use('/api', require('./routes-restaurants')(requireAuth, hubModule.notifyPartner));
app.use('/api', require('./routes-tracker')(requireAuth));

app.listen(3000, () => console.log('P³ Server running on port 3000'));