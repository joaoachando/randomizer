function buildPhaseClusters(avgLength, currentCycleDay) {
    const logDates = Object.keys(cycleLogs).sort();
    const ascCycles = [...cycles].sort((a, b) => a.startDate.localeCompare(b.startDate));
    const trackedCycleIds = new Set();
    const cycleLhDay = {};

    logDates.forEach(dateStr => {
        const entry = cycleLogs[dateStr];
        if (!entry || !entry.symptoms || !entry.symptoms.includes('🧪 LH +')) return;
        for (let i = ascCycles.length - 1; i >= 0; i--) {
            if (ascCycles[i].startDate <= dateStr) {
                const cDay = Math.floor((new Date(dateStr + 'T00:00:00') - new Date(ascCycles[i].startDate + 'T00:00:00')) / 86400000) + 1;
                if (cDay >= 7 && cDay <= 30) cycleLhDay[ascCycles[i].id] = cDay + 1;
                break;
            }
        }
    });

    const clusters = {};
    const dailyContext = {};

    logDates.forEach(dateStr => {
        const entry = cycleLogs[dateStr];
        if (!entry) return;

        let cIdx = -1;
        for (let i = ascCycles.length - 1; i >= 0; i--) {
            if (ascCycles[i].startDate <= dateStr) {
                cIdx = i;
                break;
            }
        }
        if (cIdx === -1) return;

        const matchingCycle = ascCycles[cIdx];
        const nextCycle = ascCycles[cIdx + 1] || null;
        const cDay = Math.floor((new Date(dateStr + 'T00:00:00') - new Date(matchingCycle.startDate + 'T00:00:00')) / 86400000) + 1;
        if (cDay < 1 || cDay > 50) return;

        trackedCycleIds.add(matchingCycle.id);

        let actualLen = avgLength;
        if (nextCycle) {
            const diff = Math.round((new Date(nextCycle.startDate + 'T00:00:00') - new Date(matchingCycle.startDate + 'T00:00:00')) / 86400000);
            if (diff >= 18 && diff <= 48) actualLen = diff;
        }

        const daysBeforeNext = Math.max(0, actualLen - cDay);
        const ovuCenter = cycleLhDay[matchingCycle.id] || (actualLen - 14);

        let bucket = 'follicular';
        const isBleedFlow = ['light', 'medium', 'heavy'].includes(entry.flow);
        if (cDay <= 6 || (isBleedFlow && cDay <= 9)) {
            bucket = 'period';
        } else if (daysBeforeNext <= 6) {
            bucket = 'pms';
        } else if (Math.abs(cDay - ovuCenter) <= 2) {
            bucket = 'ovulation';
        } else if (cDay > ovuCenter + 2) {
            bucket = 'luteal';
        }

        const parsedMap = parseSymptomString(entry.symptoms);
        const symNames = Object.keys(parsedMap).filter(s => !s.includes('Breast Self-Exam'));
        dailyContext[dateStr] = { symNames, parsedMap, flow: entry.flow, cDay, daysBeforeNext, bucket };

        const coreSyms = symNames.filter(s => !INTIMACY_OPTIONS.includes(s) || s === '🔥 High Drive');
        coreSyms.forEach(sym => {
            const key = `${sym}::${bucket}`;
            if (!clusters[key]) {
                clusters[key] = {
                    sym, bucket, cDays: [], daysBeforeList: [], severities: [],
                    daySevMap: {}, cycleHistory: {}
                };
            }
            const cl = clusters[key];
            const sev = parsedMap[sym] || 1;
            cl.cDays.push(cDay);
            cl.daysBeforeList.push(daysBeforeNext);
            cl.severities.push(sev);

            if (!cl.daySevMap[cDay]) cl.daySevMap[cDay] = [];
            cl.daySevMap[cDay].push(sev);

            if (!cl.cycleHistory[matchingCycle.id]) {
                cl.cycleHistory[matchingCycle.id] = { count: 0, sumSev: 0, orderIdx: cIdx };
            }
            cl.cycleHistory[matchingCycle.id].count++;
            cl.cycleHistory[matchingCycle.id].sumSev += sev;
        });
    });

    const totalTrackedCycles = Math.max(trackedCycleIds.size, 1);
    const patterns = [];

    Object.values(clusters).forEach(cl => {
        const count = cl.cDays.length;
        const cycleEntries = Object.values(cl.cycleHistory).sort((a, b) => a.orderIdx - b.orderIdx);
        const cycleCount = cycleEntries.length;
        const confidencePct = Math.min(Math.round((cycleCount / totalTrackedCycles) * 100), 100);

        const avgDay = Math.round(cl.cDays.reduce((a, b) => a + b, 0) / count);
        const avgBefore = Math.round(cl.daysBeforeList.reduce((a, b) => a + b, 0) / count);
        const avgSev = cl.severities.reduce((a, b) => a + b, 0) / count;
        const avgEpisodeDays = (count / cycleCount).toFixed(1).replace('.0', '');

        let peakDay = avgDay;
        let maxPeakScore = -1;
        Object.entries(cl.daySevMap).forEach(([dayNum, sevArr]) => {
            const score = (sevArr.reduce((a, b) => a + b, 0) / sevArr.length) + (sevArr.length * 0.25);
            if (score > maxPeakScore) {
                maxPeakScore = score;
                peakDay = Number(dayNum);
            }
        });

        let trendBadge = '';
        if (cycleEntries.length >= 2 && isSymptomGraded(cl.sym)) {
            const latestAvg = cycleEntries[cycleEntries.length - 1].sumSev / cycleEntries[cycleEntries.length - 1].count;
            const prevSlice = cycleEntries.slice(0, -1);
            const prevAvg = prevSlice.reduce((acc, x) => acc + (x.sumSev / x.count), 0) / prevSlice.length;
            if (latestAvg - prevAvg >= 0.45) trendBadge = '⬆️ Intense lately';
            else if (prevAvg - latestAvg >= 0.45) trendBadge = '⬇️ Easing lately';
            else trendBadge = '➡️ Consistent';
        }

        let targetCycleDay = avgDay;
        let phaseTitle = '🌱 Follicular';
        let timingLabel = `Around Day ${avgDay}`;

        if (cl.bucket === 'period') {
            phaseTitle = '🩸 Period';
            timingLabel = `Period Day ${avgDay} (Peaks Day ${peakDay})`;
        } else if (cl.bucket === 'pms') {
            phaseTitle = '🌙 Pre-Period (PMS)';
            targetCycleDay = Math.max(7, avgLength - avgBefore);
            timingLabel = avgBefore === 0 ? `Period Eve / Day ${targetCycleDay}` : `~${avgBefore}d before period (Day ${targetCycleDay})`;
        } else if (cl.bucket === 'ovulation') {
            phaseTitle = '✨ Ovulation';
            timingLabel = `Ovulation Window (Day ${avgDay})`;
        } else if (cl.bucket === 'luteal') {
            phaseTitle = '🌙 Mid-Luteal';
            timingLabel = `Early Luteal (Day ${avgDay})`;
        }

        let sevLabel = '';
        if (isSymptomGraded(cl.sym)) {
            sevLabel = avgSev >= 2.4 ? 'Severe •••' : (avgSev >= 1.5 ? 'Moderate ••' : 'Mild •');
        }

        let daysAway = null;
        if (currentCycleDay) {
            daysAway = targetCycleDay - currentCycleDay;
            if (daysAway < -1 && (targetCycleDay + avgLength - currentCycleDay) <= 6) {
                daysAway = targetCycleDay + avgLength - currentCycleDay;
            }
        }

        patterns.push({
            sym: cl.sym, bucket: cl.bucket, phaseTitle, count, cycleCount,
            confidencePct, avgEpisodeDays, peakDay, targetCycleDay, timingLabel,
            sevLabel, trendBadge, daysAway,
            isUpcoming: (daysAway !== null && daysAway >= 0 && daysAway <= 3)
        });
    });

    patterns.sort((a, b) => (b.isUpcoming - a.isUpcoming) || (b.confidencePct - a.confidencePct) || (b.count - a.count));
    return { patterns, totalTrackedCycles, dailyContext, logDates };
}