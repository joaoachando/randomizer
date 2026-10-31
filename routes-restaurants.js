const express = require('express');
const router = express.Router();
const db = require('./db');
let geocodeQueue = Promise.resolve();
let lastGeocodeRequestAt = 0;

function validCoordinates(lat, lng) {
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function parseCoordinate(value) {
    if (value === null || value === undefined || value === '') return null;
    const coordinate = Number(value);
    return Number.isFinite(coordinate) ? coordinate : null;
}

function mapLinkCoordinates(url) {
    if (!url) return null;
    const marker = url.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    if (!marker) return null;
    const lat = Number(marker[1]);
    const lng = Number(marker[2]);
    return validCoordinates(lat, lng) ? { lat, lng } : null;
}

function normalizePlaceName(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function queueGeocodeRequest(url) {
    const request = geocodeQueue.then(async () => {
        const delay = Math.max(0, 1000 - (Date.now() - lastGeocodeRequestAt));
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        lastGeocodeRequestAt = Date.now();
        const response = await fetch(url, {
            headers: { 'User-Agent': 'P3-Randomizer/1.0 (restaurant location lookup)' },
            signal: AbortSignal.timeout(8000)
        });
        if (!response.ok) throw new Error(`Location lookup returned HTTP ${response.status}.`);
        return response.json();
    });
    geocodeQueue = request.catch(() => {});
    return request;
}

async function geocodeRestaurant(name, city) {
    const endpoint = new URL('https://nominatim.openstreetmap.org/search');
    endpoint.searchParams.set('format', 'jsonv2');
    endpoint.searchParams.set('addressdetails', '1');
    endpoint.searchParams.set('namedetails', '1');
    endpoint.searchParams.set('limit', '5');
    endpoint.searchParams.set('q', `${name}, ${city}`);

    try {
        const results = await queueGeocodeRequest(endpoint);
        const target = normalizePlaceName(name);
        const match = results.find(result => {
            const names = [result.name, result.namedetails?.name, result.display_name?.split(',')[0]]
                .map(normalizePlaceName)
                .filter(Boolean);
            return names.some(candidate =>
                candidate === target ||
                (candidate.length >= 5 && target.includes(candidate)) ||
                (target.length >= 5 && candidate.includes(target))
            );
        });
        if (!match) {
            console.info(`[P3 restaurant-map] No exact name match from geocoder for ${JSON.stringify(name)}, ${JSON.stringify(city)}.`);
            return null;
        }
        const lat = Number(match.lat);
        const lng = Number(match.lon);
        if (!validCoordinates(lat, lng)) return null;
        return { lat, lng };
    } catch (error) {
        console.warn(`[P3 restaurant-map] Name/city geocoding failed for ${JSON.stringify(name)}, ${JSON.stringify(city)}: ${error.message}`);
        return null;
    }
}

function isGoogleMapsLink(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' &&
            (url.hostname === 'maps.app.goo.gl' || url.hostname === 'goo.gl' ||
                url.hostname === 'maps.google.com' || url.hostname.endsWith('.google.com'));
    } catch (e) {
        return false;
    }
}

async function resolveMapLinkCoordinates(value) {
    const direct = mapLinkCoordinates(value);
    if (direct || !isGoogleMapsLink(value)) return direct;
    try {
        const response = await fetch(value, {
            redirect: 'follow',
            signal: AbortSignal.timeout(8000),
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; P3-Randomizer/1.0)' }
        });
        if (!response.ok) return null;
        return mapLinkCoordinates(response.url);
    } catch (e) {
        return null;
    }
}

async function backfillRestaurantCoordinates(rows) {
    for (const row of rows) {
        const mapCoords = await resolveMapLinkCoordinates(row.mapsLink);
        const source = mapCoords ? 'google-place-pin' :
            (parseCoordinate(row.lat) !== null && parseCoordinate(row.lng) !== null ? 'stored' : 'missing');
        if (mapCoords && (mapCoords.lat !== Number(row.lat) || mapCoords.lng !== Number(row.lng))) {
            row.lat = mapCoords.lat;
            row.lng = mapCoords.lng;
            await new Promise((resolve, reject) => {
                db.run('UPDATE restaurants SET lat = ?, lng = ? WHERE id = ?', [row.lat, row.lng, row.id], err => {
                    if (err) return reject(err);
                    resolve();
                });
            });
        }
        row.mapCoordinateSource = source;
        let mapsHost = '';
        try { mapsHost = new URL(row.mapsLink).hostname; } catch (e) {}
        console.log(`[P3 restaurant-map] id=${row.id} name=${JSON.stringify(row.name)} city=${JSON.stringify(row.city)} lat=${row.lat ?? 'null'} lng=${row.lng ?? 'null'} mapsHost=${mapsHost || 'none'} source=${source} pinned=${Boolean(mapCoords)}`);
    }
}

module.exports = function(requireAuth, notifyPartner) {
    router.get('/restaurants', requireAuth, (req, res) => {
        db.all('SELECT * FROM restaurants ORDER BY id DESC', [], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            backfillRestaurantCoordinates(rows || []).then(() => {
                db.all('SELECT tag FROM custom_cuisines ORDER BY rowid ASC', [], (err2, tags) => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    res.json({
                        restaurants: rows || [],
                        customCuisines: (tags || []).map(t => t.tag)
                    });
                });
            }).catch(backfillErr => res.status(500).json({ error: backfillErr.message }));
        });
    });

    router.post('/restaurants', requireAuth, async (req, res) => {
        const { name, city, neighborhood, cuisine, vibe, price, socialLink, mapsLink, mustOrder, spotType, tripFolder, thumbnailUrl, lat, lng } = req.body;
        if (!name || !city) return res.status(400).json({ error: 'Name and city are required.' });

        const exactCoords = await resolveMapLinkCoordinates(mapsLink) ||
            await geocodeRestaurant(name.trim(), city.trim()) ||
            (validCoordinates(parseCoordinate(lat), parseCoordinate(lng)) ? { lat: Number(lat), lng: Number(lng) } : null);
        let finalLat = exactCoords?.lat ?? null;
        let finalLng = exactCoords?.lng ?? null;

        db.run(
            `INSERT INTO restaurants (name, city, neighborhood, cuisine, vibe, price, socialLink, mapsLink, mustOrder, addedBy, spotType, tripFolder, thumbnailUrl, lat, lng)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name.trim(), city.trim(), (neighborhood || '').trim(), cuisine || '🍝 Italian', vibe || '🕯️ Date Night', price || '$$', socialLink || '', mapsLink || '', mustOrder || '', req.user, spotType || 'dining', (tripFolder || '').trim(), thumbnailUrl || '', finalLat, finalLng],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                if (notifyPartner) {
                    notifyPartner(req.user, `🍽️ New Spot in ${city.trim()}!`, `${req.user} added "${name.trim()}" (${cuisine || 'Food'})`);
                }
                res.json({ id: this.lastID, locationResolved: validCoordinates(finalLat, finalLng) });
            }
        );
    });

    router.patch('/restaurants/:id', requireAuth, async (req, res) => {
        const { name, city, neighborhood, cuisine, vibe, price, socialLink, mapsLink, mustOrder, spotType, tripFolder, thumbnailUrl, lat, lng } = req.body;
        const exactCoords = await resolveMapLinkCoordinates(mapsLink) ||
            await geocodeRestaurant(name.trim(), city.trim()) ||
            (validCoordinates(parseCoordinate(lat), parseCoordinate(lng))
                ? { lat: Number(lat), lng: Number(lng) }
                : null);
        let finalLat = exactCoords?.lat ?? null;
        let finalLng = exactCoords?.lng ?? null;

        db.run(
            `UPDATE restaurants SET name=?, city=?, neighborhood=?, cuisine=?, vibe=?, price=?, socialLink=?, mapsLink=?, mustOrder=?, spotType=?, tripFolder=?, thumbnailUrl=?, lat=?, lng=? WHERE id=?`,
            [name.trim(), city.trim(), (neighborhood || '').trim(), cuisine, vibe, price, socialLink || '', mapsLink || '', mustOrder || '', spotType || 'dining', (tripFolder || '').trim(), thumbnailUrl || '', finalLat, finalLng, req.params.id],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, locationResolved: validCoordinates(finalLat, finalLng) });
            }
        );
    });

    router.patch('/restaurants/:id/visited', requireAuth, (req, res) => {
        const { rating, review, visitedDate, photoData } = req.body || {};
        const ownRating = Number(rating);
        if (!Number.isInteger(ownRating) || ownRating < 0 || ownRating > 5) {
            return res.status(400).json({ error: 'Rating must be an integer from 0 to 5.' });
        }
        const ownColumn = req.user === 'Jenna' ? 'jennaRating' : 'joaoRating';
        const otherColumn = req.user === 'Jenna' ? 'joaoRating' : 'jennaRating';
        db.get(`SELECT ${ownColumn}, ${otherColumn} FROM restaurants WHERE id = ?`, [req.params.id], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(404).json({ error: 'Restaurant not found.' });
            const savedOwnRating = ownRating || Number(row[ownColumn]) || 0;
            const partnerRating = Number(row[otherColumn]) || 0;
            const ratings = [savedOwnRating, partnerRating].filter(value => value > 0);
            const averageRating = ratings.length
                ? Math.round(ratings.reduce((sum, value) => sum + value, 0) / ratings.length)
                : 0;
            db.run(
                `UPDATE restaurants SET isVisited = 1, rating = ?, ${ownColumn} = ?, review = ?, visitedDate = ?, photoData = ? WHERE id = ?`,
                [averageRating, savedOwnRating, review || '', visitedDate || new Date().toISOString().split('T')[0], photoData || '', req.params.id],
                updateErr => {
                    if (updateErr) return res.status(500).json({ error: updateErr.message });
                    res.json({ success: true });
                }
            );
        });
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