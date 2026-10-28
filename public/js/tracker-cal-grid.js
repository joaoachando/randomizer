let calViewDate = new Date();
let isYearHeatmapView = false;

function initCalendarSwipe() {
    const calCard = document.getElementById('cal-swipe-card');
    if (!calCard) return;

    let touchStartX = 0;
    let touchStartY = 0;

    calCard.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    calCard.addEventListener('touchend', e => {
        const deltaX = e.changedTouches[0].screenX - touchStartX;
        const deltaY = e.changedTouches[0].screenY - touchStartY;
        if (Math.abs(deltaX) > 55 && Math.abs(deltaY) < 45) {
            triggerHaptic(8);
            changeCalNav(deltaX < 0 ? 1 : -1);
        }
    }, { passive: true });
}

function jumpCalendarToToday() {
    triggerHaptic(8);
    calViewDate = new Date();
    isYearHeatmapView = false;
    document.getElementById('year-view-toggle-btn').innerText = '🗓️ Year';
    document.getElementById('single-month-cal-wrap').style.display = 'block';
    document.getElementById('year-heatmap-wrap').style.display = 'none';
    selectCalendarDate(formatDateStr(new Date()));
}

function computeCalendarSets(avgLength) {
    const loggedDates = new Set();
    const predictedDates = new Set();
    const fertileDates = new Set();
    const ovulationDates = new Set();

    cycles.forEach(c => {
        const start = new Date(c.startDate + 'T00:00:00');
        let end;
        if (c.endDate) {
            end = new Date(c.endDate + 'T00:00:00');
        } else {
            const diffFromToday = Math.floor((new Date() - start) / (1000 * 60 * 60 * 24));
            end = new Date(start);
            end.setDate(start.getDate() + Math.min(Math.max(diffFromToday, 0), 4));
        }
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dStr = formatDateStr(d);
            if (cycleLogs[dStr] && cycleLogs[dStr].flow === 'none') continue;
            loggedDates.add(dStr);
        }
    });

    if (cycles.length > 0) {
        const latestStart = new Date(cycles[0].startDate + 'T00:00:00');
        for (let cycleNum = 1; cycleNum <= 12; cycleNum++) {
            const predStart = new Date(latestStart);
            predStart.setDate(latestStart.getDate() + (avgLength * cycleNum));

            for (let i = 0; i < 5; i++) {
                const pDay = new Date(predStart);
                pDay.setDate(predStart.getDate() + i);
                const pStr = formatDateStr(pDay);
                if (!loggedDates.has(pStr)) predictedDates.add(pStr);
            }

            const ovuDay = new Date(predStart);
            ovuDay.setDate(predStart.getDate() - 14);
            ovulationDates.add(formatDateStr(ovuDay));

            for (let f = -4; f <= 1; f++) {
                const fDay = new Date(ovuDay);
                fDay.setDate(ovuDay.getDate() + f);
                fertileDates.add(formatDateStr(fDay));
            }
        }
    }

    return { loggedDates, predictedDates, fertileDates, ovulationDates };
}

function toggleYearHeatmap() {
    triggerHaptic(8);
    isYearHeatmapView = !isYearHeatmapView;
    const btn = document.getElementById('year-view-toggle-btn');
    btn.innerText = isYearHeatmapView ? '📅 Month' : '🗓️ Year';
    document.getElementById('single-month-cal-wrap').style.display = isYearHeatmapView ? 'none' : 'block';
    document.getElementById('year-heatmap-wrap').style.display = isYearHeatmapView ? 'grid' : 'none';
    renderCalendar(getCycleStats().avgLength);
}

function changeCalNav(offset) {
    triggerHaptic(6);
    if (isYearHeatmapView) {
        calViewDate.setFullYear(calViewDate.getFullYear() + offset);
    } else {
        calViewDate.setMonth(calViewDate.getMonth() + offset);
    }
    renderCalendar(getCycleStats().avgLength);
}

function jumpFromYearToDate(dateStr) {
    triggerHaptic(8);
    const parts = dateStr.split('-');
    calViewDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1);
    isYearHeatmapView = false;
    document.getElementById('year-view-toggle-btn').innerText = '🗓️ Year';
    document.getElementById('single-month-cal-wrap').style.display = 'block';
    document.getElementById('year-heatmap-wrap').style.display = 'none';
    selectCalendarDate(dateStr);
}

function renderCalendar(avgLength) {
    const year = calViewDate.getFullYear();
    const { loggedDates, predictedDates, fertileDates, ovulationDates } = computeCalendarSets(avgLength);

    if (isYearHeatmapView) {
        document.getElementById('cal-month-title').innerText = `${year} Overview`;
        const wrap = document.getElementById('year-heatmap-wrap');
        let yearHtml = '';

        for (let m = 0; m < 12; m++) {
            const monthName = new Date(year, m, 1).toLocaleDateString(undefined, { month: 'short' });
            const firstDay = new Date(year, m, 1).getDay();
            const daysInM = new Date(year, m + 1, 0).getDate();

            yearHtml += `<div class="mini-month"><div class="mini-month-title">${monthName}</div><div class="mini-cal-grid">`;
            for (let e = 0; e < firstDay; e++) {
                yearHtml += `<div></div>`;
            }
            for (let d = 1; d <= daysInM; d++) {
                const dStr = `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                let cls = 'mini-day';
                if (typeof highlightedCalendarSymptom !== 'undefined' && highlightedCalendarSymptom && cycleLogs[dStr]?.symptoms) {
                    if (parseSymptomString(cycleLogs[dStr].symptoms)[highlightedCalendarSymptom]) cls += ' sym-highlight';
                }
                if (loggedDates.has(dStr) || (cycleLogs[dStr] && ['light', 'medium', 'heavy'].includes(cycleLogs[dStr].flow))) {
                    cls += ' period-logged';
                } else if (predictedDates.has(dStr)) {
                    cls += ' period-predicted';
                } else if (ovulationDates.has(dStr)) {
                    cls += ' ovulation';
                }
                yearHtml += `<div class="${cls}" onclick="jumpFromYearToDate('${dStr}')">${d}</div>`;
            }
            yearHtml += `</div></div>`;
        }
        wrap.innerHTML = yearHtml;
        return;
    }

    const month = calViewDate.getMonth();
    document.getElementById('cal-month-title').innerText = new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = formatDateStr(new Date());

    const grid = document.getElementById('cal-days-grid');
    let html = '';

    for (let i = 0; i < firstDayOfWeek; i++) {
        html += `<div class="cal-day empty"></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        let classes = ['cal-day'];

        if (dateStr === todayStr) classes.push('today');
        if (dateStr === selectedLogDate) classes.push('selected');
        if (typeof highlightedCalendarSymptom !== 'undefined' && highlightedCalendarSymptom && cycleLogs[dateStr]?.symptoms) {
            if (parseSymptomString(cycleLogs[dateStr].symptoms)[highlightedCalendarSymptom]) classes.push('sym-highlight');
        }

        const dayLog = cycleLogs[dateStr];
        const dayFlow = dayLog && dayLog.flow ? dayLog.flow : '';

        if (dayFlow === 'heavy') classes.push('flow-heavy');
        else if (dayFlow === 'medium') classes.push('flow-medium');
        else if (dayFlow === 'light') classes.push('flow-light');
        else if (dayFlow === 'spotting') classes.push('flow-spotting');
        else if (dayFlow !== 'none' && loggedDates.has(dateStr)) classes.push('period-logged');
        else if (predictedDates.has(dateStr)) classes.push('period-predicted');
        else if (ovulationDates.has(dateStr)) classes.push('ovulation');
        else if (fertileDates.has(dateStr)) classes.push('fertile');

        let dotsHtml = '';
        if (dayLog) {
            const parsedSyms = parseSymptomString(dayLog.symptoms);
            const symKeys = Object.keys(parsedSyms);
            const hasSym = symKeys.some(k => !INTIMACY_OPTIONS.includes(k));
            const hasIntimacy = symKeys.some(k => INTIMACY_OPTIONS.includes(k));
            const hasNote = Boolean(dayLog.notes && dayLog.notes.trim());

            let dotSpans = [];
            if (hasSym) dotSpans.push(`<span class="cal-dot dot-sym"></span>`);
            if (hasIntimacy) dotSpans.push(`<span class="cal-dot dot-int"></span>`);
            if (hasNote) dotSpans.push(`<span class="cal-dot dot-note"></span>`);

            if (dotSpans.length > 0) {
                dotsHtml = `<div class="cal-dots-row">${dotSpans.join('')}</div>`;
            }
        }

        html += `<div class="${classes.join(' ')}" onclick="selectCalendarDate('${dateStr}')">${day}${dotsHtml}</div>`;
    }

    grid.innerHTML = html;
}