const express = require('express');
const router = express.Router();
const db = require('./db');

let webpush = null;
try { webpush = require('web-push'); } catch (e) {}
const neighborhoodCache = new Map();
let lastNeighborhoodLookupAt = 0;
let neighborhoodLookupQueue = Promise.resolve();

// Initialize VAPID keys automatically if web-push npm package is installed
let vapidPublicKey = '';
if (webpush) {
    db.get(`SELECT value FROM app_settings WHERE key = 'vapidKeys'`, [], (err, row) => {
        let keys;
        if (row && row.value) {
            keys = JSON.parse(row.value);
        } else {
            keys = webpush.generateVAPIDKeys();
            db.run(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('vapidKeys', ?)`, [JSON.stringify(keys)]);
        }
        vapidPublicKey = keys.publicKey;
        webpush.setVapidDetails('mailto:joao@achando.dev', keys.publicKey, keys.privateKey);
    });
}

async function generateAICoupleQuestion(recentQuestions = []) {
    const avoidList = recentQuestions.slice(0, 20).join(' | ');
    const vibes = [
        'warm and romantic', 'playful and funny', 'deep and nostalgic',
        'future travel & dreams together', 'spicy and flirty', 'cozy everyday habits'
    ];
    const pickedVibe = vibes[Math.floor(Math.random() * vibes.length)];

    try {
        const res = await fetch('https://text.pollinations.ai/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [
                    {
                        role: 'system',
                        content: 'You write a single short, natural daily question for a couple (João and Jenna) in a long-distance relationship. Output ONLY the question itself, under 20 words, with no quotes, no numbering, and no intro.'
                    },
                    {
                        role: 'user',
                        content: `Write 1 ${pickedVibe} question for us to answer today. Do NOT repeat these past questions: ${avoidList}`
                    }
                ],
                seed: Math.floor(Math.random() * 999999)
            })
        });
        if (res.ok) {
            const raw = (await res.text()).trim().replace(/^["']|["']$/g, '');
            if (raw.length > 10 && raw.length < 180 && raw.includes('?')) return raw;
        }
    } catch (e) {}

    try {
        const fbRes = await fetch('https://api.truthordarebot.xyz/v1/truth');
        const fbData = await fbRes.json();
        if (fbData && fbData.question) return fbData.question;
    } catch (e) {}

    return "What is one moment with me that you've replayed in your head recently?";
}

function notifyPartner(sender, title, body) {
    if (sender !== 'Joao' && sender !== 'Jenna') return;
    const target = sender === 'Joao' ? 'Jenna' : 'Joao';
    db.run(
        `INSERT INTO notifications (targetUser, title, body, createdAt) VALUES (?, ?, ?, ?)`,
        [target, title, body, Date.now()]
    );

    if (webpush && vapidPublicKey) {
        db.all(`SELECT * FROM push_subscriptions WHERE user = ?`, [target], (err, subs) => {
            (subs || []).forEach(s => {
                const subObj = { endpoint: s.endpoint, keys: JSON.parse(s.keysJson || '{}') };
                webpush.sendNotification(subObj, JSON.stringify({ title, body })).catch(() => {});
            });
        });
    }
}

async function fetchSocialThumbnail(url) {
    let parsed;
    try { parsed = new URL(url); } catch (e) { return ''; }
    if (parsed.protocol !== 'https:' || !/(^|\.)tiktok\.com$/i.test(parsed.hostname)) return '';
    try {
        const oRes = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(parsed.href)}`);
        if (oRes.ok) {
            const oData = await oRes.json();
            if (oData.thumbnail_url) return oData.thumbnail_url;
        }
        return '';
    } catch (e) {
        return '';
    }
}

async function findNeighborhood(lat, lng) {
    const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (neighborhoodCache.has(cacheKey)) return neighborhoodCache.get(cacheKey);

    const lookup = neighborhoodLookupQueue.then(async () => {
        const cached = neighborhoodCache.get(cacheKey);
        if (cached) return cached;
        const waitMs = Math.max(0, 1000 - (Date.now() - lastNeighborhoodLookupAt));
        if (waitMs) await new Promise(resolve => setTimeout(resolve, waitMs));
        lastNeighborhoodLookupAt = Date.now();

        try {
            const endpoint = new URL('https://nominatim.openstreetmap.org/reverse');
            endpoint.searchParams.set('format', 'jsonv2');
            endpoint.searchParams.set('addressdetails', '1');
            endpoint.searchParams.set('zoom', '16');
            endpoint.searchParams.set('lat', String(lat));
            endpoint.searchParams.set('lon', String(lng));
            const response = await fetch(endpoint, { headers: { 'User-Agent': 'P3CouplesPlanner/1.0' } });
            if (!response.ok) return '';
            const data = await response.json();
            const address = data.address || {};
            const neighborhood = address.neighbourhood || address.suburb ||
                address.city_district || address.quarter || address.borough || '';
            if (neighborhood) {
                if (neighborhoodCache.size >= 200) neighborhoodCache.delete(neighborhoodCache.keys().next().value);
                neighborhoodCache.set(cacheKey, neighborhood);
            }
            return neighborhood;
        } catch (e) {
            return '';
        }
    });
    neighborhoodLookupQueue = lookup.then(() => undefined, () => undefined);
    return lookup;
}

module.exports = function(requireAuth) {
    router.get('/hub', requireAuth, (req, res) => {
        const todayStr = new Date().toISOString().split('T')[0];

        db.all(`SELECT key, value FROM app_settings`, [], (err, settingRows) => {
            const settings = {};
            (settingRows || []).forEach(r => {
                if (r.key === 'vapidKeys') return;
                // Strictly only expose jennaLastActive to Joao
                if (r.key === 'jennaLastActive' && req.user !== 'Joao') return;
                settings[r.key] = r.value;
            });

            db.all(`SELECT rowid as id, * FROM daily_answers ORDER BY rowid DESC`, [], async (err2, allRows) => {
                const rows = allRows || [];
                let activePrompt = rows[0] || null;
                const recentQs = rows.map(r => r.question).filter(Boolean);

                const isLatestComplete = Boolean(activePrompt && activePrompt.joaoAnswer && activePrompt.jennaAnswer);
                const isNewDayAfterCompletion = isLatestComplete && activePrompt.date !== todayStr;

                if (!activePrompt || isNewDayAfterCompletion) {
                    const freshQ = await generateAICoupleQuestion(recentQs);
                    await new Promise(resolve => {
                        db.run(
                            `INSERT OR REPLACE INTO daily_answers (date, question, joaoAnswer, jennaAnswer, joaoReaction, jennaReaction, isStarred) VALUES (?, ?, '', '', '', '', 0)`,
                            [todayStr, freshQ],
                            function() {
                                activePrompt = { id: this.lastID, date: todayStr, question: freshQ, joaoAnswer: '', jennaAnswer: '', joaoReaction: '', jennaReaction: '', isStarred: 0 };
                                resolve();
                            }
                        );
                    });
                }

                const history = rows.filter(r => r.joaoAnswer && r.jennaAnswer && r.date !== activePrompt.date);

                db.all(`SELECT * FROM visit_checklist ORDER BY isDone ASC, id DESC`, [], (errC, checklist) => {
                    db.all(
                        `SELECT * FROM notifications WHERE targetUser = ? AND isRead = 0 ORDER BY id ASC`,
                        [req.user],
                        (err3, notifs) => {
                            if (notifs && notifs.length > 0) {
                                db.run(`UPDATE notifications SET isRead = 1 WHERE targetUser = ?`, [req.user]);
                            }
                            res.json({
                                settings,
                                daily: activePrompt,
                                history,
                                checklist: checklist || [],
                                notifications: notifs || [],
                                vapidPublicKey
                            });
                        }
                    );
                });
            });
        });
    });

    router.post('/hub/daily-answer', requireAuth, (req, res) => {
        if (req.user === 'Guest') return res.status(403).json({ error: 'Unauthorized' });
        const { date, answer } = req.body;
        if (!date || !answer) return res.status(400).json({ error: 'Missing answer' });

        const todayStr = new Date().toISOString().split('T')[0];
        const col = req.user === 'Jenna' ? 'jennaAnswer' : 'joaoAnswer';
        const otherCol = req.user === 'Jenna' ? 'joaoAnswer' : 'jennaAnswer';

        db.get(`SELECT * FROM daily_answers WHERE date = ?`, [date], (err, row) => {
            if (!row) return res.status(404).json({ error: 'Prompt not found' });
            const newDateKey = (row[otherCol] && date !== todayStr) ? todayStr : date;

            db.run(`UPDATE daily_answers SET ${col} = ?, date = ? WHERE date = ?`, [answer.trim(), newDateKey, date], () => {
                notifyPartner(req.user, '💬 Daily "Us" Prompt', `${req.user} answered our prompt! Tap to see.`);
                res.json({ success: true });
            });
        });
    });

    router.post('/hub/daily-react', requireAuth, (req, res) => {
        if (req.user === 'Guest') return res.status(403).json({ error: 'Unauthorized' });
        const { date, emoji } = req.body;
        const col = req.user === 'Jenna' ? 'jennaReaction' : 'joaoReaction';
        db.run(`UPDATE daily_answers SET ${col} = ? WHERE date = ?`, [emoji || '', date], () => {
            if (emoji) notifyPartner(req.user, `💬 ${req.user} reacted ${emoji}`, `To your Daily "Us" answer!`);
            res.json({ success: true });
        });
    });

    router.post('/hub/daily-star', requireAuth, (req, res) => {
        if (req.user === 'Guest') return res.status(403).json({ error: 'Unauthorized' });
        const { date, isStarred } = req.body;
        db.run(`UPDATE daily_answers SET isStarred = ? WHERE date = ?`, [isStarred ? 1 : 0, date], () => {
            res.json({ success: true });
        });
    });

    // Visit Prep Checklist (Bring / Buy / Have Ready)
    router.post('/hub/checklist', requireAuth, (req, res) => {
        if (req.user === 'Guest') return res.status(403).json({ error: 'Unauthorized' });
        const { text, category } = req.body;
        if (!text || !text.trim()) return res.status(400).json({ error: 'Empty item' });
        db.run(
            `INSERT INTO visit_checklist (text, category, addedBy, isDone) VALUES (?, ?, ?, 0)`,
            [text.trim(), category || 'bring', req.user],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ id: this.lastID });
            }
        );
    });

    router.patch('/hub/checklist/:id', requireAuth, (req, res) => {
        if (req.user === 'Guest') return res.status(403).json({ error: 'Unauthorized' });
        db.run(`UPDATE visit_checklist SET isDone = ? WHERE id = ?`, [req.body.isDone ? 1 : 0, req.params.id], () => {
            res.json({ success: true });
        });
    });

    router.delete('/hub/checklist/:id', requireAuth, (req, res) => {
        if (req.user === 'Guest') return res.status(403).json({ error: 'Unauthorized' });
        db.run(`DELETE FROM visit_checklist WHERE id = ?`, [req.params.id], () => {
            res.json({ success: true });
        });
    });

    router.post('/hub/settings', requireAuth, (req, res) => {
        if (req.user === 'Guest') return res.status(403).json({ error: 'Unauthorized' });
        const entries = Object.entries(req.body || {});
        const stmt = db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`);
        entries.forEach(([k, v]) => stmt.run(k, String(v)));
        stmt.finalize(() => {
            if (req.body.countdownDate) {
                notifyPartner(req.user, '✈️ Countdown Updated!', `${req.user} updated our countdown: ${req.body.countdownTitle || 'Next Visit'}`);
            }
            res.json({ success: true });
        });
    });

    router.post('/push-subscribe', requireAuth, (req, res) => {
        if (req.user === 'Guest') return res.status(403).json({ error: 'Unauthorized' });
        const { endpoint, keys } = req.body || {};
        if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });
        db.run(
            `INSERT OR REPLACE INTO push_subscriptions (endpoint, user, keysJson) VALUES (?, ?, ?)`,
            [endpoint, req.user, JSON.stringify(keys || {})],
            () => res.json({ success: true })
        );
    });

    // Enhanced Google Maps Auto-Fill (Extracts Name, City, Neighborhood & Coordinates)
    router.post('/maps-autofill', requireAuth, async (req, res) => {
        const { url } = req.body;
        if (!url || !url.startsWith('http')) return res.status(400).json({ error: 'Invalid URL' });
        try {
            const response = await fetch(url, {
                redirect: 'follow',
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; P3Bot/1.0)' }
            });
            if (!response.ok) throw new Error(`Google Maps returned HTTP ${response.status}`);
            const finalUrl = response.url || url;
            const html = await response.text();
            let name = '', city = '', neighborhood = '', lat = null, lng = null;

            const coordMatch = finalUrl.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/) ||
                html.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
            if (coordMatch) {
                lat = parseFloat(coordMatch[1]);
                lng = parseFloat(coordMatch[2]);
            }

            const placeMatch = finalUrl.match(/\/maps\/place\/([^/@?]+)/);
            if (placeMatch && placeMatch[1]) {
                const parts = decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')).split(',').map(s => s.trim());
                name = parts[0] || '';
                if (parts.length >= 3) {
                    neighborhood = parts[1] || '';
                    city = parts[parts.length - 2] || parts[2] || '';
                } else if (parts.length === 2) {
                    city = parts[1] || '';
                }
            }

            const ogMatch = html.match(/property="og:title"\s+content="([^"]+)"/i) || html.match(/<title>([^<]+)<\/title>/i);
            if (ogMatch && ogMatch[1]) {
                const segments = ogMatch[1].replace(/ - Google Maps/i, '').trim().split('·')
                    .map(s => s.trim())
                    .filter(s => s && !/^google maps$/i.test(s));
                if (!name && segments[0]) name = segments[0];
                if (segments[1]) {
                    const addrParts = segments[1].split(',').map(s => s.trim());
                    if (!city) city = addrParts[addrParts.length - 1] || addrParts[0] || '';
                    if (!neighborhood && addrParts.length >= 2) neighborhood = addrParts[0] || '';
                }
            }
            if (!neighborhood && Number.isFinite(lat) && Number.isFinite(lng)) {
                neighborhood = await findNeighborhood(lat, lng);
            }
            console.log('[P3 restaurant-map] Maps autofill:', JSON.stringify({
                sourceHost: new URL(url).hostname,
                resolvedHost: new URL(finalUrl).hostname,
                name,
                city,
                lat,
                lng,
                coordinateSource: coordMatch ? 'google-place-pin' : 'no-place-pin'
            }));
            res.json({ name, city, neighborhood, lat, lng, finalUrl });
        } catch (e) {
            console.error('[P3 restaurant-map] Maps autofill failed:', e.message);
            res.status(502).json({ error: 'Could not read this Google Maps link.' });
        }
    });

    router.post('/social-oembed', requireAuth, async (req, res) => {
        const thumbnailUrl = await fetchSocialThumbnail(req.body.url || '');
        res.json({ thumbnailUrl });
    });

    router.get('/flight-status/:ident', requireAuth, async (req, res) => {
        const ident = String(req.params.ident || '').toUpperCase();
        if (!/^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/.test(ident)) {
            return res.status(400).json({ error: 'Invalid flight number.' });
        }
        const apiKey = process.env.FLIGHTAWARE_API_KEY;
        if (!apiKey) return res.status(503).json({ error: 'Live flight tracking is not configured.' });

        const now = new Date();
        const start = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();
        const end = new Date(now.getTime() + 36 * 60 * 60 * 1000).toISOString();
        const endpoint = new URL(`https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(ident)}`);
        endpoint.searchParams.set('start', start);
        endpoint.searchParams.set('end', end);
        try {
            const response = await fetch(endpoint, { headers: { 'x-apikey': apiKey } });
            if (!response.ok) return res.status(502).json({ error: 'Flight tracking provider is unavailable.' });
            const payload = await response.json();
            const flights = Array.isArray(payload.flights) ? payload.flights : [];
            const flight = flights.find(item => {
                const idents = [
                    item.ident,
                    item.ident_icao,
                    item.ident_iata,
                    ...(Array.isArray(item.codeshares) ? item.codeshares : []),
                    ...(Array.isArray(item.codeshares_iata) ? item.codeshares_iata : [])
                ];
                return idents.some(value => String(value || '').toUpperCase() === ident);
            }) || flights[0];
            if (!flight) return res.json({ flight: null });
            res.json({
                flight: {
                    ident: flight.ident,
                    status: flight.status,
                    scheduled_in: flight.scheduled_in || flight.scheduled_on,
                    estimated_in: flight.estimated_in || flight.estimated_on,
                    actual_in: flight.actual_in || flight.actual_on,
                    arrival_terminal: flight.arrival_terminal || flight.terminal_destination,
                    arrival_gate: flight.arrival_gate || flight.gate_destination,
                    destination_timezone: flight.destination?.timezone || ''
                }
            });
        } catch (e) {
            res.status(502).json({ error: 'Flight tracking provider is unavailable.' });
        }
    });

    return { router, notifyPartner, fetchSocialThumbnail };
};