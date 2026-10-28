function checkWrappedVisibility() {
    const btn = document.getElementById('btn-hub-wrapped');
    if (!btn) return;

    const now = new Date();
    const isEndOfYear = now.getMonth() === 11; // December (0-indexed: 11)

    const doneDatesCount = (typeof ideas !== 'undefined' ? ideas : []).filter(i => i.isDone).length;
    const visitedSpotsCount = (typeof restaurants !== 'undefined' ? restaurants : []).filter(r => r.isVisited).length;
    const hasSomething = (doneDatesCount + visitedSpotsCount) > 0;

    btn.style.display = (isEndOfYear && hasSomething) ? 'inline-block' : 'none';
}

function openWrappedModal() {
    triggerHaptic(12);
    const box = document.getElementById('wrapped-content-box');
    if (!box) return;

    const doneDates = (typeof ideas !== 'undefined' ? ideas : []).filter(i => i.isDone);
    const allDates = typeof ideas !== 'undefined' ? ideas : [];
    const visitedSpots = (typeof restaurants !== 'undefined' ? restaurants : []).filter(r => r.isVisited);
    const allSpots = typeof restaurants !== 'undefined' ? restaurants : [];
    const cafeSpots = allSpots.filter(r => r.spotType === 'cafe');
    const loggedDaysCount = typeof cycleLogs !== 'undefined' ? Object.keys(cycleLogs).length : 0;

    const cityCounts = {};
    allSpots.forEach(r => {
        if (r.city) cityCounts[r.city] = (cityCounts[r.city] || 0) + 1;
    });
    const topCityEntry = Object.entries(cityCounts).sort((a, b) => b[1] - a[1])[0];
    const topCity = topCityEntry ? `${topCityEntry[0]} (${topCityEntry[1]} spots)` : 'Add spots!';

    const cuisineCounts = {};
    allSpots.forEach(r => {
        if (r.cuisine) cuisineCounts[r.cuisine] = (cuisineCounts[r.cuisine] || 0) + 1;
    });
    const topCuisineEntry = Object.entries(cuisineCounts).sort((a, b) => b[1] - a[1])[0];
    const topCuisine = topCuisineEntry ? `${topCuisineEntry[0]} (${topCuisineEntry[1]})` : 'None yet';

    const vibeCounts = {};
    doneDates.forEach(d => {
        if (d.vibe) vibeCounts[d.vibe] = (vibeCounts[d.vibe] || 0) + 1;
    });
    const topVibeEntry = Object.entries(vibeCounts).sort((a, b) => b[1] - a[1])[0];
    const topVibe = topVibeEntry ? topVibeEntry[0] : 'Romantic';

    const fiveStarCount = doneDates.filter(d => d.rating === 5).length + visitedSpots.filter(r => r.rating === 5).length;
    const uniqueCitiesCount = Object.keys(cityCounts).length;

    const badges = [
        { icon: '🥂', name: 'First Date Logged', desc: 'Complete your 1st date idea', unlocked: doneDates.length >= 1 },
        { icon: '🔟', name: 'Date Night Pros', desc: 'Complete 10+ date ideas together', unlocked: doneDates.length >= 10 },
        { icon: '🍽️', name: 'Foodie Critics', desc: 'Visit & rate 5+ restaurants', unlocked: visitedSpots.length >= 5 },
        { icon: '🌍', name: 'Multi-City Jetsetters', desc: 'Save spots across 3+ cities', unlocked: uniqueCitiesCount >= 3 },
        { icon: '☕', name: 'Cafe & Pastry Club', desc: 'Save 3+ Coffee & Pastry spots', unlocked: cafeSpots.length >= 3 },
        { icon: '🌶️', name: 'Spicy Explorers', desc: 'Complete a spicy date idea', unlocked: doneDates.some(d => d.spicy) },
        { icon: '💯', name: '5-Heart Memories', desc: 'Rate 5+ dates or spots 5/5 hearts', unlocked: fiveStarCount >= 5 },
        { icon: '🌙', name: 'Cycle Synced', desc: 'Log 15+ daily tracker check-ins', unlocked: loggedDaysCount >= 15 }
    ];

    const unlockedCount = badges.filter(b => b.unlocked).length;

    const badgesHtml = badges.map(b => `
        <div class="stat-box" style="opacity: ${b.unlocked ? '1' : '0.4'}; border-color: ${b.unlocked ? 'var(--accent)' : 'var(--border)'}; display:flex; align-items:center; gap:8px; padding:8px 10px;">
            <span style="font-size:20px;">${b.icon}</span>
            <div>
                <div style="font-size:12px;font-weight:700;">${b.name} ${b.unlocked ? '✓' : '🔒'}</div>
                <div style="font-size:10.5px;opacity:0.75;">${b.desc}</div>
            </div>
        </div>
    `).join('');

    box.innerHTML = `
        <div style="background:linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.01)); border:1px solid var(--border); border-radius:12px; padding:12px; margin-bottom:12px;">
            <span class="filter-label" style="color:var(--accent);opacity:1;">✨ ${new Date().getFullYear()} Year-in-Review</span>
            <div class="stats-grid" style="margin-top:6px;">
                <div class="stat-box"><span class="filter-label">Dates Completed</span><div class="stat-val">${doneDates.length} / ${allDates.length}</div></div>
                <div class="stat-box"><span class="filter-label">Spots Visited</span><div class="stat-val">${visitedSpots.length} / ${allSpots.length}</div></div>
                <div class="stat-box"><span class="filter-label">Top Foodie City</span><div class="stat-val" style="font-size:12.5px;">${topCity}</div></div>
                <div class="stat-box"><span class="filter-label">Top Cuisine</span><div class="stat-val" style="font-size:12.5px;">${topCuisine}</div></div>
                <div class="stat-box"><span class="filter-label">5-Heart Ratings</span><div class="stat-val">❤️ ${fiveStarCount}</div></div>
                <div class="stat-box"><span class="filter-label">Signature Vibe</span><div class="stat-val" style="text-transform:capitalize;">${topVibe}</div></div>
            </div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <span class="filter-label" style="margin:0;">🏅 Milestone Badges (${unlockedCount}/${badges.length} Unlocked)</span>
        </div>
        <div class="stats-grid">${badgesHtml}</div>
    `;

    document.getElementById('wrapped-overlay').style.display = 'flex';
    if (unlockedCount > 0) triggerConfetti();
}