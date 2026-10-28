let breathingMasterTimer = null;
let breathingSecondsLeft = 120;
let breathingElapsed = 0;
let breathingAudioCtx = null;

function playBreathingTone(freq = 432, duration = 0.6) {
    try {
        if (navigator.audioSession) {
            navigator.audioSession.type = 'playback';
        }

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        if (!breathingAudioCtx) breathingAudioCtx = new AudioContextClass();
        if (breathingAudioCtx.state === 'suspended') breathingAudioCtx.resume();

        const osc = breathingAudioCtx.createOscillator();
        const gain = breathingAudioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, breathingAudioCtx.currentTime);

        gain.gain.setValueAtTime(0.001, breathingAudioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.1, breathingAudioCtx.currentTime + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.0001, breathingAudioCtx.currentTime + duration);

        osc.connect(gain);
        gain.connect(breathingAudioCtx.destination);

        osc.start();
        osc.stop(breathingAudioCtx.currentTime + duration);
    } catch (e) {}
}

function updateBreathingStep() {
    const circle = document.getElementById('breathing-circle');
    const aura = document.getElementById('breathing-aura');
    const text = document.getElementById('breathing-text');
    const phaseSec = document.getElementById('breathing-phase-sec');
    const timerLabel = document.getElementById('breath-timer-label');

    const mins = Math.floor(breathingSecondsLeft / 60);
    const secs = String(breathingSecondsLeft % 60).padStart(2, '0');
    timerLabel.innerText = `${mins}:${secs}`;

    const mod = breathingElapsed % 14;

    if (mod === 0) {
        triggerHaptic(30);
        playBreathingTone(396, 0.7);
    } else if (mod === 4) {
        triggerHaptic(15);
        playBreathingTone(528, 0.5);
    } else if (mod === 8) {
        triggerHaptic([20, 50, 20]);
        playBreathingTone(330, 0.9);
    }

    if (mod < 4) {
        circle.className = 'breathing-circle inhale';
        aura.className = 'breathing-aura inhale';
        text.innerText = 'Inhale';
        phaseSec.innerText = `${4 - mod}s`;
    } else if (mod < 8) {
        circle.className = 'breathing-circle hold';
        aura.className = 'breathing-aura hold';
        text.innerText = 'Hold';
        phaseSec.innerText = `${8 - mod}s`;
    } else {
        circle.className = 'breathing-circle exhale';
        aura.className = 'breathing-aura exhale';
        text.innerText = 'Exhale';
        phaseSec.innerText = `${14 - mod}s`;
    }
}

function toggleBreathingPacer() {
    triggerHaptic(15);
    const btn = document.getElementById('breath-toggle-btn');
    const circle = document.getElementById('breathing-circle');
    const aura = document.getElementById('breathing-aura');
    const text = document.getElementById('breathing-text');
    const phaseSec = document.getElementById('breathing-phase-sec');
    const timerLabel = document.getElementById('breath-timer-label');

    if (breathingMasterTimer) {
        clearInterval(breathingMasterTimer);
        breathingMasterTimer = null;
        circle.className = 'breathing-circle';
        aura.className = 'breathing-aura';
        text.innerText = 'Ready';
        phaseSec.innerText = '';
        timerLabel.innerText = '2:00';
        btn.innerText = '▶️ Start 2-Minute Session';
        return;
    }

    if (navigator.audioSession) {
        navigator.audioSession.type = 'playback';
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass && !breathingAudioCtx) {
        breathingAudioCtx = new AudioContextClass();
    }
    if (breathingAudioCtx && breathingAudioCtx.state === 'suspended') {
        breathingAudioCtx.resume();
    }

    breathingSecondsLeft = 120;
    breathingElapsed = 0;
    btn.innerText = '⏹️ Stop Session';

    updateBreathingStep();

    breathingMasterTimer = setInterval(() => {
        breathingSecondsLeft--;
        breathingElapsed++;
        if (breathingSecondsLeft <= 0) {
            toggleBreathingPacer();
            triggerHaptic([40, 60, 40]);
            playBreathingTone(528, 1.0);
            showToast("2-minute breathing session complete 🤍");
            return;
        }
        updateBreathingStep();
    }, 1000);
}

