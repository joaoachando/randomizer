const express = require('express');
const router = express.Router();
const db = require('./db');

module.exports = function(requireAuth, hashPassword, ALLOWED_NAMES, notifyPartner) {
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
                    return res.json({ success: true, created: true });
                });
            } else if (row.password_hash === hashed) {
                return res.json({ success: true });
            } else {
                return res.status(401).json({ error: 'Incorrect password.' });
            }
        });
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
        const { rating, joaoRating, jennaRating, memory, completedDate, photoData } = req.body || {};
        const jR = Number(joaoRating) || Number(rating) || 5;
        const jeR = Number(jennaRating) || Number(rating) || 5;
        const avgR = Math.round((jR + jeR) / 2);

        db.run(
            'UPDATE ideas SET isDone = 1, isPinned = 0, rating = ?, joaoRating = ?, jennaRating = ?, memory = ?, completedDate = ?, photoData = ? WHERE id = ?',
            [avgR, jR, jeR, memory || '', completedDate || new Date().toISOString().split('T')[0], photoData || '', req.params.id],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            }
        );
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