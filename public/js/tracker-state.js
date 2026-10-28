let cycles = [];
let cycleLogs = {}; // keyed by YYYY-MM-DD
let customSymptoms = [];
let editingCycleId = null;
let isEditingSymptomTags = false;
let newTagHasSeverity = true;
let guestSandboxInitialized = false;

let selectedLogDate = formatDateStr(new Date());
let activeDailyFlow = '';
let activeSymptomMap = {};
let noteSaveTimeout = null;

const GUEST_DEFAULT_SYMPTOMS = [
    { tag: '⚡ Cramps', hasSeverity: 1 },
    { tag: '🤕 Migraine', hasSeverity: 1 },
    { tag: '🍫 Cravings', hasSeverity: 1 },
    { tag: '😴 Fatigue', hasSeverity: 1 },
    { tag: '🥺 Moody', hasSeverity: 1 },
    { tag: '🎈 Bloating', hasSeverity: 1 },
    { tag: '😣 Tender Breasts', hasSeverity: 1 },
    { tag: '💤 Poor Sleep', hasSeverity: 1 },
    { tag: '✨ High Energy', hasSeverity: 0 },
    { tag: '🌶️ Horny', hasSeverity: 1 }
];

const FLOW_OPTIONS = [
    { val: 'none', text: '✨ None' },
    { val: 'spotting', text: '🩹 Spot' },
    { val: 'light', text: '💧 Light' },
    { val: 'medium', text: '🩸 Med' },
    { val: 'heavy', text: '🩸🩸 Heavy' }
];

const INTIMACY_OPTIONS = [
    '🧤 Protected',
    '🥀 Pull Out',
    '❤️‍🔥 Raw',
    '💋 Outercourse',
    '🔥 High Drive',
    '😴 Low Drive',
    '😣 Pain/Discomfort',
    '⚓ IUD',
    '🚨 Morning-After Pill',
    '🧪 LH +',
    '🧪 LH -'
];

function formatDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function getPreviousDayStr(dateStr, minDateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    const prevStr = formatDateStr(d);
    return (minDateStr && prevStr < minDateStr) ? minDateStr : prevStr;
}

function isSymptomGraded(tagName) {
    if (INTIMACY_OPTIONS.includes(tagName) || tagName.includes('Breast Self-Exam')) return false;
    const found = customSymptoms.find(s => s.tag === tagName);
    return found ? Boolean(found.hasSeverity) : true;
}

function parseSymptomString(str) {
    const map = {};
    if (!str) return map;
    str.split(', ').filter(Boolean).forEach(part => {
        const lastColon = part.lastIndexOf(':');
        if (lastColon !== -1 && ['1', '2', '3'].includes(part.slice(lastColon + 1))) {
            const name = part.slice(0, lastColon);
            const sev = parseInt(part.slice(lastColon + 1), 10);
            map[name] = sev;
        } else {
            map[part] = 1;
        }
    });
    return map;
}

function serializeSymptomMap(map) {
    return Object.entries(map)
        .filter(([, sev]) => sev > 0)
        .map(([name, sev]) => {
            if (!isSymptomGraded(name)) return name;
            return `${name}:${sev}`;
        })
        .join(', ');
}

function formatSymptomDisplay(rawStr) {
    if (!rawStr) return '';
    const map = parseSymptomString(rawStr);
    return Object.entries(map).map(([name, sev]) => {
        if (!isSymptomGraded(name)) return name;
        const dots = '•'.repeat(sev);
        return `${name} ${dots}`;
    }).join(', ');
}

function openSecretTracker() {
    if (!userName) return;

    const mainTabs = document.getElementById('main-tabs');
    if (mainTabs) mainTabs.style.display = 'none';

    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-tracker').classList.add('active');

    const todayStr = formatDateStr(new Date());
    if (!editingCycleId) {
        document.getElementById('c-start').value = todayStr;
    }
    selectedLogDate = todayStr;
    fetchCycles();
}

function switchTrackerSubTab(subId) {
    triggerHaptic(8);
    document.querySelectorAll('.tracker-subview').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.sub-tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(`tracker-view-${subId}`).classList.add('active');
    document.getElementById(`sub-btn-${subId}`).classList.add('active');
}

function toggleManualCycleDrawer() {
    document.getElementById('manual-cycle-drawer').classList.toggle('open');
}

async function fetchCycles() {
    if (userName === 'Guest') {
        if (!guestSandboxInitialized) {
            cycles = [];
            cycleLogs = {};
            customSymptoms = GUEST_DEFAULT_SYMPTOMS.map(s => ({ ...s }));
            guestSandboxInitialized = true;
        }
        document.getElementById('daily-save-status').innerText = 'Preview Mode';
        renderCycles();
        selectCalendarDate(selectedLogDate);
        return;
    }

    const res = await apiFetch('/api/cycles');
    const data = await res.json();
    cycles = data.cycles || [];
    customSymptoms = data.customSymptoms || [];
    cycleLogs = {};
    (data.logs || []).forEach(l => {
        cycleLogs[l.date] = l;
    });
    renderCycles();
    selectCalendarDate(selectedLogDate);
}

function getActiveOngoingCycle() {
    if (cycles.length === 0) return null;
    const latest = cycles[0];
    if (latest.endDate) return null;
    const start = new Date(latest.startDate + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((today - start) / 86400000) + 1;
    return (diffDays >= 1 && diffDays <= 10) ? latest : null;
}

function switchInsightTool(which) {
    triggerHaptic(8);
    ['care', 'trip', 'breath', 'health'].forEach(k => {
        const box = document.getElementById(`itool-${k}`);
        const btn = document.getElementById(`itool-btn-${k}`);
        if (box) box.style.display = k === which ? 'block' : 'none';
        if (btn) btn.classList.toggle('active', k === which);
        if (which === 'trip' && typeof syncCountdownToTripChecker === 'function') syncCountdownToTripChecker();
    });
}