let hubSettings = {
    countdownTitle: 'Next Visit',
    countdownDate: '',
    countdownTzOwner: 'jenna',
    countdownUtcMs: '',
    countdownStartMs: '',
    flightNumber: '',
    cityJoao: 'Lisbon',
    cityJenna: 'Fairfax',
    jennaLastActive: ''
};
let hubDaily = { date: '', question: '', joaoAnswer: '', jennaAnswer: '', joaoReaction: '', jennaReaction: '', isStarred: 0 };
let hubHistory = [];
let visitChecklist = [];
let activePrepFilter = 'all';
let showingDailyArchive = false;
let archiveStarredOnly = false;
let vapidPublicKey = '';
let cityWeatherCache = {};
let countdownTimerId = null;
let hubPollTimerId = null;

function isPushMuted() { return localStorage.getItem('p3_push_muted') === '1'; }
function isAutoLocEnabled() { return localStorage.getItem('p3_auto_loc') === '1'; }

function updatePushBtnUI() {
    const dot = document.getElementById('push-dot');
    const lbl = document.getElementById('push-label');
    if (!dot || !lbl) return;
    const permGranted = ('Notification' in window) && Notification.permission === 'granted';
    const active = permGranted && !isPushMuted();
    dot.className = `status-dot ${active ? 'on' : 'off'}`;
    lbl.innerText = active ? '🔔' : '🔕';
}

function localDateTimeToUtcMs(dateTimeStr, timeZone) {
    if (!dateTimeStr) return 0;
    const clean = dateTimeStr.includes('T') ? dateTimeStr : `${dateTimeStr}T00:00`;
    const [datePart, timePart] = clean.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, minute] = (timePart || '00:00').split(':').map(Number);
    const utcGuess = Date.UTC(year, month - 1, day, hour || 0, minute || 0, 0);
    if (!timeZone) return utcGuess;
    try {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        }).formatToParts(new Date(utcGuess));
        const map = {};
        parts.forEach(p => { if (p.type !== 'literal') map[p.type] = parseInt(p.value, 10); });
        const hr = map.hour === 24 ? 0 : map.hour;
        const tzAsUtc = Date.UTC(map.year, map.month - 1, map.day, hr, map.minute, map.second || 0);
        return utcGuess - (tzAsUtc - utcGuess);
    } catch (e) { return new Date(clean).getTime(); }
}

function getTargetTimezoneIANA(ownerKey) {
    const cityName = ownerKey === 'joao' ? (hubSettings.cityJoao || 'Lisbon') : (hubSettings.cityJenna || 'Fairfax');
    if (cityWeatherCache[cityName] && cityWeatherCache[cityName].timezone) return cityWeatherCache[cityName].timezone;
    return ownerKey === 'joao' ? 'Europe/Lisbon' : 'America/New_York';
}

function calcHaversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

async function initLdrHub() {
    renderWeatherTzPill(); // Render clocks immediately before network requests finish
    if (!userName) return;

    updatePushBtnUI();
    await fetchHubData();
    renderWeatherTzPill();
    updateCountdownTick();
    refreshWeatherAndClocks();

    if (isAutoLocEnabled() && (userName === 'Joao' || userName === 'Jenna')) {
        syncMyCityFromLocation(true);
    }
    if (!isPushMuted() && ('Notification' in window) && Notification.permission === 'granted') {
        subscribeWebPushIfPossible();
    }
    if (typeof checkWrappedVisibility === 'function') checkWrappedVisibility();
    if (typeof syncCountdownToTripChecker === 'function') syncCountdownToTripChecker();

    if (!countdownTimerId) countdownTimerId = setInterval(updateCountdownTick, 1000);
    if (!hubPollTimerId) hubPollTimerId = setInterval(fetchHubData, 25000);
    setInterval(refreshWeatherAndClocks, 600000);
    setInterval(renderWeatherTzPill, 15000);
}

async function fetchHubData() {
    if (!userName) return;
    try {
        const res = await apiFetch('/api/hub');
        const data = await res.json();
        if (data.settings) hubSettings = { ...hubSettings, ...data.settings };
        if (data.history) hubHistory = data.history;
        if (data.checklist) {
            visitChecklist = data.checklist;
            renderVisitChecklist();
        }
        if (data.vapidPublicKey) vapidPublicKey = data.vapidPublicKey;
        if (data.daily) {
            hubDaily = data.daily;
            renderDailyQuestionBox();
        }
        renderJennaLastActive();
        updateCountdownTick();
        if (typeof syncCountdownToTripChecker === 'function') syncCountdownToTripChecker();

        if (!isPushMuted() && data.notifications && data.notifications.length > 0) {
            data.notifications.forEach(n => {
                triggerHaptic([30, 50, 30]);
                showToast(`${n.title}: ${n.body}`);
                triggerNativePush(n.title, n.body);
            });
        }
    } catch (e) {}
}

function renderJennaLastActive() {
    const pill = document.getElementById('jenna-active-pill');
    if (!pill) return;
    if (userName !== 'Joao' || !hubSettings.jennaLastActive) {
        pill.style.display = 'none';
        return;
    }
    const diffMins = Math.max(0, Math.floor((Date.now() - Number(hubSettings.jennaLastActive)) / 60000));
    let rel = 'Online now';
    if (diffMins >= 1 && diffMins < 60) rel = `${diffMins}m ago`;
    else if (diffMins >= 60 && diffMins < 1440) rel = `${Math.floor(diffMins / 60)}h ago`;
    else if (diffMins >= 1440) rel = `${Math.floor(diffMins / 1440)}d ago`;

    pill.innerText = `● Jenna: ${rel}`;
    pill.style.display = 'inline-block';
}

function toggleHubDrawer(which) {
    triggerHaptic(8);
    ['daily', 'prep', 'settings'].forEach(k => {
        const el = document.getElementById(`hub-drawer-${k}`);
        if (!el) return;
        if (k === which) {
            const opening = el.style.display === 'none';
            el.style.display = opening ? 'block' : 'none';
            if (opening && which === 'settings') {
                document.getElementById('set-cd-title').value = hubSettings.countdownTitle || '';
                const savedDt = hubSettings.countdownDate || '';
                document.getElementById('set-cd-date').value = savedDt.includes('T') ? savedDt : (savedDt ? `${savedDt}T12:00` : '');
                document.getElementById('set-cd-tz').value = hubSettings.countdownTzOwner || 'jenna';
                document.getElementById('set-cd-flight').value = hubSettings.flightNumber || '';
                document.getElementById('set-city-joao').value = hubSettings.cityJoao || 'Lisbon';
                document.getElementById('set-city-jenna').value = hubSettings.cityJenna || 'Fairfax';
                const locToggle = document.getElementById('auto-loc-toggle');
                if (locToggle) locToggle.checked = isAutoLocEnabled();
            }
        } else {
            el.style.display = 'none';
        }
    });
}

function updateCountdownTick() {
    const textEl = document.getElementById('countdown-text');
    const tagEl = document.getElementById('countdown-label-top');
    const planeEl = document.getElementById('flight-plane-icon');
    const flightPill = document.getElementById('flight-number-pill');
    if (!textEl) return;

    const label = hubSettings.countdownTitle || 'NEXT VISIT';
    if (tagEl) tagEl.innerText = label;

    const fNum = (hubSettings.flightNumber || '').trim().toUpperCase();
    if (flightPill) {
        if (fNum) {
            flightPill.style.display = 'inline-block';
            flightPill.innerText = `✈️ ${fNum}`;
            flightPill.href = `https://www.google.com/search?q=${encodeURIComponent(fNum + ' flight status')}`;
        } else {
            flightPill.style.display = 'none';
        }
    }

    if (!hubSettings.countdownDate) {
        textEl.innerText = 'Tap to set ✈️';
        if (planeEl) planeEl.style.left = '50%';
        return;
    }

    const tzOwner = hubSettings.countdownTzOwner || 'jenna';
    const ianaTz = getTargetTimezoneIANA(tzOwner);
    const targetUtcMs = hubSettings.countdownUtcMs
        ? Number(hubSettings.countdownUtcMs)
        : localDateTimeToUtcMs(hubSettings.countdownDate, ianaTz);

    const nowMs = Date.now();
    const diffMs = targetUtcMs - nowMs;

    // Calculate Plane Progress (0% to 100%)
    if (planeEl) {
        const startMs = hubSettings.countdownStartMs ? Number(hubSettings.countdownStartMs) : (targetUtcMs - 86400000 * 90);
        const totalSpan = Math.max(3600000, targetUtcMs - startMs);
        const rawProgress = Math.max(0, Math.min(1, 1 - (diffMs / totalSpan)));
        const pct = tzOwner === 'joao' ? Math.round((1 - rawProgress) * 88 + 6) : Math.round(rawProgress * 88 + 6);
        planeEl.style.left = `${pct}%`;
        planeEl.classList.toggle('reverse', tzOwner === 'joao');
    }

    if (diffMs <= 0 && diffMs > -86400000 * 3) {
        textEl.innerText = `🎉 Together!`;
        return;
    } else if (diffMs < 0) {
        textEl.innerText = `Set next visit`;
        return;
    }

    const days = Math.floor(diffMs / 86400000);
    const hours = String(Math.floor((diffMs % 86400000) / 3600000)).padStart(2, '0');
    const mins = String(Math.floor((diffMs % 3600000) / 60000)).padStart(2, '0');
    const secs = String(Math.floor((diffMs % 60000) / 1000)).padStart(2, '0');
    textEl.innerText = days > 0 ? `${days}d ${hours}h ${mins}m ${secs}s` : `🚨 ${hours}h ${mins}m ${secs}s`;
}

async function saveHubSettings() {
    if (userName === 'Guest') return showToast("Guests cannot change settings.", true);
    const cityJoao = document.getElementById('set-city-joao').value.trim() || 'Lisbon';
    const cityJenna = document.getElementById('set-city-jenna').value.trim() || 'Fairfax';
    const countdownDate = document.getElementById('set-cd-date').value;
    const countdownTzOwner = document.getElementById('set-cd-tz').value || 'jenna';
    const flightNumber = document.getElementById('set-cd-flight').value.trim().toUpperCase();

    const dateChanged = countdownDate !== hubSettings.countdownDate;
    hubSettings.cityJoao = cityJoao;
    hubSettings.cityJenna = cityJenna;
    cityWeatherCache = {};
    await refreshWeatherAndClocks();

    const targetTz = getTargetTimezoneIANA(countdownTzOwner);
    const countdownUtcMs = countdownDate ? String(localDateTimeToUtcMs(countdownDate, targetTz)) : '';
    const countdownStartMs = (dateChanged || !hubSettings.countdownStartMs) ? String(Date.now()) : hubSettings.countdownStartMs;

    const payload = {
        countdownTitle: document.getElementById('set-cd-title').value.trim() || 'Next Visit',
        countdownDate, countdownTzOwner, countdownUtcMs, countdownStartMs,
        flightNumber, cityJoao, cityJenna
    };
    await apiFetch('/api/hub/settings', { method: 'POST', body: JSON.stringify(payload) });
    hubSettings = { ...hubSettings, ...payload };
    document.getElementById('hub-drawer-settings').style.display = 'none';
    updateCountdownTick();
    if (typeof syncCountdownToTripChecker === 'function') syncCountdownToTripChecker();
    showToast("Synced countdown & flight saved! ✈️");
}

function weatherCodeToIcon(code) {
    if (code === 0) return '☀️';
    if (code <= 3) return '⛅';
    if (code <= 48) return '🌫️';
    if (code <= 67) return '🌧️';
    if (code <= 77) return '❄️';
    return '🌦️';
}

async function fetchCityMeta(cityName) {
    if (cityWeatherCache[cityName]) return cityWeatherCache[cityName];
    try {
        const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1`);
        const geoData = await geoRes.json();
        if (!geoData.results || !geoData.results[0]) return null;
        const { latitude, longitude, timezone, name } = geoData.results[0];
        const wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`);
        const wData = await wRes.json();
        const temp = wData.current_weather ? Math.round(wData.current_weather.temperature) : null;
        const icon = wData.current_weather ? weatherCodeToIcon(wData.current_weather.weathercode) : '🌤️';
        return (cityWeatherCache[cityName] = { name, timezone, temp, icon, latitude, longitude });
    } catch (e) { return null; }
}

async function refreshWeatherAndClocks() {
    await Promise.all([fetchCityMeta(hubSettings.cityJoao || 'Lisbon'), fetchCityMeta(hubSettings.cityJenna || 'Fairfax')]);
    renderWeatherTzPill();
}

function renderWeatherTzPill() {
    const col1 = document.getElementById('city-col-joao');
    const col2 = document.getElementById('city-col-jenna');
    const distEl = document.getElementById('flight-distance-pill');
    if (!col1 || !col2) return;

    const city1 = hubSettings.cityJoao || 'Lisbon';
    const city2 = hubSettings.cityJenna || 'Fairfax';
    const m1 = cityWeatherCache[city1];
    const m2 = cityWeatherCache[city2];

    const renderCol = (el, meta, fallbackName, defaultTz) => {
        const tz = (meta && meta.timezone) ? meta.timezone : defaultTz;
        let timeStr = '--:--';
        try {
            timeStr = new Intl.DateTimeFormat([], {
                timeZone: tz,
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            }).format(new Date());
        } catch (e) {}

        const nameStr = (meta && meta.name) ? meta.name : fallbackName;
        const weatherStr = (meta && meta.temp !== null) ? `${meta.temp}°C ${meta.icon}` : '🌤️';

        el.innerHTML = `
            <span class="ldr-city-name">${nameStr}</span>
            <div class="ldr-city-time">${timeStr}</div>
            <span class="ldr-city-weather">${weatherStr}</span>
        `;
    };

    renderCol(col1, m1, city1, 'Europe/Lisbon');
    renderCol(col2, m2, city2, 'America/New_York');

    if (distEl && m1 && m2 && m1.latitude && m2.latitude) {
        const km = calcHaversineKm(m1.latitude, m1.longitude, m2.latitude, m2.longitude);
        distEl.innerText = km < 25 ? '🎉 0 km • Together!' : `🌍 ${km.toLocaleString()} km apart`;
    }
}

// VISIT PREP CHECKLIST (BRING / GET / HAVE READY)
function setPrepFilter(cat) {
    triggerHaptic(8);
    activePrepFilter = cat;
    ['all', 'bring', 'get', 'ready'].forEach(k => {
        document.getElementById(`prep-filter-${k}`)?.classList.toggle('active', k === cat);
    });
    renderVisitChecklist();
}

function renderVisitChecklist() {
    const ul = document.getElementById('prep-checklist-ul');
    const badge = document.getElementById('prep-count-badge');
    const openCount = visitChecklist.filter(i => !i.isDone).length;
    if (badge) badge.innerText = openCount;
    if (!ul) return;

    const CAT_BADGES = { bring: '🧳 Bring', get: '🛒 Get/Buy', ready: '🏠 Have Ready' };
    const filtered = activePrepFilter === 'all' ? visitChecklist : visitChecklist.filter(i => i.category === activePrepFilter);

    if (filtered.length === 0) {
        ul.innerHTML = `<li class="idea-item" style="text-align:center;opacity:0.65;font-size:12px;padding:12px;">No items in this list yet! Add things to bring, buy, or have ready above.</li>`;
        return;
    }

    ul.innerHTML = filtered.map(item => `
        <li class="idea-item" style="padding: 10px 12px; flex-direction: row; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <label style="display:flex;align-items:center;gap:9px;cursor:pointer;flex:1;${item.isDone ? 'text-decoration:line-through;opacity:0.55;' : ''}">
                <input type="checkbox" ${item.isDone ? 'checked' : ''} onchange="toggleChecklistItem(${item.id}, this.checked)" style="width:16px;height:16px;margin:0;">
                <span style="font-size:13px;font-weight:600;">${linkify(item.text)}</span>
            </label>
            <div style="display:flex;align-items:center;gap:6px;">
                <span class="badge" style="font-size:9.5px;">${CAT_BADGES[item.category] || '🧳 Bring'}</span>
                <button class="action-btn" onclick="deleteChecklistItem(${item.id})" style="padding:2px 6px;font-size:11px;">✖</button>
            </div>
        </li>
    `).join('');
}

async function addChecklistItem() {
    if (userName === 'Guest') return showToast("Guests cannot add items.", true);
    const input = document.getElementById('prep-item-input');
    const category = document.getElementById('prep-cat-select').value;
    const text = (input?.value || '').trim();
    if (!text) return;
    triggerHaptic(10);
    await apiFetch('/api/hub/checklist', { method: 'POST', body: JSON.stringify({ text, category }) });
    input.value = '';
    fetchHubData();
}

async function toggleChecklistItem(id, isDone) {
    triggerHaptic(8);
    await apiFetch(`/api/hub/checklist/${id}`, { method: 'PATCH', body: JSON.stringify({ isDone }) });
    fetchHubData();
}

async function deleteChecklistItem(id) {
    triggerHaptic(8);
    await apiFetch(`/api/hub/checklist/${id}`, { method: 'DELETE' });
    fetchHubData();
}

// DAILY "US" PROMPT, REACTIONS & STARRED ARCHIVE
async function reactToDailyPrompt(emoji) {
    if (userName === 'Guest') return;
    triggerHaptic(10);
    const myCurrent = userName === 'Jenna' ? hubDaily.jennaReaction : hubDaily.joaoReaction;
    const nextEmoji = myCurrent === emoji ? '' : emoji;
    await apiFetch('/api/hub/daily-react', { method: 'POST', body: JSON.stringify({ date: hubDaily.date, emoji: nextEmoji }) });
    fetchHubData();
}

async function toggleCurrentPromptStar() {
    if (userName === 'Guest') return;
    triggerHaptic(10);
    const nextStar = !hubDaily.isStarred;
    await apiFetch('/api/hub/daily-star', { method: 'POST', body: JSON.stringify({ date: hubDaily.date, isStarred: nextStar }) });
    hubDaily.isStarred = nextStar ? 1 : 0;
    renderDailyQuestionBox();
    showToast(nextStar ? "⭐ Saved to favorites!" : "Removed from favorites");
}

async function toggleArchivePromptStar(dateKey, currentStar) {
    if (userName === 'Guest') return;
    triggerHaptic(8);
    await apiFetch('/api/hub/daily-star', { method: 'POST', body: JSON.stringify({ date: dateKey, isStarred: !currentStar }) });
    await fetchHubData();
    renderDailyArchiveList();
}

function toggleArchiveStarFilter() {
    triggerHaptic(8);
    archiveStarredOnly = !archiveStarredOnly;
    const btn = document.getElementById('btn-archive-star-filter');
    if (btn) {
        btn.style.borderColor = archiveStarredOnly ? 'var(--accent)' : '';
        btn.style.color = archiveStarredOnly ? 'var(--accent)' : '';
    }
    renderDailyArchiveList();
}

function toggleDailyHistoryView() {
    triggerHaptic(8);
    showingDailyArchive = !showingDailyArchive;
    document.getElementById('daily-active-view').style.display = showingDailyArchive ? 'none' : 'block';
    document.getElementById('daily-archive-view').style.display = showingDailyArchive ? 'block' : 'none';
    const btn = document.getElementById('btn-daily-archive');
    if (btn) btn.innerText = showingDailyArchive ? '💬 Back to Prompt' : `📖 Archive (${hubHistory.length})`;
    if (showingDailyArchive) renderDailyArchiveList();
}

function renderDailyArchiveList() {
    const box = document.getElementById('daily-archive-list');
    if (!box) return;
    const q = (document.getElementById('archive-search-input')?.value || '').toLowerCase();
    const filtered = hubHistory.filter(item => {
        if (archiveStarredOnly && !item.isStarred) return false;
        return item.question.toLowerCase().includes(q) ||
            (item.joaoAnswer && item.joaoAnswer.toLowerCase().includes(q)) ||
            (item.jennaAnswer && item.jennaAnswer.toLowerCase().includes(q));
    });

    if (filtered.length === 0) {
        box.innerHTML = `<div style="text-align:center;opacity:0.65;font-size:12.5px;padding:14px;">No matching prompts in your archive yet.</div>`;
        return;
    }
    box.innerHTML = filtered.map(item => {
        const cleanDate = (item.date || '').split('#')[0];
        const starIcon = item.isStarred ? '⭐' : '☆';
        return `
            <div class="daily-ans-card done" style="padding: 11px;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:4px;">
                    <span style="font-size:12px;font-weight:800;color:var(--accent);">“${linkify(item.question)}”</span>
                    <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                        <span style="font-size:10px;opacity:0.55;">${cleanDate}</span>
                        <button class="reset-btn" onclick="toggleArchivePromptStar('${item.date}', ${Boolean(item.isStarred)})" style="padding:1px 6px;font-size:11px;">${starIcon}</button>
                    </div>
                </div>
                <div style="font-size:12px;margin-top:4px;"><b>João:</b> ${linkify(item.joaoAnswer)} ${item.jennaReaction || ''}</div>
                <div style="font-size:12px;margin-top:2px;"><b>Jenna:</b> ${linkify(item.jennaAnswer)} ${item.joaoReaction || ''}</div>
            </div>
        `;
    }).join('');
}

function renderDailyQuestionBox() {
    const qEl = document.getElementById('daily-q-text');
    const statusEl = document.getElementById('daily-q-Status');
    const badge = document.getElementById('daily-bar-badge');
    const archBtn = document.getElementById('btn-daily-archive');
    const starBtn = document.getElementById('btn-star-current');
    const input = document.getElementById('daily-q-input');
    const sendBtn = document.getElementById('daily-send-btn');
    if (!qEl || !statusEl) return;

    qEl.innerText = `“${hubDaily.question}”`;
    if (archBtn && !showingDailyArchive) archBtn.innerText = `📖 Archive (${hubHistory.length})`;

    const myAns = userName === 'Jenna' ? hubDaily.jennaAnswer : hubDaily.joaoAnswer;
    const partnerAns = userName === 'Jenna' ? hubDaily.joaoAnswer : hubDaily.jennaAnswer;
    const myReact = userName === 'Jenna' ? hubDaily.jennaReaction : hubDaily.joaoReaction;
    const partnerReact = userName === 'Jenna' ? hubDaily.joaoReaction : hubDaily.jennaReaction;
    const partnerName = userName === 'Jenna' ? 'João' : 'Jenna';
    const bothUnlocked = Boolean(myAns && partnerAns);

    if (starBtn) {
        starBtn.style.display = bothUnlocked ? 'inline-block' : 'none';
        starBtn.innerText = hubDaily.isStarred ? '⭐' : '☆';
    }
    if (input && sendBtn) {
        input.placeholder = myAns ? 'Update your answer...' : 'Write your answer to unlock...';
        sendBtn.innerText = myAns ? 'Update' : 'Send ✨';
    }

    if (badge) {
        if (bothUnlocked) {
            badge.className = 'ldr-status-chip unlocked';
            badge.innerText = '✨ Both Unlocked';
        } else if (!myAns && partnerAns) {
            badge.className = 'ldr-status-chip waiting';
            badge.innerText = `🔔 ${partnerName} Replied!`;
        } else if (myAns && !partnerAns) {
            badge.className = 'ldr-status-chip';
            badge.innerText = `⏳ Waiting on ${partnerName}`;
        } else {
            badge.className = 'ldr-status-chip';
            badge.innerText = 'Tap to answer';
        }
    }

    const myCard = myAns
        ? `<div class="daily-ans-card done">
            <span class="daily-ans-who">You ✓ ${partnerReact ? `<span title="${partnerName}'s reaction">${partnerReact}</span>` : ''}</span>
            <div>${linkify(myAns)}</div>
           </div>`
        : `<div class="daily-ans-card"><span class="daily-ans-who">You</span><div style="opacity:0.55;font-style:italic;">Not answered yet</div></div>`;

    let partnerCard = '';
    if (bothUnlocked) {
        const reactBar = ['❤️', '😂', '🥹', '🔥'].map(em =>
            `<button class="react-btn ${myReact === em ? 'active' : ''}" onclick="reactToDailyPrompt('${em}')">${em}</button>`
        ).join('');
        partnerCard = `<div class="daily-ans-card done">
            <span class="daily-ans-who">${partnerName} ✓</span>
            <div>${linkify(partnerAns)}</div>
            <div class="reaction-bar">${reactBar}</div>
        </div>`;
    } else if (!myAns && partnerAns) {
        partnerCard = `<div class="daily-ans-card ready-locked"><span class="daily-ans-who">${partnerName} 🔒</span><div style="color:#fbbf24;font-weight:600;">Answered! Reply below to reveal.</div></div>`;
    } else {
        partnerCard = `<div class="daily-ans-card"><span class="daily-ans-who">${partnerName}</span><div style="opacity:0.55;font-style:italic;">⏳ Waiting for reply...</div></div>`;
    }
    statusEl.innerHTML = myCard + partnerCard;
}

async function submitDailyAnswer() {
    if (userName === 'Guest') return showToast("Guests cannot answer.", true);
    const input = document.getElementById('daily-q-input');
    const answer = (input?.value || '').trim();
    if (!answer) return showToast("Type your answer first!", true);

    await apiFetch('/api/hub/daily-answer', {
        method: 'POST',
        body: JSON.stringify({ date: hubDaily.date, answer })
    });
    input.value = '';
    triggerHaptic(15);
    showToast("Answer saved! 💬");
    fetchHubData();
}

async function toggleAutoLocationSync() {
    const chk = document.getElementById('auto-loc-toggle');
    const enabled = Boolean(chk && chk.checked);
    localStorage.setItem('p3_auto_loc', enabled ? '1' : '0');
    if (enabled) await syncMyCityFromLocation(false);
    else showToast("Auto-location disabled");
}

async function syncMyCityFromLocation(silent = false) {
    if (userName !== 'Joao' && userName !== 'Jenna') return;
    if (!('geolocation' in navigator)) return;
    const btn = document.getElementById('btn-detect-loc');
    if (btn && !silent) btn.innerText = '⏳ Locating...';

    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            try {
                const { latitude, longitude } = pos.coords;
                const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`);
                const data = await res.json();
                const detectedCity = (data.city || data.locality || data.principalSubdivision || '').trim();
                if (btn && !silent) btn.innerText = '🧭 Locate Me';
                if (!detectedCity) return;

                const settingKey = userName === 'Joao' ? 'cityJoao' : 'cityJenna';
                const inputEl = document.getElementById(userName === 'Joao' ? 'set-city-joao' : 'set-city-jenna');
                if (inputEl) inputEl.value = detectedCity;

                if (hubSettings[settingKey]?.toLowerCase() !== detectedCity.toLowerCase()) {
                    hubSettings[settingKey] = detectedCity;
                    await apiFetch('/api/hub/settings', { method: 'POST', body: JSON.stringify({ [settingKey]: detectedCity }) });
                    cityWeatherCache = {};
                    await refreshWeatherAndClocks();
                    showToast(`📍 Updated ${userName}'s city to ${detectedCity}!`);
                } else if (!silent) {
                    showToast(`📍 You're in ${detectedCity}`);
                }
            } catch (e) { if (btn && !silent) btn.innerText = '🧭 Locate Me'; }
        },
        () => { if (btn && !silent) btn.innerText = '🧭 Locate Me'; },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

async function subscribeWebPushIfPossible() {
    if (!vapidPublicKey || !('serviceWorker' in navigator) || userName === 'Guest') return;
    try {
        const reg = await navigator.serviceWorker.ready;
        if (!reg.pushManager) return;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
            });
        }
        await apiFetch('/api/push-subscribe', { method: 'POST', body: JSON.stringify(sub.toJSON()) });
    } catch (e) {}
}

async function togglePushNotifications() {
    triggerHaptic(10);
    if (!('Notification' in window)) return showToast("Notifications not supported", true);
    if (Notification.permission !== 'granted') {
        const perm = await Notification.requestPermission();
        localStorage.setItem('p3_push_muted', perm === 'granted' ? '0' : '1');
        updatePushBtnUI();
        if (perm === 'granted') subscribeWebPushIfPossible();
        return showToast(perm === 'granted' ? "Notifications ON! 🔔" : "Permission denied", perm !== 'granted');
    }
    const nextMuted = !isPushMuted();
    localStorage.setItem('p3_push_muted', nextMuted ? '1' : '0');
    updatePushBtnUI();
    if (!nextMuted) subscribeWebPushIfPossible();
    showToast(nextMuted ? "Notifications muted 🔕" : "Notifications turned ON 🔔");
}

function triggerNativePush(title, body) {
    if (isPushMuted() || !('Notification' in window) || Notification.permission !== 'granted') return;
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'SHOW_NOTIFICATION', title, body });
    } else {
        new Notification(title, { body, icon: '/icon.png' });
    }
}