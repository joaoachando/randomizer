function getCycleStats() {
    let avgLength = 28;
    let diffs = [];

    if (cycles.length >= 2) {
        for (let i = 0; i < cycles.length - 1; i++) {
            const d1 = new Date(cycles[i].startDate + 'T00:00:00');
            const d2 = new Date(cycles[i + 1].startDate + 'T00:00:00');
            const diffDays = Math.round((d1 - d2) / 86400000);
            if (diffDays >= 18 && diffDays <= 45) diffs.push(diffDays);
        }
        if (diffs.length > 0) {
            // Recency-Weighted Exponential Decay (newest intervals have highest weight)
            let weightedSum = 0;
            let weightTotal = 0;
            diffs.forEach((d, idx) => {
                const w = Math.pow(0.75, idx);
                weightedSum += d * w;
                weightTotal += w;
            });
            avgLength = Math.round(weightedSum / weightTotal);
        }
    }

    let bleedLengths = [];
    cycles.forEach((c, idx) => {
        if (c.startDate && c.endDate) {
            const days = Math.round((new Date(c.endDate + 'T00:00:00') - new Date(c.startDate + 'T00:00:00')) / 86400000) + 1;
            if (days >= 1 && days <= 14) bleedLengths.push({ days, weight: Math.pow(0.8, idx) });
        }
    });

    let avgBleed = null;
    if (bleedLengths.length > 0) {
        const bSum = bleedLengths.reduce((acc, x) => acc + (x.days * x.weight), 0);
        const bWeight = bleedLengths.reduce((acc, x) => acc + x.weight, 0);
        avgBleed = (bSum / bWeight).toFixed(1).replace('.0', '');
    }

    let regularityText = 'Need 2+ cycles';
    if (diffs.length >= 1) {
        const minC = Math.min(...diffs);
        const maxC = Math.max(...diffs);
        const spread = maxC - minC;
        if (diffs.length === 1) {
            regularityText = `${diffs[0]}d logged`;
        } else if (spread <= 4) {
            regularityText = `±${Math.ceil(spread / 2)}d (Regular)`;
        } else {
            regularityText = `${minC}-${maxC}d (Varied)`;
        }
    }

    return { avgLength, avgBleed, regularityText, diffs };
}

function checkBreastExamReminder(currentCycleDay, latestCycleStart) {
    const banner = document.getElementById('breast-exam-banner');
    if (!currentCycleDay || currentCycleDay < 7 || currentCycleDay > 10 || !latestCycleStart) {
        banner.style.display = 'none';
        return;
    }

    const doneThisCycle = Object.keys(cycleLogs).some(dateStr => {
        return dateStr >= latestCycleStart &&
            cycleLogs[dateStr].symptoms &&
            cycleLogs[dateStr].symptoms.includes('🌸 Breast Self-Exam ✓');
    });

    if (doneThisCycle) {
        banner.style.display = 'none';
    } else {
        document.getElementById('exam-cycle-day').innerText = currentCycleDay;
        banner.style.display = 'block';
    }
}

async function markBreastExamDone() {
    triggerHaptic(15);
    const todayStr = formatDateStr(new Date());
    const existing = cycleLogs[todayStr] || { flow: '', symptoms: '', notes: '' };
    const map = parseSymptomString(existing.symptoms);
    map['🌸 Breast Self-Exam ✓'] = 1;

    if (userName !== 'Guest') {
        await apiFetch('/api/cycle-logs', {
            method: 'POST',
            body: JSON.stringify({
                date: todayStr,
                flow: existing.flow || '',
                symptoms: serializeSymptomMap(map),
                notes: existing.notes || ''
            })
        });
    } else {
        cycleLogs[todayStr] = {
            date: todayStr,
            flow: existing.flow || '',
            symptoms: serializeSymptomMap(map),
            notes: existing.notes || ''
        };
    }
    showToast("Monthly self-check logged! 🌸");
    fetchCycles();
}