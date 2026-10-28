let checkInFlow = '';
let checkInSymptomMap = {};

async function checkDailyCheckInPrompt() {
    if (userName !== 'Jenna') return;

    const todayStr = formatDateStr(new Date());
    if (localStorage.getItem('lastCheckInDate') === todayStr) return;

    try {
        const res = await apiFetch('/api/cycles');
        const data = await res.json();
        cycles = data.cycles || [];
        customSymptoms = data.customSymptoms || [];
        cycleLogs = {};
        (data.logs || []).forEach(l => {
            cycleLogs[l.date] = l;
        });

        if (cycleLogs[todayStr] && (cycleLogs[todayStr].flow || cycleLogs[todayStr].symptoms || cycleLogs[todayStr].notes)) {
            localStorage.setItem('lastCheckInDate', todayStr);
            return;
        }

        openDailyCheckInModal();
    } catch (e) {
        console.error("Daily check-in fetch error", e);
    }
}

function openDailyCheckInModal() {
    const todayStr = formatDateStr(new Date());
    const existing = cycleLogs[todayStr];
    checkInFlow = existing && existing.flow ? existing.flow : '';
    checkInSymptomMap = parseSymptomString(existing && existing.symptoms ? existing.symptoms : '');
    document.getElementById('checkin-notes-input').value = existing && existing.notes ? existing.notes : '';

    const badgeEl = document.getElementById('checkin-phase-badge');
    if (cycles.length > 0) {
        const start = new Date(cycles[0].startDate + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const cDay = Math.floor((today - start) / (1000 * 60 * 60 * 24)) + 1;
        if (cDay > 0 && cDay <= 60) {
            badgeEl.innerText = `Cycle Day ${cDay}`;
            badgeEl.style.display = 'inline-block';
        }
    }

    renderCheckInChips();
    document.getElementById('checkin-overlay').style.display = 'flex';
}

function renderCheckInChips() {
    const flowContainer = document.getElementById('checkin-flow-chips');
    flowContainer.innerHTML = FLOW_OPTIONS.map(f => {
        let activeClass = '';
        if (checkInFlow === f.val) {
            activeClass = (f.val === 'none') ? 'no-flow-active' : 'flow-active';
        }
        return `<label class="chip ${activeClass}"><input type="checkbox" switch class="ios-taptic" onchange="toggleCheckInFlow('${f.val}')">${f.text}</label>`;
    }).join('');

    const symContainer = document.getElementById('checkin-symptom-chips');
    symContainer.innerHTML = customSymptoms.map(item => {
        const sym = item.tag;
        const graded = Boolean(item.hasSeverity);
        const sev = checkInSymptomMap[sym] || 0;
        const dots = (sev > 0 && graded) ? ` ${'•'.repeat(sev)}` : '';
        const classes = ['chip'];
        if (sev > 0) {
            classes.push('active');
            if (graded) classes.push(`sev-${sev}`);
        }
        return `<label class="${classes.join(' ')}"><input type="checkbox" switch class="ios-taptic" onchange="cycleCheckInSymptom('${sym.replace(/'/g, "\\'")}')">${sym}${dots}</label>`;
    }).join('');
}

function toggleCheckInFlow(val) {
    triggerHaptic(10);
    checkInFlow = (checkInFlow === val) ? '' : val;
    renderCheckInChips();
}

function cycleCheckInSymptom(sym) {
    triggerHaptic(10);
    const current = checkInSymptomMap[sym] || 0;
    const graded = isSymptomGraded(sym);
    const next = graded ? ((current + 1) % 4) : (current ? 0 : 1);
    if (next === 0) delete checkInSymptomMap[sym];
    else checkInSymptomMap[sym] = next;
    renderCheckInChips();
}

function dismissDailyCheckIn() {
    const todayStr = formatDateStr(new Date());
    localStorage.setItem('lastCheckInDate', todayStr);
    document.getElementById('checkin-overlay').style.display = 'none';
}

async function saveDailyCheckInModal() {
    triggerHaptic(15);
    const todayStr = formatDateStr(new Date());
    const notes = document.getElementById('checkin-notes-input').value.trim();
    const symptoms = serializeSymptomMap(checkInSymptomMap);

    localStorage.setItem('lastCheckInDate', todayStr);
    document.getElementById('checkin-overlay').style.display = 'none';

    if (checkInFlow || symptoms || notes) {
        await apiFetch('/api/cycle-logs', {
            method: 'POST',
            body: JSON.stringify({ date: todayStr, flow: checkInFlow, symptoms, notes })
        });
        cycleLogs[todayStr] = { date: todayStr, flow: checkInFlow, symptoms, notes };
        showToast("Daily check-in saved! 🤍");

        if (checkInFlow === 'none') {
            await checkAutoEndPeriodOnNoFlow(todayStr);
        } else if (['light', 'medium', 'heavy'].includes(checkInFlow)) {
            const isNearLoggedCycle = cycles.some(c => {
                const diffDays = Math.round((new Date(todayStr + 'T00:00:00') - new Date(c.startDate + 'T00:00:00')) / 86400000);
                return diffDays >= -2 && diffDays <= 8;
            });
            if (!isNearLoggedCycle && (await askConfirm("You logged period flow today! Mark today as Day 1 of a new period?"))) {
                await apiFetch('/api/cycles', {
                    method: 'POST',
                    body: JSON.stringify({ startDate: todayStr, endDate: null, notes: '' })
                });
            }
        }
        if (typeof renderCycles === 'function') renderCycles();
    }
}