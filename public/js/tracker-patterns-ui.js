let activePatternTab = 'radar';
let lastPatternAvgLen = 28;
let lastPatternCycleDay = null;
let showAllPhaseProfiles = false;

const PREEMPTIVE_TIPS = {
    'Cramps': '💡 Prep tip: Boost magnesium and water intake 48h before cramps peak to relax smooth muscle.',
    'Migraine': '💡 Prep tip: Keep electrolytes steady and avoid late-afternoon caffeine around this window.',
    'Bloating': '💡 Prep tip: Potassium-rich foods (banana, avocado) and light walks help flush luteal water retention.',
    'Fatigue': '💡 Prep tip: Progesterone raises core temperature and fragments sleep; aim for an earlier wind-down.',
    'Sleep': '💡 Prep tip: Luteal progesterone raises body temp—a cooler room (18°C) and magnesium glycinate help deeper sleep.',
    'Moody': '💡 Prep tip: Complex carbs and B6 help support serotonin when estrogen dips.',
    'Cravings': '💡 Prep tip: Dark chocolate, nuts, or protein snacks help stabilize luteal blood sugar drops.',
    'Tender Breasts': '💡 Prep tip: Reducing excess salt and caffeine in the late luteal phase helps ease swelling.',
    'Horny': '🔥 Peak window: Estrogen and testosterone surge here! Prime time for a spicy date or virtual night.',
    'High Energy': '⚡ Peak battery: Great window for outdoor dates, workouts, or planning a trip together.'
};

function switchPatternView(tabName) {
    triggerHaptic(8);
    activePatternTab = tabName;
    renderSymptomPatterns(lastPatternAvgLen, lastPatternCycleDay);
}

function toggleAllPhaseProfiles() {
    triggerHaptic(8);
    showAllPhaseProfiles = !showAllPhaseProfiles;
    renderSymptomPatterns(lastPatternAvgLen, lastPatternCycleDay);
}

function getPreemptiveTip(symName) {
    for (const key of Object.keys(PREEMPTIVE_TIPS)) {
        if (symName.toLowerCase().includes(key.toLowerCase())) return PREEMPTIVE_TIPS[key];
    }
    return null;
}

function checkPmsSignatureBanner(pmsSigSyms, currentCycleDay, avgLength) {
    const banner = document.getElementById('pms-signature-banner');
    if (!banner) return;
    if (!pmsSigSyms || pmsSigSyms.length < 2 || !currentCycleDay || currentCycleDay < avgLength - 5) {
        banner.style.display = 'none';
        return;
    }

    const todayStr = formatDateStr(new Date());
    const yestStr = getPreviousDayStr(todayStr);
    const recentSyms = new Set([
        ...Object.keys(parseSymptomString(cycleLogs[todayStr]?.symptoms || '')),
        ...Object.keys(parseSymptomString(cycleLogs[yestStr]?.symptoms || ''))
    ]);

    const matched = pmsSigSyms.filter(s => recentSyms.has(s));
    if (matched.length >= 2) {
        banner.style.display = 'block';
        banner.innerHTML = `
            <div style="font-weight: 700; font-size: 13.5px; color: #fbbf24;">⛓️ Personal PMS Fingerprint Detected</div>
            <div style="font-size: 12px; opacity: 0.9; margin-top: 2px;">You logged <b>${matched.join(' + ')}</b> in the last 48h—historically this combination signals your period is 1 to 2 days away.</div>
        `;
    } else {
        banner.style.display = 'none';
    }
}

function getPeriodArrivalWindowHtml(avgLength) {
    if (cycles.length === 0) return '';
    const { diffs } = getCycleStats();
    const latestStart = new Date(cycles[0].startDate + 'T00:00:00');
    const halfSpread = diffs.length >= 2 ? Math.min(Math.ceil((Math.max(...diffs) - Math.min(...diffs)) / 2), 5) : 1;

    const earliest = new Date(latestStart);
    earliest.setDate(latestStart.getDate() + avgLength - halfSpread);
    const latest = new Date(latestStart);
    latest.setDate(latestStart.getDate() + avgLength + halfSpread);

    const eStr = earliest.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const lStr = latest.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const windowStr = eStr === lStr ? eStr : `${eStr} - ${lStr}`;

    return `
        <div class="pattern-item" style="border-color: var(--accent); margin-bottom: 10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-weight:700;font-size:12.5px;color:var(--accent);">🎯 Next Period Arrival Window (Weighted)</span>
                <span class="badge" style="font-size:10px;">±${halfSpread}d spread</span>
            </div>
            <div style="font-size:12px;opacity:0.9;">Expected between <b>${windowStr}</b> using recency-weighted cycle math.</div>
        </div>
    `;
}

function renderSymptomPatterns(avgLength, currentCycleDay) {
    lastPatternAvgLen = avgLength;
    lastPatternCycleDay = currentCycleDay;

    const box = document.getElementById('symptom-patterns-box');
    if (!box) return;

    const logDates = Object.keys(cycleLogs);
    if (cycles.length === 0 || logDates.length === 0) {
        box.innerHTML = `Tap any day on the calendar to log symptoms and unlock predictive radar, phase profiles, and domino chains.`;
        return;
    }

    const { patterns, totalTrackedCycles, dailyContext, logDates: sortedDates, ascCycles } = buildPhaseClusters(avgLength, currentCycleDay);
    const { sameDayPairs, dominoChains, heavyFlowSyms, heavyFlowDaysCount, bioInsights, pmsSigSyms } = analyzeCorrelationsAndBioLinks(dailyContext, sortedDates, ascCycles, avgLength);

    checkPmsSignatureBanner(pmsSigSyms, currentCycleDay, avgLength);

    const navHtml = `
        <div class="pattern-nav-pills">
            <button class="pattern-nav-btn ${activePatternTab === 'radar' ? 'active' : ''}" onclick="switchPatternView('radar')">🔮 7-Day Radar</button>
            <button class="pattern-nav-btn ${activePatternTab === 'phases' ? 'active' : ''}" onclick="switchPatternView('phases')">📊 Phase Profiles</button>
            <button class="pattern-nav-btn ${activePatternTab === 'links' ? 'active' : ''}" onclick="switchPatternView('links')">🔗 Domino & Bio</button>
        </div>
    `;

    // TAB 1: 7-DAY RADAR
    if (activePatternTab === 'radar') {
        let radarHtml = '';
        if (currentCycleDay) {
            let dayCards = [];
            for (let offset = 0; offset <= 6; offset++) {
                let projDay = currentCycleDay + offset;
                const isNewPeriodStart = projDay > avgLength && (projDay - avgLength) <= 2;
                if (projDay > avgLength) projDay = projDay - avgLength;

                const matching = patterns.filter(p => Math.abs(p.targetCycleDay - projDay) <= 1 || Math.abs(p.peakDay - projDay) === 0);
                const dObj = new Date();
                dObj.setDate(dObj.getDate() + offset);
                const dayName = offset === 0 ? 'Today' : (offset === 1 ? 'Tmrw' : dObj.toLocaleDateString(undefined, { weekday: 'short' }));

                let icons = matching.slice(0, 2).map(m => `<span>${m.sym.split(' ')[0]}</span>`).join('');
                if (isNewPeriodStart && !icons.includes('🩸')) icons = `<span>🩸</span>` + icons;

                const boxCls = isNewPeriodStart ? 'pred-period' : (matching.length > 0 ? 'has-pred' : '');
                dayCards.push(`
                    <div class="radar-day-box ${boxCls}">
                        <span class="radar-day-lbl">${dayName}</span>
                        <span class="radar-cday">D${projDay}</span>
                        <div class="radar-icons">${icons || '<span style="opacity:0.35;font-size:10px;">Clear</span>'}</div>
                    </div>
                `);
            }
            radarHtml = `<div class="radar-strip-wrap"><span class="filter-label" style="margin-bottom: 6px;">🗓️ Next 7 Days Symptom & Bleed Forecast</span><div class="radar-strip">${dayCards.join('')}</div></div>`;
        }

        const upcomingList = patterns.filter(p => p.isUpcoming);
        const cardsHtml = upcomingList.length > 0
            ? upcomingList.map(p => {
                const whenStr = p.daysAway === 0 ? 'Expected Today' : `Expected in ${p.daysAway} ${p.daysAway === 1 ? 'day' : 'days'}`;
                const tip = getPreemptiveTip(p.sym);
                const curve = p.trajectoryLabel ? ` • ${p.trajectoryLabel}` : '';
                return `
                    <div class="pattern-item heads-up">
                        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                            <span style="font-weight: 700; color: #fbbf24;">⚠️ ${p.sym} • ${whenStr}</span>
                            <span class="badge" style="font-size:10px;border-color:#fbbf24;color:#fbbf24;">${p.confidencePct}% match</span>
                        </div>
                        <div style="font-size: 12px; opacity: 0.9;">${p.timingLabel} • Span: ~${p.avgEpisodeDays}d${curve}</div>
                        ${tip ? `<div class="pattern-tip-box">${tip}</div>` : ''}
                    </div>
                `;
            }).join('')
            : `<div class="pattern-item healthy-ok"><div style="font-weight: 700; color: #10b981;">✨ Clear 72-Hour Symptom Window</div><div style="font-size: 12px; opacity: 0.85;">No recurring symptoms are projected to peak in the next 3 days.</div></div>`;

        box.innerHTML = navHtml + getPeriodArrivalWindowHtml(avgLength) + radarHtml + cardsHtml;
        return;
    }

    // TAB 2: COMPACT 2-COLUMN PHASE PROFILES
    if (activePatternTab === 'phases') {
        const visiblePatterns = showAllPhaseProfiles ? patterns : patterns.slice(0, 6);
        const listHtml = visiblePatterns.map(p => {
            const meta = [`~${p.avgEpisodeDays}d`, p.sevLabel, p.trajectoryLabel].filter(Boolean).join(' • ');
            const esc = p.sym.replace(/'/g, "\\'");
            return `
                <div class="pattern-item" onclick="highlightSymptomOnCalendar('${esc}')" style="cursor:pointer;" title="Tap to highlight on calendar">
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 4px;">
                        <span style="font-weight: 700; font-size: 12px;">${p.sym} <span style="font-size:10px;opacity:0.6;">🔍</span></span>
                        <span class="badge" style="font-size: 9.5px; padding: 1px 6px;">${p.phaseTitle.split(' ')[0]}</span>
                    </div>
                    <div style="font-size: 11px; opacity: 0.85; margin-top: 3px;">${p.timingLabel}</div>
                    <div style="font-size: 10.5px; opacity: 0.7; margin-top: 1px;">${meta}</div>
                    <div class="conf-bar-row">
                        <div class="conf-bar-track"><div class="conf-bar-fill" style="width: ${p.confidencePct}%;"></div></div>
                        <span class="conf-bar-lbl">${p.confidencePct}% (${p.cycleCount}/${totalTrackedCycles})</span>
                    </div>
                </div>
            `;
        }).join('');

        const moreBtn = patterns.length > 6
            ? `<button class="reset-btn" onclick="toggleAllPhaseProfiles()" style="width:100%;margin-top:10px;padding:8px;">${showAllPhaseProfiles ? '▲ Show Top 6' : `▼ Show All (${patterns.length} Profiles)`}</button>`
            : '';

        box.innerHTML = navHtml
            + `<div style="font-size:11px;opacity:0.65;margin-bottom:8px;">💡 Tap any symptom card to highlight every occurrence on the Calendar:</div>`
            + `<div class="phase-profile-grid">${listHtml}</div>`
            + moreBtn;
        return;
    }

    // TAB 3: DOMINO CHAINS & BIO-RHYTHMS
    const topDominos = Object.entries(dominoChains).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const topPairs = Object.entries(sameDayPairs).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const topHeavy = Object.entries(heavyFlowSyms).filter(([, c]) => c >= 1).sort((a, b) => b[1] - a[1]).slice(0, 3);

    let linksHtml = '';
    if (bioInsights.length > 0) {
        linksHtml += `<span class="filter-label">🧬 Personal Bio-Rhythms & Global Baseline</span>` + bioInsights.map(b => `
            <div class="pattern-item"><div style="font-weight:700;font-size:12.5px;">${b.icon} ${b.title}</div><div style="font-size:11.5px;opacity:0.85;">${b.desc}</div></div>
        `).join('');
    }
    if (topDominos.length > 0) {
        linksHtml += `<span class="filter-label" style="margin-top:8px;">⏭️ 24-Hour Domino Triggers</span>` + topDominos.map(([chain, cnt]) => `
            <div class="pattern-item" style="border-left: 3px solid #f59e0b;"><div style="font-weight:700;font-size:12.5px;">${chain}</div><div style="font-size:11.5px;opacity:0.8;">Back-to-back days ${cnt}x.</div></div>
        `).join('');
    }
    if (topPairs.length > 0) {
        linksHtml += `<span class="filter-label" style="margin-top:8px;">🔗 Same-Day Combos</span>` + topPairs.map(([pair, cnt]) => `
            <div class="pattern-item" style="border-left: 3px solid var(--accent);"><div style="font-weight:700;font-size:12.5px;">${pair}</div><div style="font-size:11.5px;opacity:0.8;">Logged together ${cnt}x.</div></div>
        `).join('');
    }
    if (heavyFlowDaysCount > 0 && topHeavy.length > 0) {
        const heavyList = topHeavy.map(([s, c]) => `${s} (${Math.round((c / heavyFlowDaysCount) * 100)}%)`).join(', ');
        linksHtml += `<span class="filter-label" style="margin-top:8px;">🩸🩸 Heavy Flow Companions</span><div class="pattern-item" style="border-left: 3px solid #ef4444;"><div style="font-size:11.5px;opacity:0.85;">Most common on heavy days: <b>${heavyList}</b>.</div></div>`;
    }
    box.innerHTML = navHtml + linksHtml;
}