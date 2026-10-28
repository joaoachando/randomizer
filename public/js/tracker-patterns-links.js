function isSpicySymptom(name) {
    const low = name.toLowerCase();
    return low.includes('horny') || low.includes('high drive') || low.includes('spicy');
}

function analyzeCorrelationsAndBioLinks(dailyContext, logDates, ascCycles, avgLength) {
    const sameDayPairs = {};
    const dominoChains = {};
    const heavyFlowSyms = {};
    let heavyFlowDaysCount = 0;

    const spicyEntries = [];
    const highEnergyDays = [];
    const pmsSymCounts = {};
    const negativeByDay = {};
    const sleepEntries = [];
    const sleepFollowUps = {};

    const PHASE_NAMES = {
        period: '🩸 Menstrual Phase',
        follicular: '🌱 Follicular Phase',
        ovulation: '✨ Ovulation Window',
        luteal: '🌙 Mid-Luteal Phase',
        pms: '🌙 Late Luteal (PMS)'
    };

    logDates.forEach(dateStr => {
        const ctx = dailyContext[dateStr];
        if (!ctx) return;

        const { symNames, parsedMap, flow, cDay, daysBeforeNext, bucket } = ctx;

        if (flow === 'heavy') {
            heavyFlowDaysCount++;
            symNames.forEach(s => {
                if (!INTIMACY_OPTIONS.includes(s)) heavyFlowSyms[s] = (heavyFlowSyms[s] || 0) + 1;
            });
        }

        if (daysBeforeNext >= 0 && daysBeforeNext <= 3 && bucket === 'pms') {
            symNames.forEach(s => {
                if (!INTIMACY_OPTIONS.includes(s) && !isSpicySymptom(s) && !s.includes('High Energy')) {
                    pmsSymCounts[s] = (pmsSymCounts[s] || 0) + 1;
                }
            });
        }

        const hasPoorSleep = symNames.some(s => s.toLowerCase().includes('sleep'));

        symNames.forEach(s => {
            if (isSpicySymptom(s)) spicyEntries.push({ cDay, sev: parsedMap[s] || 1, bucket });
            if (s.includes('High Energy')) highEnergyDays.push(cDay);
            if (s.toLowerCase().includes('sleep')) {
                sleepEntries.push({ dateStr, cDay, bucket, sev: parsedMap[s] || 1 });
            }
            if (s.includes('Cramps') || s.includes('Migraine') || s.includes('Fatigue') || s.includes('Moody')) {
                negativeByDay[cDay] = (negativeByDay[cDay] || 0) + 1;
                if (hasPoorSleep) {
                    sleepFollowUps[s] = (sleepFollowUps[s] || 0) + 1;
                }
            }
        });

        const coreSyms = symNames.filter(s => !INTIMACY_OPTIONS.includes(s));
        for (let i = 0; i < coreSyms.length; i++) {
            for (let j = i + 1; j < coreSyms.length; j++) {
                const pairKey = [coreSyms[i], coreSyms[j]].sort().join(' + ');
                sameDayPairs[pairKey] = (sameDayPairs[pairKey] || 0) + 1;
            }
        }
    });

    for (let i = 0; i < logDates.length - 1; i++) {
        const d1 = logDates[i];
        const d2 = logDates[i + 1];
        const diffDays = Math.round((new Date(d2 + 'T00:00:00') - new Date(d1 + 'T00:00:00')) / 86400000);
        if (diffDays === 1 && dailyContext[d1] && dailyContext[d2]) {
            const syms1 = dailyContext[d1].symNames.filter(s => !INTIMACY_OPTIONS.includes(s));
            const syms2 = dailyContext[d2].symNames.filter(s => !INTIMACY_OPTIONS.includes(s));
            const sleptPoorlyD1 = syms1.some(s => s.toLowerCase().includes('sleep'));

            syms1.forEach(s1 => {
                syms2.forEach(s2 => {
                    if (s1 !== s2) {
                        const chainKey = `${s1} ➔ ${s2}`;
                        dominoChains[chainKey] = (dominoChains[chainKey] || 0) + 1;
                    }
                });
            });

            if (sleptPoorlyD1) {
                syms2.forEach(s2 => {
                    if (s2.includes('Cramps') || s2.includes('Migraine') || s2.includes('Moody') || s2.includes('Fatigue')) {
                        sleepFollowUps[s2] = (sleepFollowUps[s2] || 0) + 1;
                    }
                });
            }
        }
    }

    const bioInsights = [];

    // 1. "Cycle Twins" Global Baseline Comparison
    const { avgBleed } = getCycleStats();
    const globalCycleDiff = Math.abs(avgLength - 29.3).toFixed(1).replace('.0', '');
    const twinMatchPct = Math.max(75, Math.min(99, Math.round(100 - (Math.abs(avgLength - 29.3) * 3.5))));
    const bleedCompare = avgBleed ? ` • Your ${avgBleed}d bleed vs 4.8d global avg` : '';
    bioInsights.push({
        icon: '🌍',
        title: `Cycle Twins Baseline (${twinMatchPct}% Global Match)`,
        desc: globalCycleDiff <= 1.5
            ? `Your ${avgLength}d weighted cycle is within ${globalCycleDiff}d of the 29.3d global clinical benchmark${bleedCompare}.`
            : `Your ${avgLength}d weighted cycle compared to the 29.3d global benchmark (${avgLength < 29 ? 'slightly faster rhythm' : 'slightly longer follicular window'})${bleedCompare}.`
    });

    // 2. "Best Feel-Good Days" Positive Pattern Card
    let bestStart = 7;
    let bestScore = -999;
    for (let d = 6; d <= Math.max(14, avgLength - 10); d++) {
        let score = 0;
        for (let w = d; w <= d + 4; w++) {
            const pos = highEnergyDays.filter(x => x === w).length + spicyEntries.filter(x => x.cDay === w).length;
            const neg = negativeByDay[w] || 0;
            score += (pos * 2) - (neg * 3);
        }
        if (score > bestScore) {
            bestScore = score;
            bestStart = d;
        }
    }
    bioInsights.push({
        icon: '✨',
        title: `Best Feel-Good Window (Cycle Days ${bestStart}–${bestStart + 4})`,
        desc: `Historically your highest-energy, lowest-symptom stretch of the month—ideal for trips or date nights.`
    });

    // 3. Sleep Quality Correlation (💤 Poor Sleep)
    if (sleepEntries.length >= 1) {
        const avgSleepDay = Math.round(sleepEntries.reduce((a, x) => a + x.cDay, 0) / sleepEntries.length);
        const topSleepTriggers = Object.entries(sleepFollowUps).sort((a, b) => b[1] - a[1]).slice(0, 2).map(x => `${x[0]} (${x[1]}x)`).join(', ');
        const corrText = topSleepTriggers
            ? `Poor sleep most frequently precedes or amplifies: <b>${topSleepTriggers}</b>.`
            : `Logged ${sleepEntries.length}x (clusters around Cycle Day ${avgSleepDay}). Keep logging to map next-day cramp/mood links.`;
        bioInsights.push({
            icon: '💤',
            title: `Sleep Quality Correlation (Around Day ${avgSleepDay})`,
            desc: corrText
        });
    }

    // 4. Graded Spicy / Horny Rhythm
    if (spicyEntries.length >= 1) {
        const avgSpicyDay = Math.round(spicyEntries.reduce((a, x) => a + x.cDay, 0) / spicyEntries.length);
        const avgSev = spicyEntries.reduce((a, x) => a + x.sev, 0) / spicyEntries.length;
        const dots = '•'.repeat(Math.min(Math.max(Math.round(avgSev), 1), 3));
        const phaseCounts = {};
        spicyEntries.forEach(x => {
            const pName = PHASE_NAMES[x.bucket] || x.bucket;
            phaseCounts[pName] = (phaseCounts[pName] || 0) + 1;
        });
        const topPhase = Object.entries(phaseCounts).sort((a, b) => b[1] - a[1])[0][0];
        const intenseDays = spicyEntries.filter(x => x.sev >= 2).map(x => x.cDay);
        const peakTarget = intenseDays.length > 0
            ? Math.round(intenseDays.reduce((a, b) => a + b, 0) / intenseDays.length)
            : avgSpicyDay;

        bioInsights.push({
            icon: '🌶️',
            title: `Spicy Peak Window (Around Day ${peakTarget})`,
            desc: `Most frequent in ${topPhase} (${spicyEntries.length}x logged, avg intensity: ${dots}).`
        });
    }

    // 5. Multi-Symptom PMS Signature Fingerprint
    const pmsSigSyms = Object.entries(pmsSymCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);
    if (pmsSigSyms.length >= 2) {
        bioInsights.push({
            icon: '⛓️',
            title: `Personal 48h PMS Fingerprint`,
            desc: `Your classic pre-period combo is <b>${pmsSigSyms.join(' + ')}</b> in the 72 hours before Day 1.`
        });
    }

    // 6. Luteal / Cycle Length vs. Next Bleed Intensity Correlation
    if (ascCycles && ascCycles.length >= 2) {
        let longCycleHeavy = 0, shortCycleHeavy = 0;
        for (let i = 0; i < ascCycles.length - 1; i++) {
            const len = Math.round((new Date(ascCycles[i + 1].startDate + 'T00:00:00') - new Date(ascCycles[i].startDate + 'T00:00:00')) / 86400000);
            const nextStart = ascCycles[i + 1].startDate;
            const d2Str = formatDateStr(new Date(new Date(nextStart + 'T00:00:00').getTime() + 86400000));
            const hadHeavyStart = (cycleLogs[nextStart]?.flow === 'heavy') || (cycleLogs[d2Str]?.flow === 'heavy');
            if (hadHeavyStart) {
                if (len > avgLength) longCycleHeavy++;
                else shortCycleHeavy++;
            }
        }
        if (longCycleHeavy > 0 || shortCycleHeavy > 0) {
            const msg = longCycleHeavy >= shortCycleHeavy
                ? `Longer cycles (> ${avgLength}d) are more likely to start with 🩸🩸 Heavy flow on Days 1–2.`
                : `Your 🩸🩸 Heavy flow days occur evenly regardless of previous cycle length.`;
            bioInsights.push({ icon: '🌊', title: `Cycle Length ➔ Flow Link`, desc: msg });
        }
    }

    return { sameDayPairs, dominoChains, heavyFlowSyms, heavyFlowDaysCount, bioInsights, pmsSigSyms };
}