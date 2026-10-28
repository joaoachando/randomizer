let activeIdeaTripFilter = 'all';

function checkIdeaDuplicate(val) {
    const warnEl = document.getElementById('n-dup-warning');
    if (!warnEl) return;
    const clean = (val || '').trim().toLowerCase();
    if (clean.length < 3) {
        warnEl.style.display = 'none';
        return;
    }
    const match = ideas.find(i =>
        i.id !== editingIdeaId &&
        !i.isSecret &&
        (i.title.toLowerCase().includes(clean) || clean.includes(i.title.toLowerCase()))
    );
    if (match) {
        warnEl.style.display = 'block';
        warnEl.innerText = `⚠️ Looks similar to "${match.title}" already on your list!`;
    } else {
        warnEl.style.display = 'none';
    }
}

function toggleDateFormDrawer() {
    triggerHaptic(8);
    const drawer = document.getElementById('date-form-drawer');
    if (!drawer) return;
    const isHidden = drawer.style.display === 'none';
    drawer.style.display = isHidden ? 'block' : 'none';
    if (!isHidden) {
        editingIdeaId = null;
        const warnEl = document.getElementById('n-dup-warning');
        if (warnEl) warnEl.style.display = 'none';
        document.getElementById('date-form-title').innerText = '✨ Add New Date Idea';
        document.getElementById('add-btn').innerText = '💾 Save Idea';
    }
}

async function fetchIdeas() {
    const res = await apiFetch('/api/ideas');
    const data = await res.json();
    ideas = data.ideas || [];
    renderPinnedBanner();
    renderList();
    if (typeof renderRestaurantFormChips === 'function') renderRestaurantFormChips();
    if (typeof checkWrappedVisibility === 'function') checkWrappedVisibility();
}

function editIdea(id) {
    const idea = ideas.find(i => i.id === id);
    if (!idea) return;

    document.getElementById('n-title').value = idea.title;
    document.getElementById('n-description').value = idea.description || '';
    document.getElementById('n-trip').value = idea.tripFolder || '';
    document.getElementById('n-spicy').checked = idea.spicy;
    document.getElementById('n-secret').checked = idea.isSecret;

    CATEGORIES.forEach(cat => {
        addState[cat.key] = idea[cat.key] || cat.def;
    });
    renderAddChips();

    editingIdeaId = id;
    document.getElementById('date-form-title').innerText = '✏️ Edit Date Idea';
    document.getElementById('add-btn').innerText = '💾 Update Idea';
    document.getElementById('date-form-drawer').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function addIdea() {
    if (userName === 'Guest') return showToast("Guests cannot add ideas.", true);
    const title = document.getElementById('n-title').value.trim();
    if (!title) return showToast("Please enter an activity title!", true);

    const ideaData = {
        title,
        description: document.getElementById('n-description').value.trim(),
        tripFolder: document.getElementById('n-trip').value.trim(),
        ...addState,
        spicy: document.getElementById('n-spicy').checked,
        isSecret: document.getElementById('n-secret').checked,
        isWishlist: false
    };

    if (editingIdeaId) {
        await apiFetch(`/api/ideas/${editingIdeaId}`, { method: 'PATCH', body: JSON.stringify(ideaData) });
        editingIdeaId = null;
        document.getElementById('add-btn').innerText = '💾 Save Idea';
        showToast("Idea updated! ✨");
    } else {
        const res = await apiFetch('/api/ideas', { method: 'POST', body: JSON.stringify(ideaData) });
        if (res.status === 409) return showToast("An idea with this title already exists!", true);
        showToast("Idea added to list! 🎉");
    }

    document.getElementById('n-title').value = '';
    document.getElementById('n-description').value = '';
    document.getElementById('n-trip').value = '';
    document.getElementById('n-spicy').checked = false;
    document.getElementById('n-secret').checked = false;
    const warnEl = document.getElementById('n-dup-warning');
    if (warnEl) warnEl.style.display = 'none';
    document.getElementById('date-form-drawer').style.display = 'none';

    CATEGORIES.forEach(c => addState[c.key] = c.def);
    renderAddChips();
    fetchIdeas();
}

async function deleteIdea(id) {
    if (userName === 'Guest') return showToast("Guests cannot delete ideas.", true);
    if (!(await askConfirm("Delete this date idea permanently?"))) return;
    await apiFetch(`/api/ideas/${id}`, { method: 'DELETE' });
    showToast("Idea deleted");
    fetchIdeas();
}

function setMasterQuickFilter(f) {
    triggerHaptic(8);
    masterQuickFilter = f;
    renderList();
}

function renderMasterQuickFilters() {
    const container = document.getElementById('master-quick-filters');
    if (!container) return;

    const counts = {
        all: ideas.length,
        todo: ideas.filter(i => !i.isDone).length,
        done: ideas.filter(i => i.isDone).length,
        secret: ideas.filter(i => i.isSecret).length,
        indoor: ideas.filter(i => i.location === 'indoor').length,
        outdoor: ideas.filter(i => i.location === 'outdoor').length
    };

    const pills = [
        { key: 'all', label: `All (${counts.all})` },
        { key: 'todo', label: `Todo (${counts.todo})` },
        { key: 'done', label: `✅ Done (${counts.done})` },
        { key: 'secret', label: `👀 Secret (${counts.secret})` },
        { key: 'indoor', label: `🏠 Indoor (${counts.indoor})` },
        { key: 'outdoor', label: `🌳 Outdoor (${counts.outdoor})` }
    ];

    container.innerHTML = pills.map(p => {
        const active = masterQuickFilter === p.key ? 'active' : '';
        return `<label class="chip ${active}"><input type="checkbox" switch class="ios-taptic" onchange="setMasterQuickFilter('${p.key}')">${p.label}</label>`;
    }).join('');

    const tripWrap = document.getElementById('master-trip-filters');
    if (tripWrap) {
        const spotTrips = (typeof restaurants !== 'undefined' ? restaurants : []).map(r => r.tripFolder).filter(Boolean);
        const trips = [...new Set([...ideas.map(i => i.tripFolder).filter(Boolean), ...spotTrips])];
        tripWrap.innerHTML = trips.map(t => {
            const esc = t.replace(/'/g, "\\'");
            return `<label class="chip"><input type="checkbox" switch class="ios-taptic" onchange="openTripDashboardModal('${esc}')">✈️ ${t}</label>`;
        }).join('');
    }
}

function renderList() {
    renderMasterQuickFilters();

    const ul = document.getElementById('idea-ul');
    ul.innerHTML = '';

    const searchTerm = (document.getElementById('search-ideas')?.value || '').toLowerCase();
    const sortMethod = document.getElementById('sort-ideas')?.value || 'newest';

    // CHRONOLOGICAL SCRAPBOOK TIMELINE (INTERLEAVES COMPLETED DATES & VISITED RESTAURANTS)
    if (sortMethod === 'memories') {
        const doneDates = ideas.filter(i => i.isDone).map(i => ({
            kind: 'date', id: i.id, title: i.isSecret ? '👀 Secret Date' : i.title,
            dateStr: i.completedDate || '2026-01-01', note: i.memory || '',
            joaoR: i.joaoRating || i.rating || 5, jennaR: i.jennaRating || i.rating || 5,
            photo: i.photoData || '', sub: `🎲 Date • ${i.vibe || ''}`
        }));
        const doneSpots = (typeof restaurants !== 'undefined' ? restaurants : []).filter(r => r.isVisited).map(r => ({
            kind: 'spot', id: r.id, title: `${r.name} (${r.city})`,
            dateStr: r.visitedDate || '2026-01-01', note: r.review || '',
            joaoR: r.joaoRating || r.rating || 5, jennaR: r.jennaRating || r.rating || 5,
            photo: r.photoData || '', sub: `🍽️ ${r.cuisine || 'Spot'} • ${r.price || ''}`
        }));

        const timeline = [...doneDates, ...doneSpots]
            .filter(m => m.title.toLowerCase().includes(searchTerm) || m.note.toLowerCase().includes(searchTerm))
            .sort((a, b) => b.dateStr.localeCompare(a.dateStr));

        if (timeline.length === 0) {
            ul.innerHTML = `<li class="idea-item" style="text-align:center;opacity:0.7;">No completed memories yet! Mark a date or restaurant as ✅ Done to build your Scrapbook.</li>`;
            return;
        }

        ul.innerHTML = timeline.map(m => `
            <li class="idea-item" style="border-left: 3.5px solid var(--accent);">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span class="badge user-badge">📅 ${m.dateStr}</span>
                    <span class="badge">João: ${m.joaoR}❤️ • Jenna: ${m.jennaR}❤️</span>
                </div>
                <div style="font-weight:800;font-size:15px;margin-top:4px;">${m.title}</div>
                <div style="font-size:11.5px;opacity:0.7;">${m.sub}</div>
                ${m.note ? `<div class="memory-quote">“${linkify(m.note)}”</div>` : ''}
                ${m.photo ? `<img src="${m.photo}" class="memory-photo-img" alt="Scrapbook memory" loading="lazy">` : ''}
            </li>
        `).join('');
        return;
    }

    let filteredIdeas = ideas.filter(i => {
        if (masterQuickFilter === 'todo' && i.isDone) return false;
        if (masterQuickFilter === 'done' && !i.isDone) return false;
        if (masterQuickFilter === 'secret' && !i.isSecret) return false;
        if (masterQuickFilter === 'indoor' && i.location !== 'indoor') return false;
        if (masterQuickFilter === 'outdoor' && i.location !== 'outdoor') return false;
        if (activeIdeaTripFilter !== 'all' && i.tripFolder !== activeIdeaTripFilter) return false;

        return i.title.toLowerCase().includes(searchTerm) ||
            (i.description && i.description.toLowerCase().includes(searchTerm)) ||
            (i.tripFolder && i.tripFolder.toLowerCase().includes(searchTerm)) ||
            (i.memory && i.memory.toLowerCase().includes(searchTerm));
    });

    filteredIdeas.sort((a, b) => {
        if (sortMethod === 'az') return a.title.localeCompare(b.title);
        if (sortMethod === 'spicy') return (b.spicy === 1) - (a.spicy === 1);
        return b.id - a.id;
    });

    filteredIdeas.forEach(i => {
        const li = document.createElement('li');
        li.className = 'idea-item';

        const displayTitle = i.isSecret ? "👀 Secret Surprise" : i.title;
        const spicyBadge = i.spicy ? `<span class="badge spicy-badge">🌶️ Spicy</span>` : '';
        const authorBadge = i.addedBy ? `<span class="badge user-badge">By ${i.addedBy}</span>` : '';
        const tripBadge = i.tripFolder ? `<span class="badge" style="border-color:#60a5fa;color:#60a5fa;cursor:pointer;" onclick="openTripDashboardModal('${i.tripFolder.replace(/'/g, "\\'")}')">✈️ ${i.tripFolder}</span>` : '';

        const displayDesc = (i.description && !i.isSecret)
            ? `<div style="font-size: 13px; opacity: 0.75; margin-bottom: 4px;">${linkify(i.description)}</div>`
            : '';

        let badges = i.isSecret ? authorBadge : `${authorBadge}${tripBadge}<span class="badge">${i.location}</span><span class="badge">${i.budget}</span><span class="badge">${i.vibe}</span>${spicyBadge}`;

        const doneStyle = i.isDone ? 'text-decoration: line-through; opacity: 0.7;' : '';
        const doneIcon = `<button class="action-btn" onclick="markAsDone(${i.id})" title="Log Memory">${i.isDone ? '💝' : '✅'}</button>`;

        const splitR = (i.joaoRating && i.jennaRating) ? `João:${i.joaoRating}❤️ Jenna:${i.jennaRating}❤️` : '❤️'.repeat(i.rating || 5);
        const completedBadge = i.isDone
            ? `<span class="badge" style="background: var(--accent); color: var(--bg-base); font-weight: 700;">✅ ${splitR}</span>`
            : '';
        const pinnedBadge = (i.isPinned && !i.isDone)
            ? `<span class="badge" style="border-color: var(--accent); color: var(--accent);">📌 Up Next</span>`
            : '';

        const memoryHtml = (i.isDone && i.memory) ? `<div class="memory-quote">“${linkify(i.memory)}”</div>` : '';
        const photoHtml = (i.isDone && i.photoData) ? `<img src="${i.photoData}" class="memory-photo-img" alt="Date memory" loading="lazy">` : '';

        li.innerHTML = `
            <div class="action-bar">
                ${doneIcon}
                <button class="action-btn" onclick="editIdea(${i.id})" title="Edit">✏️</button>
                <button class="action-btn" onclick="deleteIdea(${i.id})" title="Delete">🗑️</button>
            </div>
            <div style="font-weight: 700; padding-right: 90px; ${doneStyle}">${displayTitle}</div>
            ${displayDesc}
            ${memoryHtml}
            ${photoHtml}
            <div class="badges" style="margin-top: 6px;">
                ${pinnedBadge}
                ${completedBadge}
                ${badges}
            </div>
        `;
        ul.appendChild(li);
    });
}