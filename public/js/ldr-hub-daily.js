let hubDaily = { date: '', question: '', joaoAnswer: '', jennaAnswer: '', joaoReaction: '', jennaReaction: '', isStarred: 0 };
let hubHistory = [];
let showingDailyArchive = false;
let archiveStarredOnly = false;

// DAILY "US" PROMPT, REACTIONS & STARRED ARCHIVE
async function reactToDailyPrompt(emoji) {
    return toggleDailyPromptReaction(emoji, hubDaily.date);
}

async function reactToArchivedPrompt(emoji, date) {
    return toggleDailyPromptReaction(emoji, decodeURIComponent(date));
}

async function toggleDailyPromptReaction(emoji, date) {
    if (userName === 'Guest') return;
    triggerHaptic(10);
    const prompt = date === hubDaily.date ? hubDaily : hubHistory.find(item => item.date === date);
    if (!prompt) return;
    const myCurrent = userName === 'Jenna' ? prompt.jennaReaction : prompt.joaoReaction;
    const nextEmoji = myCurrent === emoji ? '' : emoji;
    await apiFetch('/api/hub/daily-react', { method: 'POST', body: JSON.stringify({ date, emoji: nextEmoji }) });
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
        const dateArg = `'${encodeURIComponent(item.date)}'`;
        const myReact = userName === 'Jenna' ? item.jennaReaction : item.joaoReaction;
        const joaoReaction = item.jennaReaction
            ? `<span class="daily-archive-reaction" title="Jenna reacted to João's answer">Jenna ${item.jennaReaction}</span>`
            : '';
        const jennaReaction = item.joaoReaction
            ? `<span class="daily-archive-reaction" title="João reacted to Jenna's answer">João ${item.joaoReaction}</span>`
            : '';
        const reactBar = userName === 'Guest' ? '' : `<div class="reaction-bar daily-archive-reaction-bar">
            ${['❤️', '😂', '🥹', '🔥'].map(em =>
                `<button class="react-btn ${myReact === em ? 'active' : ''}" aria-label="React ${em}" title="React ${em}" onclick="reactToArchivedPrompt('${em}', ${dateArg})">${em}</button>`
            ).join('')}
        </div>`;
        const joaoReactionControls = userName === 'Jenna' ? reactBar : '';
        const jennaReactionControls = userName === 'Joao' ? reactBar : '';
        return `
            <div class="daily-ans-card done" style="padding: 11px;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:4px;">
                    <span style="font-size:12px;font-weight:800;color:var(--accent);">“${linkify(item.question)}”</span>
                    <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                        <span style="font-size:10px;opacity:0.55;">${cleanDate}</span>
                        <button class="reset-btn" onclick="toggleArchivePromptStar('${item.date}', ${Boolean(item.isStarred)})" style="padding:1px 6px;font-size:11px;">${starIcon}</button>
                    </div>
                </div>
                <div class="daily-archive-answer"><b>João:</b> ${linkify(item.joaoAnswer)} ${joaoReaction}${joaoReactionControls}</div>
                <div class="daily-archive-answer"><b>Jenna:</b> ${linkify(item.jennaAnswer)} ${jennaReaction}${jennaReactionControls}</div>
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
