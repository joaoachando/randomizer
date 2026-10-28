function renderCycleLengthChart() {
    const wrap = document.getElementById('cycle-trend-wrap');
    const chart = document.getElementById('cycle-trend-chart');
    if (!wrap || !chart) return;

    if (cycles.length < 2) {
        wrap.style.display = 'none';
        return;
    }

    const intervals = [];
    for (let i = 0; i < cycles.length - 1; i++) {
        const d1 = new Date(cycles[i].startDate + 'T00:00:00');
        const d2 = new Date(cycles[i + 1].startDate + 'T00:00:00');
        const diffDays = Math.round((d1 - d2) / (1000 * 60 * 60 * 24));
        if (diffDays >= 14 && diffDays <= 65) {
            const label = d2.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            intervals.push({ label, days: diffDays });
        }
        if (intervals.length >= 6) break;
    }

    if (intervals.length === 0) {
        wrap.style.display = 'none';
        return;
    }

    wrap.style.display = 'block';
    const maxDays = Math.max(...intervals.map(x => x.days), 35);

    chart.innerHTML = intervals.reverse().map(item => {
        const widthPct = Math.min(Math.max(Math.round((item.days / maxDays) * 100), 15), 100);
        const isAtypical = item.days < 21 || item.days > 35;
        return `
            <div class="trend-row">
                <span class="trend-label">${item.label}</span>
                <div class="trend-bar-track">
                    <div class="trend-bar-fill ${isAtypical ? 'atypical' : ''}" style="width: ${widthPct}%;"></div>
                </div>
                <span class="trend-val">${item.days}d</span>
            </div>
        `;
    }).join('');
}

function renderCycleHistoryList() {
    const ul = document.getElementById('cycle-ul');
    if (!ul) return;
    ul.innerHTML = '';

    const sortedLogDates = Object.keys(cycleLogs).sort();

    cycles.forEach((c, idx) => {
        const li = document.createElement('li');
        li.className = 'idea-item';

        const startStr = new Date(c.startDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        const endStr = c.endDate ? new Date(c.endDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Ongoing';

        const nextCycleStart = idx > 0 ? cycles[idx - 1].startDate : '9999-12-31';

        let defaultPeriodEnd = c.endDate;
        if (!defaultPeriodEnd) {
            const tempEnd = new Date(c.startDate + 'T00:00:00');
            tempEnd.setDate(tempEnd.getDate() + 5);
            defaultPeriodEnd = formatDateStr(tempEnd);
        }

        let durationBadge = '';
        if (c.endDate) {
            const days = Math.round((new Date(c.endDate + 'T00:00:00') - new Date(c.startDate + 'T00:00:00')) / (1000 * 60 * 60 * 24)) + 1;
            if (days > 0) durationBadge = `<span class="badge">${days}d bleed</span>`;
        } else {
            durationBadge = `<button class="reset-btn" onclick="endCycleToday(${c.id})" style="padding: 2px 8px; font-size: 11px; border-color: var(--accent); color: var(--accent);">✅ End Today</button>`;
        }

        let periodLogsHtml = [];
        let pmsLogsHtml = [];

        sortedLogDates.forEach(logDate => {
            if (logDate >= c.startDate && logDate < nextCycleStart) {
                const l = cycleLogs[logDate];
                if (!l || (!l.symptoms && !l.flow && !l.notes)) return;

                const cDay = Math.floor((new Date(logDate + 'T00:00:00') - new Date(c.startDate + 'T00:00:00')) / (1000 * 60 * 60 * 24)) + 1;
                const dLabel = new Date(logDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

                let badgesArr = [];
                if (l.flow) {
                    const flowLabel = l.flow === 'none' ? '✨ No Flow' : `Flow: ${l.flow}`;
                    const flowStyle = l.flow === 'none'
                        ? 'background: rgba(16,185,129,0.18); color: #34d399; border-color: rgba(16,185,129,0.4);'
                        : 'background: rgba(239,68,68,0.2); color: #fca5a5; border-color: rgba(239,68,68,0.4);';
                    badgesArr.push(`<span class="badge" style="${flowStyle}">${flowLabel}</span>`);
                }
                if (l.symptoms) {
                    const parsed = parseSymptomString(l.symptoms);
                    Object.entries(parsed).forEach(([name, sev]) => {
                        const isIntimacy = INTIMACY_OPTIONS.includes(name);
                        const dots = (isSymptomGraded(name) && sev > 0) ? ` ${'•'.repeat(sev)}` : '';
                        const style = isIntimacy ? 'background: rgba(236,72,153,0.18); color: #f472b6; border-color: rgba(236,72,153,0.4);' : '';
                        badgesArr.push(`<span class="badge" style="${style}">${name}${dots}</span>`);
                    });
                }
                if (l.notes) {
                    badgesArr.push(`<span class="badge" style="font-style: italic; opacity: 0.8;">"${l.notes}"</span>`);
                }

                const line = `
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 5px; padding: 6px 8px; background: var(--bg-base); border-radius: 8px; border: 1px solid var(--border);">
                        <span style="font-size: 11px; font-weight: 700; white-space: nowrap; opacity: 0.7;">${dLabel} (Day ${cDay})</span>
                        <div style="display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end;">${badgesArr.join('')}</div>
                    </div>
                `;

                if (logDate <= defaultPeriodEnd) {
                    periodLogsHtml.push(line);
                } else {
                    pmsLogsHtml.push(line);
                }
            }
        });

        const generalNotesHtml = c.notes ? `<div style="font-size: 13px; opacity: 0.85; margin-bottom: 2px;">${c.notes}</div>` : '';

        const totalLoggedDays = periodLogsHtml.length + pmsLogsHtml.length;
        let compiledLogsSection = '';
        if (totalLoggedDays > 0) {
            let innerHtml = '';
            if (periodLogsHtml.length > 0) {
                innerHtml += `<div style="margin-top: 6px;"><span class="filter-label" style="margin-bottom:2px;">🩸 Period Days (${periodLogsHtml.length})</span>${periodLogsHtml.join('')}</div>`;
            }
            if (pmsLogsHtml.length > 0) {
                innerHtml += `<div style="margin-top: 8px;"><span class="filter-label" style="margin-bottom:2px;">🌙 Mid-Cycle & PMS Logs (${pmsLogsHtml.length})</span>${pmsLogsHtml.join('')}</div>`;
            }
            compiledLogsSection = `
                <details class="history-logs-drawer">
                    <summary>▼ View ${totalLoggedDays} Logged ${totalLoggedDays === 1 ? 'Day' : 'Days'}</summary>
                    ${innerHtml}
                </details>
            `;
        }

        li.innerHTML = `
            <div class="action-bar">
                <button class="action-btn" onclick="editCycle(${c.id})" title="Edit">✏️</button>
                <button class="action-btn" onclick="deleteCycle(${c.id})" title="Delete">🗑️</button>
            </div>
            <div style="font-weight: 600; padding-right: 70px;">🩸 ${startStr} → ${endStr}</div>
            ${generalNotesHtml}
            ${compiledLogsSection}
            <div class="badges" style="margin-top: 6px;">${durationBadge}</div>
        `;
        ul.appendChild(li);
    });
}