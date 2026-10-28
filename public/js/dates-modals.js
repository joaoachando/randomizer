let selectedJoaoRating = 5;
let selectedJennaRating = 5;
let pendingMemoryPhoto = '';

function openSplitMemoryModal(heading, title, joaoR, jennaR, noteText, photoData) {
    selectedJoaoRating = joaoR || 5;
    selectedJennaRating = jennaR || 5;
    selectedHeartRating = Math.round((selectedJoaoRating + selectedJennaRating) / 2);
    pendingMemoryPhoto = photoData || '';

    document.getElementById('memory-modal-heading').innerText = heading;
    document.getElementById('memory-date-title').innerText = title;
    document.getElementById('memory-note-input').value = noteText || '';

    const prevImg = document.getElementById('memory-photo-preview');
    const clearBtn = document.getElementById('memory-photo-clear');
    const fileInput = document.getElementById('memory-photo-input');
    if (fileInput) fileInput.value = '';
    if (prevImg && clearBtn) {
        if (pendingMemoryPhoto) {
            prevImg.src = pendingMemoryPhoto;
            prevImg.style.display = 'block';
            clearBtn.style.display = 'inline-block';
        } else {
            prevImg.style.display = 'none';
            clearBtn.style.display = 'none';
        }
    }

    renderHeartSelector();
    document.getElementById('memory-overlay').style.display = 'flex';
}

function markAsDone(id) {
    if (userName === 'Guest') return showToast("Guests cannot modify ideas.", true);
    const idea = ideas.find(i => i.id === id);
    if (!idea) return;

    completingIdeaId = id;
    if (typeof completingRestaurantId !== 'undefined') completingRestaurantId = null;

    openSplitMemoryModal(
        '📸 Date Completed!',
        idea.title,
        idea.joaoRating || idea.rating || 5,
        idea.jennaRating || idea.rating || 5,
        idea.memory || '',
        idea.photoData || ''
    );
}

function renderHeartSelector() {
    const jRow = document.getElementById('heart-row-joao');
    const jeRow = document.getElementById('heart-row-jenna');
    if (jRow && jeRow) {
        jRow.innerHTML = [1, 2, 3, 4, 5].map(n =>
            `<span onclick="setPartnerHeart('joao', ${n})">${n <= selectedJoaoRating ? '❤️' : '🤍'}</span>`
        ).join('');
        jeRow.innerHTML = [1, 2, 3, 4, 5].map(n =>
            `<span onclick="setPartnerHeart('jenna', ${n})">${n <= selectedJennaRating ? '❤️' : '🤍'}</span>`
        ).join('');
    }
}

function setPartnerHeart(who, n) {
    triggerHaptic(8);
    if (who === 'joao') selectedJoaoRating = n;
    else selectedJennaRating = n;
    selectedHeartRating = Math.round((selectedJoaoRating + selectedJennaRating) / 2);
    renderHeartSelector();
}

function handleMemoryPhotoSelect(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_DIM = 720;
            let w = img.width, h = img.height;
            if (w > h && w > MAX_DIM) { h = Math.round((h * MAX_DIM) / w); w = MAX_DIM; }
            else if (h > MAX_DIM) { w = Math.round((w * MAX_DIM) / h); h = MAX_DIM; }

            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);

            let dataUrl = canvas.toDataURL('image/webp', 0.72);
            if (!dataUrl.startsWith('data:image/webp')) {
                dataUrl = canvas.toDataURL('image/jpeg', 0.72);
            }
            pendingMemoryPhoto = dataUrl;
            const prevImg = document.getElementById('memory-photo-preview');
            const clearBtn = document.getElementById('memory-photo-clear');
            if (prevImg) { prevImg.src = pendingMemoryPhoto; prevImg.style.display = 'block'; }
            if (clearBtn) clearBtn.style.display = 'inline-block';
            triggerHaptic(10);
            showToast("📷 Photo compressed & ready!");
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function clearMemoryPhoto() {
    pendingMemoryPhoto = '';
    const prevImg = document.getElementById('memory-photo-preview');
    const clearBtn = document.getElementById('memory-photo-clear');
    const fileInput = document.getElementById('memory-photo-input');
    if (prevImg) prevImg.style.display = 'none';
    if (clearBtn) clearBtn.style.display = 'none';
    if (fileInput) fileInput.value = '';
}

async function saveDateMemory() {
    const note = document.getElementById('memory-note-input').value.trim();
    const todayStr = new Date().toISOString().split('T')[0];

    if (typeof completingRestaurantId !== 'undefined' && completingRestaurantId) {
        await apiFetch(`/api/restaurants/${completingRestaurantId}/visited`, {
            method: 'PATCH',
            body: JSON.stringify({
                rating: selectedHeartRating,
                joaoRating: selectedJoaoRating,
                jennaRating: selectedJennaRating,
                review: note,
                visitedDate: todayStr,
                photoData: pendingMemoryPhoto
            })
        });
        completingRestaurantId = null;
        document.getElementById('memory-overlay').style.display = 'none';
        triggerConfetti();
        showToast("Restaurant visit saved! 🍽️");
        fetchRestaurants();
        return;
    }

    if (!completingIdeaId) return;
    await apiFetch(`/api/ideas/${completingIdeaId}/done`, {
        method: 'PATCH',
        body: JSON.stringify({
            rating: selectedHeartRating,
            joaoRating: selectedJoaoRating,
            jennaRating: selectedJennaRating,
            memory: note,
            completedDate: todayStr,
            photoData: pendingMemoryPhoto
        })
    });
    completingIdeaId = null;
    document.getElementById('memory-overlay').style.display = 'none';
    triggerConfetti();
    showToast("Saved to your Scrapbook! 📖");
    fetchIdeas();
}

function renderPinnedBanner() {
    const banner = document.getElementById('pinned-date-banner');
    if (!banner) return;
    const pinned = ideas.find(i => i.isPinned && !i.isDone);
    if (!pinned) {
        banner.style.display = 'none';
        return;
    }
    const title = pinned.isSecret ? "👀 Secret Surprise Date" : pinned.title;
    banner.style.display = 'block';
    banner.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap;">
            <div>
                <span class="filter-label" style="color: var(--accent); opacity: 1; margin-bottom: 2px;">📌 Pinned Up Next</span>
                <div style="font-size: 16px; font-weight: 800;">${title}</div>
            </div>
            <div style="display: flex; gap: 6px;">
                <button class="reset-btn" onclick="markAsDone(${pinned.id})" style="border-color: var(--accent); color: var(--accent); font-weight: 700;">✅ Complete</button>
                <button class="reset-btn" onclick="togglePinIdea(${pinned.id}, false)">✖ Unpin</button>
            </div>
        </div>
    `;
}

async function togglePinIdea(id, shouldPin) {
    if (userName === 'Guest') return showToast("Guests cannot pin ideas.", true);
    await apiFetch(`/api/ideas/${id}/pin`, { method: 'PATCH', body: JSON.stringify({ isPinned: shouldPin }) });
    showToast(shouldPin ? "📌 Pinned as your next date!" : "Unpinned date");
    fetchIdeas();
}

async function pinWinnerDate() {
    if (!lastWinnerIdea) return;
    document.getElementById('result-overlay').style.display = 'none';
    await togglePinIdea(lastWinnerIdea.id, true);
}

// UNIFIED TRIP FOLDER DASHBOARD MODAL
function openTripDashboardModal(tripName) {
    triggerHaptic(10);
    const modal = document.getElementById('trip-dashboard-overlay');
    const titleEl = document.getElementById('trip-dash-title');
    const bodyEl = document.getElementById('trip-dash-body');
    if (!modal || !bodyEl) return;

    titleEl.innerText = `✈️ ${tripName}`;
    const tripIdeas = (typeof ideas !== 'undefined' ? ideas : []).filter(i => i.tripFolder === tripName);
    const tripSpots = (typeof restaurants !== 'undefined' ? restaurants : []).filter(r => r.tripFolder === tripName);

    const todoIdeas = tripIdeas.filter(i => !i.isDone);
    const todoSpots = tripSpots.filter(r => !r.isVisited);
    const doneCount = tripIdeas.filter(i => i.isDone).length + tripSpots.filter(r => r.isVisited).length;
    const totalCount = tripIdeas.length + tripSpots.length;

    const ideasHtml = tripIdeas.map(i => `
        <div class="idea-item" style="padding:10px 12px;margin-bottom:6px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-weight:700;font-size:13px;${i.isDone ? 'text-decoration:line-through;opacity:0.6;' : ''}">🎲 ${i.isSecret ? '👀 Secret Idea' : i.title}</span>
                <span class="badge">${i.isDone ? '✅ Done' : i.vibe}</span>
            </div>
        </div>
    `).join('') || `<div style="font-size:12px;opacity:0.6;margin-bottom:8px;">No date ideas tagged for this trip yet.</div>`;

    const spotsHtml = tripSpots.map(r => `
        <div class="idea-item" style="padding:10px 12px;margin-bottom:6px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-weight:700;font-size:13px;${r.isVisited ? 'text-decoration:line-through;opacity:0.6;' : ''}">🍽️ ${r.name} <span style="opacity:0.65;font-weight:500;">(${r.city})</span></span>
                <span class="badge">${r.isVisited ? '✅ Visited' : r.cuisine}</span>
            </div>
        </div>
    `).join('') || `<div style="font-size:12px;opacity:0.6;">No food spots tagged for this trip yet.</div>`;

    bodyEl.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;background:rgba(0,0,0,0.22);padding:10px 14px;border-radius:12px;">
            <span style="font-size:12.5px;font-weight:700;">Progress: ${doneCount} / ${totalCount} Completed</span>
            ${(todoIdeas.length + todoSpots.length) > 0 ? `<button class="reset-btn" onclick="spinFromTripFolder('${tripName.replace(/'/g, "\\'")}')" style="border-color:var(--accent);color:var(--accent);font-weight:800;">🎰 Spin Trip</button>` : ''}
        </div>
        <span class="filter-label">🎲 Trip Date Ideas (${tripIdeas.length})</span>
        ${ideasHtml}
        <span class="filter-label" style="margin-top:12px;">🍽️ Trip Food & Cafe Spots (${tripSpots.length})</span>
        ${spotsHtml}
    `;
    modal.style.display = 'flex';
}

function spinFromTripFolder(tripName) {
    document.getElementById('trip-dashboard-overlay').style.display = 'none';
    const todoIdeas = (typeof ideas !== 'undefined' ? ideas : []).filter(i => i.tripFolder === tripName && !i.isDone);
    const todoSpots = (typeof restaurants !== 'undefined' ? restaurants : []).filter(r => r.tripFolder === tripName && !r.isVisited);
    const combined = [
        ...todoIdeas.map(i => ({ type: 'idea', title: i.isSecret ? '👀 Secret Surprise' : i.title, sub: `🎲 Date Idea • ${i.vibe}` })),
        ...todoSpots.map(r => ({ type: 'spot', title: `${r.name} (${r.city})`, sub: `🍽️ ${r.cuisine} • ${r.vibe}` }))
    ];
    if (combined.length === 0) return showToast("Everything in this trip folder is completed!", true);
    const win = combined[Math.floor(Math.random() * combined.length)];
    document.getElementById('winner-header-label').innerText = `✈️ ${tripName} Pick!`;
    document.getElementById('winner-text').innerText = win.title;
    const descEl = document.getElementById('winner-description');
    descEl.innerText = win.sub;
    descEl.style.display = 'block';
    document.getElementById('result-overlay').style.display = 'flex';
    triggerConfetti();
}