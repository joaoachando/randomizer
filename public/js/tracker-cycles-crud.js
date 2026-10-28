async function checkAutoEndPeriodOnNoFlow(dateStr) {
    const ongoing = cycles.find(c => {
        if (c.endDate) return false;
        const diffDays = Math.floor((new Date(dateStr + 'T00:00:00') - new Date(c.startDate + 'T00:00:00')) / 86400000) + 1;
        return diffDays >= 1 && diffDays <= 12;
    });

    if (!ongoing) return;

    const endDayStr = getPreviousDayStr(dateStr, ongoing.startDate);
    const niceEnd = new Date(endDayStr + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    if (await askConfirm(`Since you logged No Flow, mark your period as finished (last bleed day: ${niceEnd})?`)) {
        if (userName === 'Guest') {
            ongoing.endDate = endDayStr;
            showToast("Preview: Period marked finished ✅");
            fetchCycles();
            return;
        }
        await apiFetch(`/api/cycles/${ongoing.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ startDate: ongoing.startDate, endDate: endDayStr, notes: ongoing.notes })
        });
        showToast("Period marked as finished! ✅");
        fetchCycles();
    }
}

async function handleSmartPeriodAction() {
    triggerHaptic(15);
    const ongoing = getActiveOngoingCycle();
    const todayStr = formatDateStr(new Date());

    if (userName === 'Guest') {
        if (ongoing) {
            ongoing.endDate = todayStr;
            showToast("Preview: Period ended today ✅");
        } else {
            cycles.unshift({ id: Date.now(), startDate: todayStr, endDate: null, notes: '' });
            showToast("Preview: Period started today 🩸");
        }
        fetchCycles();
        return;
    }

    if (ongoing) {
        if (!(await askConfirm("Mark your current period as ended today?"))) return;
        await apiFetch(`/api/cycles/${ongoing.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ startDate: ongoing.startDate, endDate: todayStr, notes: ongoing.notes })
        });
        showToast("Period marked as ended today ✅");
    } else {
        if (!(await askConfirm("Log a new period starting today?"))) return;
        await apiFetch('/api/cycles', {
            method: 'POST',
            body: JSON.stringify({ startDate: todayStr, endDate: null, notes: '' })
        });
        showToast("New period logged starting today 🩸");
    }
    fetchCycles();
}

async function quickStartPeriodOnSelected() {
    if (!(await askConfirm(`Log a period starting on ${selectedLogDate}?`))) return;
    if (userName === 'Guest') {
        cycles.push({ id: Date.now(), startDate: selectedLogDate, endDate: null, notes: '' });
        cycles.sort((a, b) => b.startDate.localeCompare(a.startDate));
        showToast("Preview period logged 🩸");
        fetchCycles();
        return;
    }
    await apiFetch('/api/cycles', {
        method: 'POST',
        body: JSON.stringify({ startDate: selectedLogDate, endDate: null, notes: '' })
    });
    showToast("Period start logged 🩸");
    fetchCycles();
}

async function saveCycle() {
    const startDate = document.getElementById('c-start').value;
    const endDate = document.getElementById('c-end').value;
    const notes = document.getElementById('c-notes').value.trim();

    if (!startDate) return showToast("Please select a start date!", true);

    const prevStats = getCycleStats();

    if (userName === 'Guest') {
        if (editingCycleId) {
            const idx = cycles.findIndex(x => x.id === editingCycleId);
            if (idx >= 0) cycles[idx] = { id: editingCycleId, startDate, endDate: endDate || null, notes };
            editingCycleId = null;
        } else {
            cycles.push({ id: Date.now(), startDate, endDate: endDate || null, notes });
        }
        cycles.sort((a, b) => b.startDate.localeCompare(a.startDate));
        document.getElementById('c-end').value = '';
        document.getElementById('c-notes').value = '';
        document.getElementById('manual-cycle-drawer').classList.remove('open');
        fetchCycles();
        showRetrospectiveDiffToast(prevStats);
        return;
    }

    if (editingCycleId) {
        await apiFetch(`/api/cycles/${editingCycleId}`, {
            method: 'PATCH',
            body: JSON.stringify({ startDate, endDate, notes })
        });
        editingCycleId = null;
        document.getElementById('cycle-form-title').innerText = 'Log Past Period Range';
        document.getElementById('c-save-btn').innerText = '💾 Save Period';
    } else {
        await apiFetch('/api/cycles', {
            method: 'POST',
            body: JSON.stringify({ startDate, endDate, notes })
        });
    }

    document.getElementById('c-end').value = '';
    document.getElementById('c-notes').value = '';
    document.getElementById('manual-cycle-drawer').classList.remove('open');
    await fetchCycles();
    showRetrospectiveDiffToast(prevStats);
}

function showRetrospectiveDiffToast(prevStats) {
    const nextStats = getCycleStats();
    let parts = [];
    if (prevStats.avgLength !== nextStats.avgLength) {
        parts.push(`Avg Cycle: ${prevStats.avgLength}d ➔ ${nextStats.avgLength}d`);
    }
    if (prevStats.avgBleed !== nextStats.avgBleed && nextStats.avgBleed) {
        parts.push(`Avg Bleed: ${nextStats.avgBleed}d`);
    }
    if (cycles.length > 0) {
        const nextPred = new Date(cycles[0].startDate + 'T00:00:00');
        nextPred.setDate(nextPred.getDate() + nextStats.avgLength);
        parts.push(`Next: ${nextPred.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`);
    }
    showToast(`Recalculated 🔄 ${parts.join(' • ')}`);
}

function editCycle(id) {
    const c = cycles.find(x => x.id === id);
    if (!c) return;
    editingCycleId = id;
    switchTrackerSubTab('history');
    document.getElementById('manual-cycle-drawer').classList.add('open');
    document.getElementById('c-start').value = c.startDate;
    document.getElementById('c-end').value = c.endDate || '';
    document.getElementById('c-notes').value = c.notes || '';
    document.getElementById('cycle-form-title').innerText = '✏️ Edit Period Entry';
    document.getElementById('c-save-btn').innerText = '💾 Update Entry';
}

async function endCycleToday(id) {
    const c = cycles.find(x => x.id === id);
    if (!c) return;
    const prevStats = getCycleStats();
    const today = formatDateStr(new Date());
    if (userName === 'Guest') {
        c.endDate = today;
        fetchCycles();
        showRetrospectiveDiffToast(prevStats);
        return;
    }
    await apiFetch(`/api/cycles/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ startDate: c.startDate, endDate: today, notes: c.notes })
    });
    await fetchCycles();
    showRetrospectiveDiffToast(prevStats);
}

async function deleteCycle(id) {
    if (!(await askConfirm("Delete this period entry?"))) return;
    const prevStats = getCycleStats();
    if (userName === 'Guest') {
        cycles = cycles.filter(x => x.id !== id);
        fetchCycles();
        showRetrospectiveDiffToast(prevStats);
        return;
    }
    await apiFetch(`/api/cycles/${id}`, { method: 'DELETE' });
    await fetchCycles();
    showRetrospectiveDiffToast(prevStats);
}