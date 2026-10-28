function selectCalendarDate(dateStr) {
    selectedLogDate = dateStr;
    const todayStr = formatDateStr(new Date());
    const niceDate = new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    });
    document.getElementById('selected-log-date-label').innerText = (dateStr === todayStr) ? `Today (${niceDate})` : niceDate;

    const dayStartBtn = document.getElementById('selected-day-period-btn');
    if (dayStartBtn) {
        const startedOnThisDay = cycles.some(c => c.startDate === dateStr);
        dayStartBtn.style.display = (dateStr === todayStr || startedOnThisDay) ? 'none' : 'inline-block';
    }

    const existing = cycleLogs[dateStr];
    activeDailyFlow = existing && existing.flow ? existing.flow : '';
    activeSymptomMap = parseSymptomString(existing && existing.symptoms ? existing.symptoms : '');
    document.getElementById('daily-log-notes').value = existing && existing.notes ? existing.notes : '';

    const hasData = Boolean(activeDailyFlow || Object.keys(activeSymptomMap).length > 0 || (existing && existing.notes));
    document.getElementById('clear-daily-log-btn').style.display = hasData ? 'inline-block' : 'none';

    renderDailyFlowChips();
    renderDailySymptomChips();
    renderDailyIntimacyChips();
    renderCalendar(getCycleStats().avgLength);
}

function renderDailyFlowChips() {
    const container = document.getElementById('daily-flow-chips');
    if (!container) return;

    container.innerHTML = FLOW_OPTIONS.map(f => {
        let activeClass = '';
        if (activeDailyFlow === f.val) {
            activeClass = (f.val === 'none') ? 'no-flow-active' : 'flow-active';
        }
        return `<label class="chip ${activeClass}"><input type="checkbox" switch class="ios-taptic" onchange="toggleDailyFlow('${f.val}')">${f.text}</label>`;
    }).join('');
}

async function toggleDailyFlow(val) {
    triggerHaptic(10);
    activeDailyFlow = (activeDailyFlow === val) ? '' : val;
    renderDailyFlowChips();
    await autoSaveDailyLog();

    if (activeDailyFlow === 'none') {
        await checkAutoEndPeriodOnNoFlow(selectedLogDate);
        return;
    }

    if (['light', 'medium', 'heavy'].includes(activeDailyFlow)) {
        const isNearLoggedCycle = cycles.some(c => {
            const diffDays = Math.round((new Date(selectedLogDate + 'T00:00:00') - new Date(c.startDate + 'T00:00:00')) / 86400000);
            return diffDays >= -2 && diffDays <= 8;
        });

        if (!isNearLoggedCycle) {
            const niceDate = new Date(selectedLogDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            if (await askConfirm(`You logged flow on ${niceDate}. Start a new period entry from this date?`)) {
                if (userName === 'Guest') {
                    cycles.push({ id: Date.now(), startDate: selectedLogDate, endDate: null, notes: '' });
                    cycles.sort((a, b) => b.startDate.localeCompare(a.startDate));
                    showToast("Preview period entry created 🩸");
                    fetchCycles();
                    return;
                }
                await apiFetch('/api/cycles', {
                    method: 'POST',
                    body: JSON.stringify({ startDate: selectedLogDate, endDate: null, notes: '' })
                });
                showToast("New period entry created 🩸");
                fetchCycles();
            }
        }
    }
}

function renderDailySymptomChips() {
    const container = document.getElementById('daily-symptom-chips');
    if (!container) return;

    if (customSymptoms.length === 0) {
        container.innerHTML = `<span style="font-size: 12px; opacity: 0.6;">No symptom tags yet. Open Manage Tags to add one!</span>`;
        return;
    }

    container.innerHTML = customSymptoms.map(item => {
        const sym = item.tag;
        const graded = Boolean(item.hasSeverity);
        const escapedSym = sym.replace(/'/g, "\\'");

        if (isEditingSymptomTags) {
            const modeBadge = graded ? '•' : '✓';
            return `<label class="chip delete-mode"><input type="checkbox" switch class="ios-taptic" onchange="deleteCustomSymptomTag('${escapedSym}')">${sym} (${modeBadge}) ✖</label>`;
        }

        const sev = activeSymptomMap[sym] || 0;
        const dots = (sev > 0 && graded) ? ` ${'•'.repeat(sev)}` : '';
        const classes = ['chip'];
        if (sev > 0) {
            classes.push(graded ? `sev-${sev}` : 'active');
        }
        return `<label class="${classes.join(' ')}"><input type="checkbox" switch class="ios-taptic" onchange="cycleSymptomSeverity('${escapedSym}')">${sym}${dots}</label>`;
    }).join('');
}

async function cycleSymptomSeverity(sym) {
    triggerHaptic(10);
    const current = activeSymptomMap[sym] || 0;
    const graded = isSymptomGraded(sym);
    const next = graded ? ((current + 1) % 4) : (current ? 0 : 1);

    if (next === 0) {
        delete activeSymptomMap[sym];
    } else {
        activeSymptomMap[sym] = next;
    }
    renderDailySymptomChips();
    await autoSaveDailyLog();
}

function renderDailyIntimacyChips() {
    const container = document.getElementById('daily-intimacy-chips');
    if (!container) return;

    container.innerHTML = INTIMACY_OPTIONS.map(opt => {
        const active = activeSymptomMap[opt] ? 'intimacy-active' : '';
        const escapedOpt = opt.replace(/'/g, "\\'");
        return `<label class="chip ${active}"><input type="checkbox" switch class="ios-taptic" onchange="toggleIntimacyChip('${escapedOpt}')">${opt}</label>`;
    }).join('');
}

async function toggleIntimacyChip(opt) {
    triggerHaptic(10);
    if (activeSymptomMap[opt]) {
        delete activeSymptomMap[opt];
    } else {
        activeSymptomMap[opt] = 1;
    }
    renderDailyIntimacyChips();
    await autoSaveDailyLog();
}