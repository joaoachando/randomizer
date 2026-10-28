let highlightedCalendarSymptom = null;

function highlightSymptomOnCalendar(symName) {
    triggerHaptic(10);
    highlightedCalendarSymptom = symName;
    switchTrackerSubTab('cal');
    updateCalendarHighlightBar();
    renderCalendar(getCycleStats().avgLength);
    showToast(`Highlighting "${symName}" on calendar 🔍`);
}

function clearCalendarSymptomHighlight() {
    triggerHaptic(8);
    highlightedCalendarSymptom = null;
    updateCalendarHighlightBar();
    renderCalendar(getCycleStats().avgLength);
}

function updateCalendarHighlightBar() {
    const bar = document.getElementById('cal-sym-filter-bar');
    if (!bar) return;
    if (!highlightedCalendarSymptom) {
        bar.style.display = 'none';
        return;
    }
    const matchCount = Object.values(cycleLogs).filter(l => l && l.symptoms && parseSymptomString(l.symptoms)[highlightedCalendarSymptom]).length;
    bar.style.display = 'flex';
    bar.innerHTML = `
        <span>🔍 Highlighting: <b>${highlightedCalendarSymptom}</b> (${matchCount}d logged)</span>
        <button class="reset-btn" onclick="clearCalendarSymptomHighlight()" style="padding:2px 8px;font-size:11px;border-color:#fbbf24;color:#fbbf24;">✖ Clear</button>
    `;
}

// Long-Distance Trip & Event Phase Predictor
function runTripPhasePredictor() {
    const startVal = document.getElementById('trip-start-input')?.value;
    const endVal = document.getElementById('trip-end-input')?.value;
    const box = document.getElementById('trip-predictor-results');
    if (!box || !startVal) return;

    if (cycles.length === 0) {
        box.innerHTML = `<div class="pattern-item">Log at least one period first to project future trip dates.</div>`;
        return;
    }

    const tripStart = new Date(startVal + 'T00:00:00');
    const tripEnd = endVal ? new Date(endVal + 'T00:00:00') : new Date(tripStart);
    if (tripEnd < tripStart) {
        box.innerHTML = `<div class="pattern-item anomaly-alert">Departure date must be on or after arrival date.</div>`;
        return;
    }

    const { avgLength, avgBleed } = getCycleStats();
    const bleedLen = avgBleed ? Math.round(parseFloat(avgBleed)) : 5;
    const latestStart = new Date(cycles[0].startDate + 'T00:00:00');
    const ovuCenter = avgLength - 14;

    let rows = [];
    let periodDaysCount = 0;
    let spicyPeakCount = 0;
    let totalDays = 0;

    for (let d = new Date(tripStart); d <= tripEnd && totalDays < 21; d.setDate(d.getDate() + 1)) {
        totalDays++;
        const diffFromLatest = Math.floor((d - latestStart) / 86400000);
        let projCycleDay = ((diffFromLatest % avgLength) + avgLength) % avgLength + 1;

        let phaseBadge = '🌱 Follicular (High Energy)';
        let color = '#34d399';
        if (projCycleDay <= bleedLen) {
            phaseBadge = '🩸 Period Window';
            color = '#f87171';
            periodDaysCount++;
        } else if (Math.abs(projCycleDay - ovuCenter) <= 2) {
            phaseBadge = '✨ Ovulation / 🌶️ Peak Window';
            color = '#60a5fa';
            spicyPeakCount++;
        } else if (projCycleDay > ovuCenter + 2) {
            phaseBadge = projCycleDay >= avgLength - 4 ? '🌙 Late Luteal (PMS)' : '🌙 Mid-Luteal (Cozy)';
            color = '#c084fc';
        } else {
            spicyPeakCount++;
        }

        const niceD = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
        rows.push(`
            <div style="display:flex;justify-content:space-between;padding:5px 8px;border-bottom:1px solid var(--border);font-size:12px;">
                <span><b>${niceD}</b> (Day ${projCycleDay})</span>
                <span style="color:${color};font-weight:700;">${phaseBadge}</span>
            </div>
        `);
    }

    const summaryVerdict = periodDaysCount === 0
        ? `<div style="color:#10b981;font-weight:700;margin-bottom:6px;">✅ 0% Period Conflict (${spicyPeakCount} High-Energy/Spicy days!)</div>`
        : `<div style="color:#f87171;font-weight:700;margin-bottom:6px;">🩸 Heads-up: Period overlaps with ${periodDaysCount} ${periodDaysCount === 1 ? 'day' : 'days'} of this trip.</div>`;

    box.innerHTML = `<div class="pattern-item" style="padding:10px;">${summaryVerdict}${rows.join('')}</div>`;
}

// 1-Tap Privacy-Safe Doctor Visit Summary Modal
function openDoctorSummaryModal() {
    triggerHaptic(10);
    const { avgLength, avgBleed, regularityText } = getCycleStats();
    const lmp = cycles.length > 0 ? cycles[0].startDate : 'None';

    const clinicalCounts = {};
    Object.values(cycleLogs).forEach(l => {
        if (!l || !l.symptoms) return;
        const map = parseSymptomString(l.symptoms);
        Object.keys(map).forEach(s => {
            if (!INTIMACY_OPTIONS.includes(s) && !s.toLowerCase().includes('horny') && !s.includes('Breast Self-Exam')) {
                clinicalCounts[s] = (clinicalCounts[s] || 0) + 1;
            }
        });
    });

    const topClinical = Object.entries(clinicalCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([s, c]) => `${s} (${c}d)`).join(', ') || 'None logged';

    const recentList = cycles.slice(0, 6).map((c, idx) => {
        const bleed = c.endDate ? `${Math.round((new Date(c.endDate + 'T00:00:00') - new Date(c.startDate + 'T00:00:00')) / 86400000) + 1}d bleed` : 'Ongoing';
        const len = idx < cycles.length - 1
            ? `${Math.round((new Date(c.startDate + 'T00:00:00') - new Date(cycles[idx + 1].startDate + 'T00:00:00')) / 86400000)}d cycle`
            : 'Initial entry';
        return `• ${c.startDate} to ${c.endDate || 'Present'} (${bleed}, ${len})`;
    }).join('<br>');

    document.getElementById('doctor-summary-content').innerHTML = `
        <div><b>Last Menstrual Period (LMP):</b> ${lmp}</div>
        <div><b>Weighted Avg Cycle Length:</b> ${avgLength} days (${regularityText})</div>
        <div><b>Avg Bleed Duration:</b> ${avgBleed ? `${avgBleed} days` : 'N/A'}</div>
        <div style="margin-top:8px;"><b>Recent Cycle Intervals (Last 6):</b><br>${recentList || 'No cycles logged'}</div>
        <div style="margin-top:8px;"><b>Primary Recurring Clinical Symptoms:</b><br>${topClinical}</div>
    `;
    document.getElementById('doctor-overlay').style.display = 'flex';
}

function copyDoctorSummaryText() {
    const text = document.getElementById('doctor-summary-content').innerText;
    navigator.clipboard.writeText(text);
    showToast("Clinical summary copied to clipboard! 📋");
}

function syncCountdownToTripChecker() {
    const startInput = document.getElementById('trip-start-input');
    const endInput = document.getElementById('trip-end-input');
    if (!startInput || !endInput) return;
    if (typeof hubSettings === 'undefined' || !hubSettings.countdownDate) return;

    const arrivalDateOnly = hubSettings.countdownDate.split('T')[0];
    if (!arrivalDateOnly) return;

    if (!startInput.value) {
        startInput.value = arrivalDateOnly;
        const dep = new Date(arrivalDateOnly + 'T00:00:00');
        dep.setDate(dep.getDate() + 7);
        endInput.value = formatDateStr(dep);
    }
    if (typeof cycles !== 'undefined' && cycles.length > 0) {
        runTripPhasePredictor();
    }
}