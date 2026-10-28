function renderCycleAnomalies(avgLength, currentCycleDay) {
    const box = document.getElementById('cycle-anomalies-box');
    if (cycles.length === 0) {
        box.innerHTML = `Log your cycles to monitor for length, bleed, or spotting anomalies.`;
        return;
    }

    const alerts = [];
    const latestCycleStart = cycles[0].startDate;
    const ascCycles = [...cycles].sort((a, b) => a.startDate.localeCompare(b.startDate));
    const sortedLogDates = Object.keys(cycleLogs).sort();

    const mapLoggedDates = sortedLogDates.filter(dateStr => {
        return dateStr >= latestCycleStart &&
            cycleLogs[dateStr].symptoms &&
            cycleLogs[dateStr].symptoms.includes('🚨 Morning-After Pill');
    });
    const tookEmergencyPillThisCycle = mapLoggedDates.length > 0;

    if (tookEmergencyPillThisCycle) {
        const pillDateNice = new Date(mapLoggedDates[0] + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        alerts.push({
            isInfo: true,
            title: `ℹ️ Morning-After Pill Logged (${pillDateNice})`,
            desc: `Emergency contraception delays ovulation, which commonly shifts your next period by 5 to 7+ days and can cause temporary spotting.`
        });
    }

    if (currentCycleDay) {
        const daysLate = currentCycleDay - avgLength;
        if (currentCycleDay > 35 || daysLate >= 7) {
            alerts.push({
                title: `⏰ Current Cycle Delayed (Day ${currentCycleDay})`,
                desc: tookEmergencyPillThisCycle
                    ? `Your period is ${daysLate} days past your average. This delay is an expected side effect of the Morning-After Pill logged this cycle.`
                    : `Your period is ${daysLate > 0 ? `${daysLate} days past your ${avgLength}-day average` : 'past the typical 35-day upper range'}.`
            });
        }
    }

    let validIntervals = [];
    for (let i = 0; i < Math.min(cycles.length - 1, 6); i++) {
        const d1 = new Date(cycles[i].startDate + 'T00:00:00');
        const d2 = new Date(cycles[i + 1].startDate + 'T00:00:00');
        const diffDays = Math.round((d1 - d2) / (1000 * 60 * 60 * 24));
        const labelDate = d2.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

        if (diffDays >= 10 && diffDays <= 75) {
            validIntervals.push({ diffDays, labelDate });
        }

        if (diffDays < 21 && diffDays >= 10) {
            alerts.push({
                title: `⚠️ Short Cycle Interval (${diffDays} days)`,
                desc: `The cycle starting ${labelDate} was shorter than the typical 21-day minimum.`
            });
        } else if (diffDays > 35 && diffDays <= 75) {
            alerts.push({
                title: `⚠️ Long Cycle Interval (${diffDays} days)`,
                desc: `The cycle starting ${labelDate} exceeded the typical 35-day window.`
            });
        }
    }

    for (let i = 0; i < validIntervals.length - 1; i++) {
        const swing = Math.abs(validIntervals[i].diffDays - validIntervals[i + 1].diffDays);
        if (swing >= 8) {
            alerts.push({
                title: `🔄 High Cycle-to-Cycle Swing (${swing}d difference)`,
                desc: `Recent cycles shifted from ${validIntervals[i + 1].diffDays}d to ${validIntervals[i].diffDays}d. Swings of 8+ days between consecutive months are worth noting.`
            });
            break;
        }
    }

    cycles.slice(0, 6).forEach(c => {
        if (c.startDate && c.endDate) {
            const days = Math.round((new Date(c.endDate + 'T00:00:00') - new Date(c.startDate + 'T00:00:00')) / (1000 * 60 * 60 * 24)) + 1;
            if (days > 8 && days <= 25) {
                const sDate = new Date(c.startDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                alerts.push({
                    title: `🩸 Prolonged Bleed (${days} days on ${sDate})`,
                    desc: `Periods lasting longer than 8 days are worth mentioning to your doctor.`
                });
            }
        }
    });

    let midCycleSpottingDates = [];
    let consecutiveHeavy = 0;
    let maxHeavyStreak = 0;
    let prevHeavyDate = null;
    let painDates = [];
    let severeLutealCount = 0;
    let lhPlusDates = [];

    sortedLogDates.forEach(dateStr => {
        const entry = cycleLogs[dateStr];
        if (!entry) return;

        if (entry.flow === 'heavy') {
            if (prevHeavyDate) {
                const diff = Math.round((new Date(dateStr + 'T00:00:00') - new Date(prevHeavyDate + 'T00:00:00')) / (1000 * 60 * 60 * 24));
                consecutiveHeavy = (diff === 1) ? consecutiveHeavy + 1 : 1;
            } else {
                consecutiveHeavy = 1;
            }
            prevHeavyDate = dateStr;
            if (consecutiveHeavy > maxHeavyStreak) maxHeavyStreak = consecutiveHeavy;
        }

        const symMap = parseSymptomString(entry.symptoms);

        if (symMap['😣 Pain/Discomfort']) {
            painDates.push(new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
        }
        if (symMap['🧪 LH +']) {
            lhPlusDates.push(dateStr);
        }

        let matchingCycleIdx = -1;
        for (let i = ascCycles.length - 1; i >= 0; i--) {
            if (ascCycles[i].startDate <= dateStr) {
                matchingCycleIdx = i;
                break;
            }
        }

        if (matchingCycleIdx !== -1) {
            const matchingCycle = ascCycles[matchingCycleIdx];
            const nextCycle = ascCycles[matchingCycleIdx + 1] || null;
            const cDay = Math.floor((new Date(dateStr + 'T00:00:00') - new Date(matchingCycle.startDate + 'T00:00:00')) / (1000 * 60 * 60 * 24)) + 1;

            const isSpotting = entry.flow === 'spotting' || (entry.symptoms && entry.symptoms.includes('Spotting'));
            if (isSpotting && cDay >= 9 && cDay <= avgLength - 3) {
                midCycleSpottingDates.push(`${new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} (Day ${cDay})`);
            }

            const daysBeforeNext = nextCycle
                ? Math.round((new Date(nextCycle.startDate + 'T00:00:00') - new Date(dateStr + 'T00:00:00')) / (1000 * 60 * 60 * 24))
                : (avgLength - cDay + 1);

            if (daysBeforeNext >= 1 && daysBeforeNext <= 5) {
                const hasSeverePms = Object.entries(symMap).some(([k, sev]) => sev === 3 && (k.includes('Moody') || k.includes('Migraine') || k.includes('Fatigue') || k.includes('Cramps')));
                if (hasSeverePms) severeLutealCount++;
            }
        }
    });

    lhPlusDates.forEach(lhDate => {
        for (let i = 0; i < ascCycles.length; i++) {
            if (ascCycles[i].startDate > lhDate) {
                const lutealDays = Math.round((new Date(ascCycles[i].startDate + 'T00:00:00') - new Date(lhDate + 'T00:00:00')) / (1000 * 60 * 60 * 24)) - 1;
                if (lutealDays >= 3 && lutealDays < 10) {
                    alerts.push({
                        title: `🧪 Short Luteal Window (${lutealDays} days after LH+)`,
                        desc: `Your period on ${new Date(ascCycles[i].startDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} started less than 10 days after your positive LH test.`
                    });
                }
                break;
            }
        }
    });

    if (maxHeavyStreak >= 3) {
        alerts.push({
            title: `🩸🩸 Heavy Flow Streak (${maxHeavyStreak} days in a row)`,
            desc: `You logged 3+ consecutive days of heavy flow. Consider tracking iron levels or mentioning this at your next checkup.`
        });
    }

    if (midCycleSpottingDates.length > 0) {
        alerts.push({
            title: `🩹 Mid-Cycle Spotting Logged (${midCycleSpottingDates.length}x)`,
            desc: `Logged outside your period window on: ${midCycleSpottingDates.slice(-3).join(', ')}.`
        });
    }

    if (severeLutealCount >= 2) {
        alerts.push({
            isInfo: true,
            title: `🌧️ Intense Pre-Period Symptoms (${severeLutealCount} severe days)`,
            desc: `You have logged multiple level-3 (•••) symptoms in the 5 days before your period. Magnesium glycinate or targeted luteal care can help ease this drop.`
        });
    }

    if (painDates.length >= 2) {
        alerts.push({
            title: `😣 Recurring Intimacy Discomfort (${painDates.length}x)`,
            desc: `Logged on ${painDates.slice(-3).join(', ')}. Tracking which cycle day this happens on is very helpful for your gynecologist.`
        });
    }

    if (alerts.length === 0) {
        box.innerHTML = `
            <div class="pattern-item healthy-ok" style="margin-bottom: 0;">
                <div style="font-weight: 700; color: #10b981;">✅ Everything Looks Typical</div>
                <div style="font-size: 12px; opacity: 0.85;">Cycle intervals (21-35d), cycle-to-cycle stability, bleed durations (8d or less), and flow patterns are within standard ranges.</div>
            </div>
        `;
        return;
    }

    box.innerHTML = alerts.map(a => `
        <div class="pattern-item ${a.isInfo ? 'heads-up' : 'anomaly-alert'}">
            <div style="font-weight: 700; color: ${a.isInfo ? '#fbbf24' : '#fca5a5'};">${a.title}</div>
            <div style="font-size: 12px; opacity: 0.9;">${a.desc}</div>
        </div>
    `).join('');
}