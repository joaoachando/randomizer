const express = require('express');
const router = express.Router();
const db = require('./db');
const crypto = require('crypto');
const {
    generateAuthenticationOptions,
    generateRegistrationOptions,
    verifyAuthenticationResponse,
    verifyRegistrationResponse
} = require('@simplewebauthn/server');

const webauthnOrigin = new URL(process.env.WEBAUTHN_ORIGIN || 'https://randomizer.achando.dev');
const rpID = webauthnOrigin.hostname;

function createCeremony(user, purpose, challenge, callback) {
    const id = crypto.randomUUID();
    const expiresAt = Date.now() + 5 * 60 * 1000;
    db.run(
        'INSERT INTO webauthn_challenges (id, user, purpose, challenge, expires_at) VALUES (?, ?, ?, ?, ?)',
        [id, user, purpose, challenge, expiresAt],
        err => callback(err, id)
    );
}

function consumeCeremony(id, user, purpose, callback) {
    db.get(
        'DELETE FROM webauthn_challenges WHERE id = ? AND user = ? AND purpose = ? AND expires_at > ? RETURNING challenge',
        [id, user, purpose, Date.now()],
        (err, row) => callback(err, err || !row ? null : row.challenge)
    );
}

function setSessionCookie(res, token) {
    const secure = webauthnOrigin.protocol === 'https:' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `p3_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${secure}`);
}

function completeLogin(user, createSessionToken, res) {
    createSessionToken(user, (err, sessionToken) => {
        if (err) return res.status(500).json({ error: 'Could not create a login session.' });
        setSessionCookie(res, sessionToken);
        res.json({ success: true, name: user });
    });
}

module.exports = function(requireAuth, hashPassword, ALLOWED_NAMES, notifyPartner, createSessionToken, getSessionToken) {
    router.post('/logout', (req, res) => {
        const token = getSessionToken(req);
        if (!token) {
            const secure = webauthnOrigin.protocol === 'https:' ? '; Secure' : '';
            res.setHeader('Set-Cookie', `p3_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`);
            return res.json({ success: true });
        }
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        db.run('DELETE FROM sessions WHERE token_hash = ?', [tokenHash], err => {
            if (err) return res.status(500).json({ error: 'Could not end the session.' });
            const secure = webauthnOrigin.protocol === 'https:' ? '; Secure' : '';
            res.setHeader('Set-Cookie', `p3_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`);
            res.json({ success: true });
        });
    });

    router.post('/login', (req, res) => {
        const { name, password } = req.body;
        if (!name || !ALLOWED_NAMES.includes(name)) return res.status(400).json({ error: 'Invalid user.' });
        if (name === 'Guest') return res.json({ success: true });
        if (!password) return res.status(400).json({ error: 'Password required.' });

        const hashed = hashPassword(password);
        db.get('SELECT password_hash FROM users WHERE name = ?', [name], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) {
                db.run('INSERT INTO users (name, password_hash) VALUES (?, ?)', [name, hashed], (err2) => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    return completeLogin(name, createSessionToken, res);
                });
            } else if (row.password_hash === hashed) {
                return completeLogin(name, createSessionToken, res);
            } else {
                return res.status(401).json({ error: 'Incorrect password.' });
            }
        });
    });

    router.post('/webauthn/register/options', requireAuth, (req, res) => {
        if (req.user === 'Guest') return res.status(403).json({ error: 'Guests cannot register passkeys.' });
        db.all(
            'SELECT credential_id, transports FROM webauthn_credentials WHERE user = ?',
            [req.user],
            async (err, credentials) => {
                if (err) return res.status(500).json({ error: 'Could not load passkeys.' });
                try {
                    const options = await generateRegistrationOptions({
                        rpName: 'P³',
                        rpID,
                        userID: Buffer.from(req.user),
                        userName: req.user,
                        userDisplayName: req.user,
                        attestationType: 'none',
                        authenticatorSelection: {
                            authenticatorAttachment: 'platform',
                            residentKey: 'preferred',
                            userVerification: 'required'
                        },
                        excludeCredentials: credentials.map(item => ({
                            id: item.credential_id,
                            transports: JSON.parse(item.transports || '[]')
                        }))
                    });
                    createCeremony(req.user, 'registration', options.challenge, (challengeErr, ceremonyId) => {
                        if (challengeErr) return res.status(500).json({ error: 'Could not start passkey registration.' });
                        res.json({ options, ceremonyId });
                    });
                } catch (e) {
                    res.status(500).json({ error: 'Could not start passkey registration.' });
                }
            }
        );
    });

    router.get('/webauthn/status', requireAuth, (req, res) => {
        if (req.user === 'Guest') return res.json({ registered: false });
        db.get('SELECT 1 FROM webauthn_credentials WHERE user = ? LIMIT 1', [req.user], (err, row) => {
            if (err) return res.status(500).json({ error: 'Could not check passkey status.' });
            res.json({ registered: Boolean(row) });
        });
    });

    router.post('/webauthn/register/verify', requireAuth, async (req, res) => {
        if (req.user === 'Guest') return res.status(403).json({ error: 'Guests cannot register passkeys.' });
        const { ceremonyId, credential } = req.body || {};
        if (!ceremonyId || !credential) return res.status(400).json({ error: 'Missing passkey response.' });
        consumeCeremony(ceremonyId, req.user, 'registration', async (err, challenge) => {
            if (err) return res.status(500).json({ error: 'Could not verify passkey registration.' });
            if (!challenge) return res.status(400).json({ error: 'Passkey registration expired. Try again.' });
            try {
                const verification = await verifyRegistrationResponse({
                    response: credential,
                    expectedChallenge: challenge,
                    expectedOrigin: webauthnOrigin.origin,
                    expectedRPID: rpID,
                    requireUserVerification: true
                });
                const info = verification.registrationInfo;
                if (!verification.verified || !info) return res.status(400).json({ error: 'Passkey registration was not verified.' });
                const credentialId = info.credential.id;
                const publicKey = Buffer.from(info.credential.publicKey).toString('base64url');
                const transports = JSON.stringify(credential.response.transports || []);
                db.run(
                    `INSERT OR REPLACE INTO webauthn_credentials
                     (credential_id, user, public_key, counter, transports, created_at)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [credentialId, req.user, publicKey, info.counter, transports, Date.now()],
                    saveErr => {
                        if (saveErr) return res.status(500).json({ error: 'Could not save this passkey.' });
                        res.json({ verified: true });
                    }
                );
            } catch (e) {
                res.status(400).json({ error: 'Passkey registration could not be verified.' });
            }
        });
    });

    router.post('/webauthn/login/options', (req, res) => {
        const { name } = req.body || {};
        if (!name || !ALLOWED_NAMES.includes(name) || name === 'Guest') {
            return res.status(400).json({ error: 'Select a valid account.' });
        }
        db.all(
            'SELECT credential_id, transports FROM webauthn_credentials WHERE user = ?',
            [name],
            async (err, credentials) => {
                if (err) return res.status(500).json({ error: 'Could not load passkeys.' });
                if (!credentials.length) return res.status(404).json({ error: 'No passkey is registered for this account.' });
                try {
                    const options = await generateAuthenticationOptions({
                        rpID,
                        userVerification: 'required',
                        allowCredentials: credentials.map(item => ({
                            id: item.credential_id,
                            transports: JSON.parse(item.transports || '[]')
                        }))
                    });
                    createCeremony(name, 'authentication', options.challenge, (challengeErr, ceremonyId) => {
                        if (challengeErr) return res.status(500).json({ error: 'Could not start passkey login.' });
                        res.json({ options, ceremonyId });
                    });
                } catch (e) {
                    res.status(500).json({ error: 'Could not start passkey login.' });
                }
            }
        );
    });

    router.post('/webauthn/login/verify', (req, res) => {
        const { ceremonyId, credential } = req.body || {};
        if (!ceremonyId || !credential || !credential.id) {
            return res.status(400).json({ error: 'Missing passkey response.' });
        }
        db.get(
            'SELECT user FROM webauthn_challenges WHERE id = ? AND purpose = ?',
            [ceremonyId, 'authentication'],
            (lookupErr, ceremony) => {
                if (lookupErr) return res.status(500).json({ error: 'Could not verify passkey login.' });
                if (!ceremony) return res.status(400).json({ error: 'Passkey login expired. Try again.' });
                consumeCeremony(ceremonyId, ceremony.user, 'authentication', async (err, challenge) => {
                    if (err) return res.status(500).json({ error: 'Could not verify passkey login.' });
                    if (!challenge) return res.status(400).json({ error: 'Passkey login expired. Try again.' });
                    db.get(
                        'SELECT * FROM webauthn_credentials WHERE credential_id = ? AND user = ?',
                        [credential.id, ceremony.user],
                        async (credentialErr, stored) => {
                            if (credentialErr) return res.status(500).json({ error: 'Could not load this passkey.' });
                            if (!stored) return res.status(401).json({ error: 'Passkey was not recognized.' });
                            try {
                                const verification = await verifyAuthenticationResponse({
                                    response: credential,
                                    expectedChallenge: challenge,
                                    expectedOrigin: webauthnOrigin.origin,
                                    expectedRPID: rpID,
                                    requireUserVerification: true,
                                    credential: {
                                        id: stored.credential_id,
                                        publicKey: Buffer.from(stored.public_key, 'base64url'),
                                        counter: stored.counter,
                                        transports: JSON.parse(stored.transports || '[]')
                                    }
                                });
                                if (!verification.verified) return res.status(401).json({ error: 'Passkey verification failed.' });
                                db.run(
                                    'UPDATE webauthn_credentials SET counter = ? WHERE credential_id = ?',
                                    [verification.authenticationInfo.newCounter, stored.credential_id],
                                    updateErr => {
                                        if (updateErr) return res.status(500).json({ error: 'Could not update passkey state.' });
                                        completeLogin(ceremony.user, createSessionToken, res);
                                    }
                                );
                            } catch (e) {
                                res.status(401).json({ error: 'Passkey verification failed.' });
                            }
                        }
                    );
                });
            }
        );
    });

    router.get('/ideas', requireAuth, (req, res) => {
        const query = req.user === 'Guest'
            ? 'SELECT * FROM ideas WHERE spicy = 0 AND isSecret = 0'
            : 'SELECT * FROM ideas';
        db.all(query, [], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ideas: rows || [] });
        });
    });

    router.post('/ideas', requireAuth, (req, res) => {
        const { title, description, location, duration, effort, budget, vibe, food, timeOfDay, social, prep, spicy, isSecret, isWishlist, tripFolder } = req.body;
        db.get('SELECT id FROM ideas WHERE LOWER(title) = LOWER(?)', [title.trim()], (err, row) => {
            if (row) return res.status(409).json({ error: 'Idea already exists!' });
            db.run(
                `INSERT INTO ideas (title, description, location, duration, effort, budget, vibe, food, timeOfDay, social, prep, spicy, isSecret, addedBy, isWishlist, tripFolder)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [title.trim(), description, location, duration, effort, budget, vibe, food, timeOfDay, social, prep, spicy ? 1 : 0, isSecret ? 1 : 0, req.user, isWishlist ? 1 : 0, (tripFolder || '').trim()],
                function(err2) {
                    if (err2) return res.status(500).json({ error: err2.message });
                    if (notifyPartner) {
                        const label = isSecret ? '👀 a Secret Date Idea!' : `"${title.trim()}"`;
                        notifyPartner(req.user, '🎲 New Date Idea Added!', `${req.user} added ${label}`);
                    }
                    res.json({ id: this.lastID });
                }
            );
        });
    });

    router.patch('/ideas/:id', requireAuth, (req, res) => {
        const { title, description, location, duration, effort, budget, vibe, food, timeOfDay, social, prep, spicy, isSecret, isWishlist, tripFolder } = req.body;
        db.run(
            `UPDATE ideas SET title=?, description=?, location=?, duration=?, effort=?, budget=?, vibe=?, food=?, timeOfDay=?, social=?, prep=?, spicy=?, isSecret=?, isWishlist=?, tripFolder=? WHERE id=?`,
            [title.trim(), description, location, duration, effort, budget, vibe, food, timeOfDay, social, prep, spicy ? 1 : 0, isSecret ? 1 : 0, isWishlist ? 1 : 0, (tripFolder || '').trim(), req.params.id],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            }
        );
    });

    router.patch('/ideas/:id/done', requireAuth, (req, res) => {
        const { rating, memory, completedDate, photoData } = req.body || {};
        const ownRating = Number(rating);
        if (!Number.isInteger(ownRating) || ownRating < 0 || ownRating > 5) {
            return res.status(400).json({ error: 'Rating must be an integer from 0 to 5.' });
        }
        const ownColumn = req.user === 'Jenna' ? 'jennaRating' : 'joaoRating';
        const otherColumn = req.user === 'Jenna' ? 'joaoRating' : 'jennaRating';
        db.get(`SELECT ${ownColumn}, ${otherColumn} FROM ideas WHERE id = ?`, [req.params.id], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(404).json({ error: 'Date idea not found.' });
            const savedOwnRating = ownRating || Number(row[ownColumn]) || 0;
            const partnerRating = Number(row[otherColumn]) || 0;
            const ratings = [savedOwnRating, partnerRating].filter(value => value > 0);
            const averageRating = ratings.length
                ? Math.round(ratings.reduce((sum, value) => sum + value, 0) / ratings.length)
                : 0;
            db.run(
                `UPDATE ideas SET isDone = 1, isPinned = 0, rating = ?, ${ownColumn} = ?, memory = ?, completedDate = ?, photoData = ? WHERE id = ?`,
                [averageRating, savedOwnRating, memory || '', completedDate || new Date().toISOString().split('T')[0], photoData || '', req.params.id],
                updateErr => {
                    if (updateErr) return res.status(500).json({ error: updateErr.message });
                    res.json({ success: true });
                }
            );
        });
    });

    router.patch('/ideas/:id/pin', requireAuth, (req, res) => {
        const { isPinned } = req.body;
        db.serialize(() => {
            if (isPinned) db.run('UPDATE ideas SET isPinned = 0');
            db.run('UPDATE ideas SET isPinned = ? WHERE id = ?', [isPinned ? 1 : 0, req.params.id], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            });
        });
    });

    router.patch('/ideas/:id/reveal', requireAuth, (req, res) => {
        db.run('UPDATE ideas SET isSecret = 0 WHERE id = ?', [req.params.id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });

    router.delete('/ideas/:id', requireAuth, (req, res) => {
        db.run('DELETE FROM ideas WHERE id = ?', [req.params.id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });

    return router;
};