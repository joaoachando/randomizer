const express = require('express');
const router = express.Router();
const db = require('./db');

module.exports = function(requireAuth) {
    router.get('/cycles', requireAuth, (req, res) => {
        if (req.user === 'Guest') return res.status(403).json({ error: 'Unauthorized' });
        db.all('SELECT * FROM cycles ORDER BY startDate DESC', [], (err, cycles) => {
            if (err) return res.status(500).json({ error: err.message });
            db.all('SELECT * FROM cycle_logs ORDER BY date DESC', [], (err2, logs) => {
                if (err2) return res.status(500).json({ error: err2.message });
                db.all('SELECT tag, hasSeverity FROM custom_symptoms ORDER BY rowid ASC', [], (err3, customTags) => {
                    if (err3) return res.status(500).json({ error: err3.message });
                    res.json({
                        cycles,
                        logs,
                        customSymptoms: (customTags || []).map(t => ({
                            tag: t.tag,
                            hasSeverity: t.hasSeverity === undefined || t.hasSeverity === null ? 1 : Number(t.hasSeverity)
                        }))
                    });
                });
            });
        });
    });

    router.post('/cycles', requireAuth, (req, res) => {
        if (req.user === 'Guest') return res.status(403).json({ error: 'Unauthorized' });
        const { startDate, endDate, notes } = req.body;
        db.run('INSERT INTO cycles (startDate, endDate, notes) VALUES (?, ?, ?)', [startDate, endDate || null, notes || ''], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        });
    });

    router.patch('/cycles/:id', requireAuth, (req, res) => {
        if (req.user === 'Guest') return res.status(403).json({ error: 'Unauthorized' });
        const { startDate, endDate, notes } = req.body;
        db.run('UPDATE cycles SET startDate = ?, endDate = ?, notes = ? WHERE id = ?', [startDate, endDate || null, notes || '', req.params.id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });

    router.delete('/cycles/:id', requireAuth, (req, res) => {
        if (req.user === 'Guest') return res.status(403).json({ error: 'Unauthorized' });
        db.run('DELETE FROM cycles WHERE id = ?', [req.params.id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });

    router.post('/cycle-logs', requireAuth, (req, res) => {
        if (req.user === 'Guest') return res.status(403).json({ error: 'Unauthorized' });
        const { date, flow, symptoms, notes } = req.body;
        if (!flow && !symptoms && !notes) {
            db.run('DELETE FROM cycle_logs WHERE date = ?', [date], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                return res.json({ success: true, deleted: true });
            });
        } else {
            db.run(
                `INSERT INTO cycle_logs (date, flow, symptoms, notes) VALUES (?, ?, ?, ?)
                 ON CONFLICT(date) DO UPDATE SET flow=excluded.flow, symptoms=excluded.symptoms, notes=excluded.notes`,
                [date, flow || '', symptoms || '', notes || ''],
                (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ success: true });
                }
            );
        }
    });

    router.delete('/cycle-logs/:date', requireAuth, (req, res) => {
        if (req.user === 'Guest') return res.status(403).json({ error: 'Unauthorized' });
        db.run('DELETE FROM cycle_logs WHERE date = ?', [req.params.date], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });

    router.post('/custom-symptoms', requireAuth, (req, res) => {
        if (req.user === 'Guest') return res.status(403).json({ error: 'Unauthorized' });
        const { tag, hasSeverity } = req.body;
        if (!tag) return res.status(400).json({ error: 'Missing tag' });
        const sevFlag = hasSeverity === undefined ? 1 : (hasSeverity ? 1 : 0);
        db.run(
            'INSERT INTO custom_symptoms (tag, hasSeverity) VALUES (?, ?) ON CONFLICT(tag) DO UPDATE SET hasSeverity=excluded.hasSeverity',
            [tag.trim(), sevFlag],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            }
        );
    });

    router.delete('/custom-symptoms/:tag', requireAuth, (req, res) => {
        if (req.user === 'Guest') return res.status(403).json({ error: 'Unauthorized' });
        db.run('DELETE FROM custom_symptoms WHERE tag = ?', [req.params.tag], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });

    return router;
};