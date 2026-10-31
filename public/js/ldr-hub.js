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
let visitChecklist = [];
let activePrepFilter = 'all';
let vapidPublicKey = '';
let cityWeatherCache = {};
let countdownTimerId = null;
let hubPollTimerId = null;
let distanceUnit = localStorage.getItem('p3_distance_unit') === 'mi' ? 'mi' : 'km';
let myExactLocation = null;
let flightStatusIdent = '';
let flightStatusFetchedAt = 0;
let flightStatusPending = false;
let flightStatusData = null;

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
    setInterval(renderJennaLastActive, 15000);
}

async function fetchHubData() {
    if (!userName) return;
    try {
        const res = await apiFetch('/api/hub');
        const data = await res.json();
        if (data.settings) hubSettings = { ...hubSettings, ...data.settings };
        if (data.history) hubHistory = data.history;
        if (showingDailyArchive) renderDailyArchiveList();
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
        if (document.getElementById('hub-drawer-timeline')?.style.display === 'block') renderTravelTimeline();
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
    ['daily', 'prep', 'timeline', 'settings'].forEach(k => {
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
                document.getElementById('set-pickup-plan').value = hubSettings.pickupPlan || '';
                document.getElementById('set-city-joao').value = hubSettings.cityJoao || 'Lisbon';
                document.getElementById('set-city-jenna').value = hubSettings.cityJenna || 'Fairfax';
                const locToggle = document.getElementById('auto-loc-toggle');
                if (locToggle) locToggle.checked = isAutoLocEnabled();
            }
        } else {
            el.style.display = 'none';
        }
    });
    if (which === 'timeline') renderTravelTimeline();
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
    const statusEl = document.getElementById('flight-status-details');
    const targetUtcMs = hubSettings.countdownUtcMs
        ? Number(hubSettings.countdownUtcMs)
        : localDateTimeToUtcMs(hubSettings.countdownDate, getTargetTimezoneIANA(hubSettings.countdownTzOwner || 'jenna'));
    const untilArrivalMs = targetUtcMs - Date.now();
    if (fNum !== flightStatusIdent) {
        flightStatusIdent = '';
        flightStatusData = null;
        flightStatusFetchedAt = 0;
    }
    const isFlightDay = fNum && untilArrivalMs >= -86400000 && untilArrivalMs <= 86400000;
    if (flightPill) {
        if (isFlightDay) {
            flightPill.style.display = 'inline-block';
            flightPill.innerText = `✈️ ${fNum}`;
            flightPill.href = `https://www.flightaware.com/live/flight/${encodeURIComponent(fNum)}`;
            flightPill.title = `Live flight status for ${fNum}`;
        } else {
            flightPill.style.display = 'none';
        }
    }
    if (statusEl) {
        statusEl.style.display = isFlightDay ? 'block' : 'none';
        if (!isFlightDay) statusEl.innerText = '';
    }
    if (isFlightDay && (flightStatusIdent !== fNum || Date.now() - flightStatusFetchedAt >= 300000)) {
        fetchFlightStatus(fNum);
    }

    if (!hubSettings.countdownDate) {
        textEl.innerText = 'Tap to set ✈️';
        if (planeEl) planeEl.style.left = '50%';
        return;
    }

    const tzOwner = hubSettings.countdownTzOwner || 'jenna';
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

async function fetchFlightStatus(ident) {
    if (flightStatusPending) return;
    flightStatusPending = true;
    flightStatusIdent = ident;
    flightStatusFetchedAt = Date.now();
    const statusEl = document.getElementById('flight-status-details');
    try {
        const res = await apiFetch(`/api/flight-status/${encodeURIComponent(ident)}`);
        const data = await res.json();
        if (ident !== flightStatusIdent || !statusEl) return;
        if (!res.ok) {
            statusEl.innerText = res.status === 503
                ? 'Add FLIGHTAWARE_API_KEY on the server for live arrival details.'
                : 'Live arrival details are unavailable right now.';
            return;
        }
        const flight = data.flight;
        if (!flight) {
            flightStatusData = null;
            statusEl.innerText = 'No matching live flight found yet.';
            renderTravelTimeline();
            return;
        }
        flightStatusData = flight;
        const arrival = flight.actual_in || flight.estimated_in || flight.scheduled_in;
        let arrivalTime = '';
        if (arrival) {
            const arrivalDate = new Date(arrival);
            try {
                arrivalTime = flight.destination_timezone
                    ? new Intl.DateTimeFormat([], {
                        timeZone: flight.destination_timezone,
                        hour: 'numeric',
                        minute: '2-digit'
                    }).format(arrivalDate)
                    : arrivalDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            } catch (e) {
                arrivalTime = arrivalDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            }
        }
        const details = [
            flight.status,
            arrivalTime ? `Arrives ${arrivalTime}` : '',
            flight.arrival_terminal ? `Terminal ${flight.arrival_terminal}` : '',
            flight.arrival_gate ? `Gate ${flight.arrival_gate}` : ''
        ].filter(Boolean);
        statusEl.innerText = details.join(' · ') || 'Flight details are not available yet.';
        renderTravelTimeline();
    } catch (e) {
        if (ident === flightStatusIdent && statusEl) {
            statusEl.innerText = 'Live arrival details are unavailable right now.';
            renderTravelTimeline();
        }
    } finally {
        flightStatusPending = false;
    }
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
        flightNumber, pickupPlan: document.getElementById('set-pickup-plan').value.trim(),
        cityJoao, cityJenna
    };
    if (flightNumber !== hubSettings.flightNumber) {
        flightStatusIdent = '';
        flightStatusData = null;
        flightStatusFetchedAt = 0;
    }
    await apiFetch('/api/hub/settings', { method: 'POST', body: JSON.stringify(payload) });
    hubSettings = { ...hubSettings, ...payload };
    document.getElementById('hub-drawer-settings').style.display = 'none';
    updateCountdownTick();
    if (typeof syncCountdownToTripChecker === 'function') syncCountdownToTripChecker();
    renderTravelTimeline();
    showToast("Synced countdown & flight saved! ✈️");
}

function formatTimelineTime(value, timeZone) {
    if (!value) return '';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    try {
        return new Intl.DateTimeFormat([], {
            timeZone: timeZone || undefined,
            dateStyle: 'medium',
            timeStyle: 'short'
        }).format(date);
    } catch (e) {
        return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    }
}

function renderTravelTimeline() {
    const box = document.getElementById('travel-timeline-content');
    if (!box) return;

    const flightNumber = (hubSettings.flightNumber || '').trim().toUpperCase();
    const arrivalMs = hubSettings.countdownUtcMs
        ? Number(hubSettings.countdownUtcMs)
        : localDateTimeToUtcMs(hubSettings.countdownDate, getTargetTimezoneIANA(hubSettings.countdownTzOwner || 'jenna'));
    const arrivalFallback = arrivalMs
        ? formatTimelineTime(arrivalMs, getTargetTimezoneIANA(hubSettings.countdownTzOwner || 'jenna'))
        : '';
    const flight = flightStatusData;
    const depTime = formatTimelineTime(
        flight?.actual_out || flight?.estimated_out || flight?.scheduled_out,
        flight?.origin_timezone
    );
    const arrTime = formatTimelineTime(
        flight?.actual_in || flight?.estimated_in || flight?.scheduled_in,
        flight?.destination_timezone
    ) || arrivalFallback;
    const route = [flight?.origin, flight?.destination].filter(Boolean).join(' → ');
    const prepItems = visitChecklist || [];
    const hasArrival = Boolean(hubSettings.countdownDate);

    box.innerHTML = `
        <div class="travel-timeline-event">
            <div class="travel-timeline-title">🧳 Before departure · Visit prep</div>
            <div class="travel-timeline-detail">${prepItems.length
                ? `${prepItems.filter(item => item.isDone).length} of ${prepItems.length} items ready`
                : 'No visit-prep items yet.'}
                <button class="reset-btn" type="button" onclick="toggleHubDrawer('prep')" style="padding:3px 8px;margin-left:5px;">Open checklist</button>
            </div>
            ${prepItems.map(item => `
                <label class="travel-timeline-check">
                    <input type="checkbox" ${item.isDone ? 'checked' : ''} onchange="toggleChecklistItem(${Number(item.id)}, this.checked)">
                    <span style="${item.isDone ? 'text-decoration:line-through;opacity:.6;' : ''}">${linkify(item.text)} <small>(${item.category === 'get' ? 'Get/Buy' : item.category === 'ready' ? 'Have Ready' : 'Bring'})</small></span>
                </label>
            `).join('')}
        </div>
        <div class="travel-timeline-event">
            <div class="travel-timeline-title">🛫 Flight${flightNumber ? ` · ${flightNumber}` : ''}</div>
            <div class="travel-timeline-detail">${flight
                ? `${linkify(flight.status || 'Status available')}${route ? ` · ${linkify(route)}` : ''}${depTime ? `<br>Departure: ${depTime}` : ''}`
                : (flightNumber ? 'Live flight details will appear during the 24 hours before arrival.' : 'Add a flight number in countdown settings to show live status.')}</div>
        </div>
        <div class="travel-timeline-event">
            <div class="travel-timeline-title">🛬 Airport arrival${flight?.destination ? ` · ${linkify(flight.destination)}` : ''}</div>
            <div class="travel-timeline-detail">${hasArrival
                ? `${arrTime || 'Arrival time saved'}${flight?.arrival_terminal ? ` · Terminal ${linkify(flight.arrival_terminal)}` : ''}${flight?.arrival_gate ? ` · Gate ${linkify(flight.arrival_gate)}` : ''}`
                : 'Set an arrival date and time in countdown settings.'}</div>
        </div>
        <div class="travel-timeline-event">
            <div class="travel-timeline-title">🚗 Pickup</div>
            <div class="travel-timeline-detail">${hubSettings.pickupPlan
                ? linkify(hubSettings.pickupPlan)
                : `Add a pickup plan in countdown settings.${arrTime ? ` Plan around arrival at ${arrTime}.` : ''}`}</div>
        </div>
    `;
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

    if (distEl && m1 && m2 && Number.isFinite(m1.latitude) && Number.isFinite(m2.latitude)) {
        const sameCity = city1.trim().toLocaleLowerCase() === city2.trim().toLocaleLowerCase() ||
            m1.name.trim().toLocaleLowerCase() === m2.name.trim().toLocaleLowerCase();
        const isAutoLocationEnabled = isAutoLocEnabled() && Boolean(myExactLocation) &&
            (userName === 'Joao' || userName === 'Jenna');
        const point1 = isAutoLocationEnabled && userName === 'Joao'
            ? myExactLocation
            : { latitude: m1.latitude, longitude: m1.longitude };
        const point2 = isAutoLocationEnabled && userName === 'Jenna'
            ? myExactLocation
            : { latitude: m2.latitude, longitude: m2.longitude };
        const km = sameCity ? 0 : calcHaversineKm(
            point1.latitude, point1.longitude, point2.latitude, point2.longitude
        );
        distEl.title = isAutoLocationEnabled
            ? `Distance from your current GPS location to ${userName === 'Joao' ? city2 : city1} city center`
            : 'Distance between city centers; switch between kilometers and miles';
        if (km === 0) {
            distEl.innerText = '🎉 0 km • Together!';
        } else if (distanceUnit === 'mi') {
            const miles = km * 0.621371;
            distEl.innerText = `🌍 ${miles.toLocaleString(undefined, { maximumFractionDigits: 0 })} mi apart`;
        } else {
            distEl.innerText = `🌍 ${km.toLocaleString()} km apart`;
        }
    }
}

function toggleDistanceUnit(event) {
    event.stopPropagation();
    distanceUnit = distanceUnit === 'km' ? 'mi' : 'km';
    localStorage.setItem('p3_distance_unit', distanceUnit);
    renderWeatherTzPill();
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
                <input class="prep-checkbox" type="checkbox" ${item.isDone ? 'checked' : ''} onchange="toggleChecklistItem(${item.id}, this.checked)" aria-label="Mark item complete">
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
                myExactLocation = { latitude, longitude };
                renderWeatherTzPill();
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
        (error) => {
            myExactLocation = null;
            renderWeatherTzPill();
            if (btn && !silent) btn.innerText = '🧭 Locate Me';
            if (!silent) showToast(error.message || 'Could not access your current location.', true);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
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