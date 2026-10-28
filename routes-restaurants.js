const express = require('express');
const router = express.Router();
const db = require('./db');

async function geocodeSpotFallback(name, city) {
    try {
        const q = `${name} ${city}`.trim();
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`);
        const d = await r.json();
        if (d.results && d.results[0]) {
            const jitter = () => (Math.random() - 0.5) * 0.012;
            return { lat: d.results[0].latitude + jitter(), lng: d.results[0].longitude + jitter() };
        }
    } catch (e) {}
    return { lat: null, lng: null };
}

module.exports = function(requireAuth, notifyPartner) {
    router.get('/restaurants', requireAuth, (req, res) => {
        db.all('SELECT * FROM restaurants ORDER BY id DESC', [], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            db.all('SELECT tag FROM custom_cuisines ORDER BY rowid ASC', [], (err2, tags) => {
                if (err2) return res.status(500).json({ error: err2.message });
                res.json({
                    restaurants: rows || [],
                    customCuisines: (tags || []).map(t => t.tag)
                });
            });
        });
    });

    router.post('/restaurants', requireAuth, async (req, res) => {
        const { name, city, neighborhood, cuisine, vibe, price, socialLink, mapsLink, mustOrder, spotType, tripFolder, thumbnailUrl, lat, lng } = req.body;
        if (!name || !city) return res.status(400).json({ error: 'Name and city are required.' });

        let finalLat = lat || null;
        let finalLng = lng || null;
        if (!finalLat || !finalLng) {
            const geo = await geocodeSpotFallback(name, city);
            finalLat = geo.lat;
            finalLng = geo.lng;
        }

        db.run(
            `INSERT INTO restaurants (name, city, neighborhood, cuisine, vibe, price, socialLink, mapsLink, mustOrder, addedBy, spotType, tripFolder, thumbnailUrl, lat, lng)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name.trim(), city.trim(), (neighborhood || '').trim(), cuisine || '🍝 Italian', vibe || '🕯️ Date Night', price || '$$', socialLink || '', mapsLink || '', mustOrder || '', req.user, spotType || 'dining', (tripFolder || '').trim(), thumbnailUrl || '', finalLat, finalLng],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                if (notifyPartner) {
                    notifyPartner(req.user, `🍽️ New Spot in ${city.trim()}!`, `${req.user} added "${name.trim()}" (${cuisine || 'Food'})`);
                }
                res.json({ id: this.lastID });
            }
        );
    });

    router.patch('/restaurants/:id', requireAuth, async (req, res) => {
        const { name, city, neighborhood, cuisine, vibe, price, socialLink, mapsLink, mustOrder, spotType, tripFolder, thumbnailUrl, lat, lng } = req.body;
        let finalLat = lat || null;
        let finalLng = lng || null;
        if (!finalLat || !finalLng) {
            const geo = await geocodeSpotFallback(name, city);
            finalLat = geo.lat;
            finalLng = geo.lng;
        }

        db.run(
            `UPDATE restaurants SET name=?, city=?, neighborhood=?, cuisine=?, vibe=?, price=?, socialLink=?, mapsLink=?, mustOrder=?, spotType=?, tripFolder=?, thumbnailUrl=?, lat=?, lng=? WHERE id=?`,
            [name.trim(), city.trim(), (neighborhood || '').trim(), cuisine, vibe, price, socialLink || '', mapsLink || '', mustOrder || '', spotType || 'dining', (tripFolder || '').trim(), thumbnailUrl || '', finalLat, finalLng, req.params.id],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            }
        );
    });

    router.patch('/restaurants/:id/visited', requireAuth, (req, res) => {
        const { rating, joaoRating, jennaRating, review, visitedDate, photoData } = req.body;
        const jR = Number(joaoRating) || Number(rating) || 5;
        const jeR = Number(jennaRating) || Number(rating) || 5;
        const avgR = Math.round((jR + jeR) / 2);

        db.run(
            `UPDATE restaurants SET isVisited = 1, rating = ?, joaoRating = ?, jennaRating = ?, review = ?, visitedDate = ?, photoData = ? WHERE id = ?`,
            [avgR, jR, jeR, review || '', visitedDate || new Date().toISOString().split('T')[0], photoData || '', req.params.id],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            }
        );
    });

    router.delete('/restaurants/:id', requireAuth, (req, res) => {
        db.run('DELETE FROM restaurants WHERE id = ?', [req.params.id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });

    router.post('/custom-cuisines', requireAuth, (req, res) => {
        if (req.user === 'Guest') return res.status(403).json({ error: 'Unauthorized' });
        const { tag } = req.body;
        if (!tag || !tag.trim()) return res.status(400).json({ error: 'Missing cuisine tag' });
        db.run('INSERT OR IGNORE INTO custom_cuisines (tag) VALUES (?)', [tag.trim()], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });

    router.delete('/custom-cuisines/:tag', requireAuth, (req, res) => {
        if (req.user === 'Guest') return res.status(403).json({ error: 'Unauthorized' });
        db.run('DELETE FROM custom_cuisines WHERE tag = ?', [req.params.tag], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });

    return router;
};