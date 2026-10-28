function toggleNewTagSeverityMode() {
    triggerHaptic(8);
    newTagHasSeverity = !newTagHasSeverity;
    const btn = document.getElementById('new-tag-type-btn');
    btn.innerText = newTagHasSeverity ? '📈 1-3 Dots' : '☑️ On/Off';
}

function toggleEditSymptomTags() {
    triggerHaptic(8);
    isEditingSymptomTags = !isEditingSymptomTags;
    const btn = document.getElementById('edit-tags-btn');
    btn.innerText = isEditingSymptomTags ? '✅ Done Editing' : '✏️ Edit Tags';
    btn.style.borderColor = isEditingSymptomTags ? '#ef4444' : 'var(--border)';
    btn.style.color = isEditingSymptomTags ? '#ef4444' : 'var(--text-main)';
    renderDailySymptomChips();
}

async function addCustomSymptomTag() {
    const input = document.getElementById('custom-sym-input');
    const tag = input.value.trim();
    if (!tag) return showToast("Enter a tag name first!", true);

    triggerHaptic(12);
    if (userName !== 'Guest') {
        await apiFetch('/api/custom-symptoms', {
            method: 'POST',
            body: JSON.stringify({ tag, hasSeverity: newTagHasSeverity ? 1 : 0 })
        });
    }
    input.value = '';
    const existingIdx = customSymptoms.findIndex(s => s.tag === tag);
    if (existingIdx >= 0) {
        customSymptoms[existingIdx].hasSeverity = newTagHasSeverity ? 1 : 0;
    } else {
        customSymptoms.push({ tag, hasSeverity: newTagHasSeverity ? 1 : 0 });
    }
    activeSymptomMap[tag] = 1;
    renderDailySymptomChips();
    await autoSaveDailyLog();
    showToast(`Added "${tag}"`);
}

async function deleteCustomSymptomTag(tag) {
    if (!(await askConfirm(`Remove "${tag}" from your symptom buttons?`))) return;
    if (userName !== 'Guest') {
        await apiFetch(`/api/custom-symptoms/${encodeURIComponent(tag)}`, {
            method: 'DELETE'
        });
    }
    customSymptoms = customSymptoms.filter(t => t.tag !== tag);
    renderDailySymptomChips();
    showToast(`Removed "${tag}"`);
}

function debouncedNoteSave() {
    const statusEl = document.getElementById('daily-save-status');
    statusEl.innerText = userName === 'Guest' ? 'Preview...' : 'Saving...';
    clearTimeout(noteSaveTimeout);
    noteSaveTimeout = setTimeout(() => {
        autoSaveDailyLog();
    }, 500);
}

async function autoSaveDailyLog() {
    const statusEl = document.getElementById('daily-save-status');
    const notes = document.getElementById('daily-log-notes').value.trim();
    const symptoms = serializeSymptomMap(activeSymptomMap);

    if (userName !== 'Guest') {
        statusEl.innerText = 'Saving...';
        await apiFetch('/api/cycle-logs', {
            method: 'POST',
            body: JSON.stringify({ date: selectedLogDate, flow: activeDailyFlow, symptoms, notes })
        });
    }

    if (!activeDailyFlow && !symptoms && !notes) {
        delete cycleLogs[selectedLogDate];
    } else {
        cycleLogs[selectedLogDate] = { date: selectedLogDate, flow: activeDailyFlow, symptoms, notes };
    }

    document.getElementById('clear-daily-log-btn').style.display = cycleLogs[selectedLogDate] ? 'inline-block' : 'none';
    statusEl.innerText = userName === 'Guest' ? 'Preview ✓' : 'Saved ✓';

    renderCycles();
}

async function clearDailyLog() {
    if (!(await askConfirm("Clear all logs for this day?"))) return;
    if (userName === 'Guest') {
        delete cycleLogs[selectedLogDate];
        showToast("Preview day cleared");
        fetchCycles();
        return;
    }
    await apiFetch(`/api/cycle-logs/${selectedLogDate}`, { method: 'DELETE' });
    showToast("Day cleared");
    fetchCycles();
}