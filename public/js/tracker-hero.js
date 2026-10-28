function renderCycles() {
    const { avgLength, avgBleed, regularityText } = getCycleStats();
    document.getElementById('cycle-avg-badge').innerText = `Avg: ${avgLength} days`;

    document.getElementById('stat-cycle').innerText = `${avgLength} days`;
    document.getElementById('stat-bleed').innerText = avgBleed ? `${avgBleed} days` : '-';
    document.getElementById('stat-reg').innerText = regularityText;

    renderCycleLengthChart();

    const heroCardEl = document.getElementById('cycle-hero-card');
    const headlineEl = document.getElementById('cycle-headline');
    const sublineEl = document.getElementById('cycle-subline');
    const phasePillEl = document.getElementById('cycle-phase-pill');
    const phaseEl = document.getElementById('cycle-phase');
    const skincareEl = document.getElementById('cycle-skincare');
    const smartBtn = document.getElementById('smart-period-btn');
    const progressWrap = document.getElementById('phase-progress-wrap');

    if (heroCardEl) {
        heroCardEl.classList.remove('phase-theme-menstrual', 'phase-theme-follicular', 'phase-theme-ovulation', 'phase-theme-luteal');
    }

    let currentCycleDay = null;
    const ongoingCycle = getActiveOngoingCycle();

    if (ongoingCycle) {
        smartBtn.innerText = '✅ Period Ended Today';
        smartBtn.style.background = '#10b981';
        smartBtn.style.color = '#fff';
    } else {
        smartBtn.innerText = '🩸 Period Started Today';
        smartBtn.style.background = 'var(--accent)';
        smartBtn.style.color = 'var(--bg-base)';
    }

    if (cycles.length > 0) {
        const latest = cycles[0];
        const start = new Date(latest.startDate + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        currentCycleDay = Math.floor((today - start) / (1000 * 60 * 60 * 24)) + 1;
        const lmpFormatted = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        document.getElementById('stat-lmp').innerText = `${lmpFormatted} (Day ${currentCycleDay})`;

        checkBreastExamReminder(currentCycleDay, latest.startDate);

        const isPeriodActive = Boolean(ongoingCycle) || (latest.endDate && today <= new Date(latest.endDate + 'T00:00:00'));

        const defaultBleed = avgBleed ? Math.round(parseFloat(avgBleed)) : 5;
        let currentMenstrualDays = defaultBleed;

        if (latest.endDate) {
            const actualBleedDays = Math.round((new Date(latest.endDate + 'T00:00:00') - start) / (1000 * 60 * 60 * 24)) + 1;
            if (actualBleedDays >= 1 && actualBleedDays <= 14) {
                currentMenstrualDays = actualBleedDays;
            }
        } else if (isPeriodActive) {
            currentMenstrualDays = Math.max(defaultBleed, currentCycleDay);
        }

        const effectiveCycleLen = Math.max(avgLength, currentCycleDay, currentMenstrualDays + 14);
        const ovuStartDay = Math.max(effectiveCycleLen - 15, currentMenstrualDays + 3);
        const ovuEndDay = Math.max(effectiveCycleLen - 11, ovuStartDay + 3);

        const follicularDays = Math.max(ovuStartDay - currentMenstrualDays - 1, 2);
        const ovulationDays = Math.max(ovuEndDay - ovuStartDay + 1, 3);
        const lutealDays = Math.max(effectiveCycleLen - ovuEndDay, 5);
        const totalBarDays = currentMenstrualDays + follicularDays + ovulationDays + lutealDays;

        progressWrap.style.display = 'block';
        const menstrualPct = (currentMenstrualDays / totalBarDays) * 100;
        const follicularPct = (follicularDays / totalBarDays) * 100;
        const ovulationPct = (ovulationDays / totalBarDays) * 100;
        const lutealPct = Math.max(100 - (menstrualPct + follicularPct + ovulationPct), 8);

        const segM = document.getElementById('seg-menstrual');
        const segF = document.getElementById('seg-follicular');
        const segO = document.getElementById('seg-ovulation');
        const segL = document.getElementById('seg-luteal');

        segM.style.width = `${menstrualPct.toFixed(1)}%`;
        segF.style.width = `${follicularPct.toFixed(1)}%`;
        segO.style.width = `${ovulationPct.toFixed(1)}%`;
        segL.style.width = `${lutealPct.toFixed(1)}%`;

        [segM, segF, segO, segL].forEach(el => el.classList.remove('active-seg'));
        ['lbl-menstrual', 'lbl-follicular', 'lbl-ovulation', 'lbl-luteal'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('active-lbl');
        });

        const markerEl = document.getElementById('phase-marker');
        const markerTagEl = document.getElementById('phase-marker-tag');
        const markerPct = Math.min(Math.max(((currentCycleDay - 0.5) / totalBarDays) * 100, 3), 97);
        markerEl.style.left = `${markerPct.toFixed(1)}%`;
        if (markerTagEl) markerTagEl.innerText = `Day ${currentCycleDay}`;

        const nextStart = new Date(start);
        nextStart.setDate(start.getDate() + avgLength);
        const daysUntilNext = Math.round((nextStart - today) / (1000 * 60 * 60 * 24));
        const nextDateStr = nextStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

        if (ongoingCycle) {
            headlineEl.innerText = `Period Day ${currentCycleDay}`;
            sublineEl.innerText = `Started ${lmpFormatted} • Take it easy today`;
        } else if (daysUntilNext > 0) {
            headlineEl.innerText = `Next Period in ${daysUntilNext} ${daysUntilNext === 1 ? 'Day' : 'Days'}`;
            sublineEl.innerText = `Predicted around ${nextDateStr} • Cycle Day ${currentCycleDay}`;
        } else if (daysUntilNext === 0) {
            headlineEl.innerText = `Period Predicted Today`;
            sublineEl.innerText = `Cycle Day ${currentCycleDay}`;
        } else {
            headlineEl.innerText = `${Math.abs(daysUntilNext)} Days Past Average`;
            sublineEl.innerText = `Predicted for ${nextDateStr} • Cycle Day ${currentCycleDay}`;
        }

        skincareEl.style.display = 'block';

        if (isPeriodActive || currentCycleDay <= currentMenstrualDays) {
            if (heroCardEl) heroCardEl.classList.add('phase-theme-menstrual');
            headlineEl.style.color = '#f87171';
            segM.classList.add('active-seg');
            if (document.getElementById('lbl-menstrual')) document.getElementById('lbl-menstrual').classList.add('active-lbl');
            markerEl.style.setProperty('--phase-color', '#ef4444');
            phasePillEl.innerText = "🩸 Menstrual Phase";
            phaseEl.innerText = "🩸 Menstrual Phase • Cozy, low-effort dates & snacks recommended";
            skincareEl.innerText = "🧴 Skin & Hair: Barrier is drier and more sensitive. Skip harsh actives and focus on rich moisturizers, hyaluronic acid, and a nourishing hair mask.";
        } else if (currentCycleDay < ovuStartDay) {
            if (heroCardEl) heroCardEl.classList.add('phase-theme-follicular');
            headlineEl.style.color = '#34d399';
            segF.classList.add('active-seg');
            if (document.getElementById('lbl-follicular')) document.getElementById('lbl-follicular').classList.add('active-lbl');
            markerEl.style.setProperty('--phase-color', '#10b981');
            phasePillEl.innerText = "🌱 Follicular Phase";
            phaseEl.innerText = "🌱 Follicular Phase • Higher energy & great for outdoor/active dates";
            skincareEl.innerText = "🧴 Skin & Hair: Estrogen is rising (natural glow!). Ideal week for Vitamin C, gentle exfoliation, and trying new products. Hair has maximum volume.";
        } else if (currentCycleDay <= ovuEndDay) {
            if (heroCardEl) heroCardEl.classList.add('phase-theme-ovulation');
            headlineEl.style.color = '#60a5fa';
            segO.classList.add('active-seg');
            if (document.getElementById('lbl-ovulation')) document.getElementById('lbl-ovulation').classList.add('active-lbl');
            markerEl.style.setProperty('--phase-color', '#3b82f6');
            phasePillEl.innerText = "✨ Ovulation Window";
            phaseEl.innerText = "✨ Ovulation Window • Peak social & romantic energy";
            skincareEl.innerText = "🧴 Skin & Hair: Peak glow, though oil production starts ticking up. Use lightweight hydration and BHA/salicylic acid to keep pores clear.";
        } else {
            if (heroCardEl) heroCardEl.classList.add('phase-theme-luteal');
            headlineEl.style.color = '#c084fc';
            segL.classList.add('active-seg');
            if (document.getElementById('lbl-luteal')) document.getElementById('lbl-luteal').classList.add('active-lbl');
            markerEl.style.setProperty('--phase-color', '#a855f7');
            phasePillEl.innerText = "🌙 Luteal Phase";
            phaseEl.innerText = "🌙 Luteal Phase • Winding down, comfort food & relaxing vibes";
            skincareEl.innerText = "🧴 Skin & Hair: Progesterone increases sebum and reactivity. Avoid heavy oils/scrubs, use niacinamide or clay masks for breakouts, and wash scalp more often.";
        }
    } else {
        headlineEl.style.color = 'var(--accent)';
        document.getElementById('stat-lmp').innerText = '-';
        document.getElementById('breast-exam-banner').style.display = 'none';
        progressWrap.style.display = 'none';
        phasePillEl.innerText = userName === 'Guest' ? "👀 Guest Preview" : "🌙 Cycle Tracker";
        headlineEl.innerText = "Welcome to Your Tracker";
        sublineEl.innerText = "Tap the button below or pick a date on the calendar to log your first period.";
        phaseEl.innerText = "Log your first period to unlock phase & self-care tips.";
        skincareEl.style.display = 'none';
    }

    renderCalendar(avgLength);
    renderCycleAnomalies(avgLength, currentCycleDay);
    renderSymptomPatterns(avgLength, currentCycleDay);
    renderCycleHistoryList();
}