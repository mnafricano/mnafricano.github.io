const storageKey = 'execution-engine-dashboard-v1';

const seedState = {
    activeId: 'demo-1',
    selectedMinutes: 10,
    timerRemaining: 600,
    timerRunning: false,
    tasks: [
        {
            id: 'demo-1',
            mission: 'I am avoiding turning a good idea into the first ugly draft.',
            nextAction: 'Open the file and write one bad paragraph',
            friction: 'Close extra tabs',
            frictionRemoved: false,
            complete: false,
            createdAt: Date.now()
        },
        {
            id: 'demo-2',
            mission: 'I know I should clean up the project notes, but the pile feels vague.',
            nextAction: 'Make three bullets called Keep, Cut, Next',
            friction: 'Pick one note only',
            frictionRemoved: false,
            complete: false,
            createdAt: Date.now() - 1000
        }
    ],
    proofs: [
        {
            id: 'proof-1',
            text: 'Opened the dashboard and named the avoided task.',
            createdAt: Date.now() - 60000
        }
    ]
};

let state = loadState();
let timerId = null;

const captureForm = document.querySelector('[data-capture-form]');
const proofForm = document.querySelector('[data-proof-form]');
const activeCard = document.querySelector('[data-active-card]');
const taskList = document.querySelector('[data-task-list]');
const proofList = document.querySelector('[data-proof-list]');
const timerDisplay = document.querySelector('[data-timer-display]');
const presetButtons = document.querySelectorAll('[data-minutes]');
const startButton = document.querySelector('[data-timer-start]');
const pauseButton = document.querySelector('[data-timer-pause]');
const resetButton = document.querySelector('[data-timer-reset]');
const cutButton = document.querySelector('[data-cut-friction]');
const completeButton = document.querySelector('[data-complete-task]');
const resetDemoButton = document.querySelector('[data-reset-demo]');
const statusTitle = document.querySelector('[data-status-title]');
const openCount = document.querySelector('[data-open-count]');
const proofCount = document.querySelector('[data-proof-count]');
const meterFill = document.querySelector('[data-meter-fill]');
const appStatus = document.querySelector('[data-app-status]');

function announce(message) {
    appStatus.textContent = message;
}

function loadState() {
    try {
        const saved = JSON.parse(localStorage.getItem(storageKey));
        if (saved && Array.isArray(saved.tasks) && Array.isArray(saved.proofs)) return saved;
    } catch (error) {
        localStorage.removeItem(storageKey);
    }

    return structuredClone(seedState);
}

function saveState() {
    localStorage.setItem(storageKey, JSON.stringify(state));
}

function uid(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function activeTask() {
    return state.tasks.find((task) => task.id === state.activeId && !task.complete) || state.tasks.find((task) => !task.complete);
}

function setActive(id) {
    state.activeId = id;
    saveState();
    render();
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
    const remainder = Math.max(0, seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${remainder}`;
}

function formatStamp(timestamp) {
    return new Intl.DateTimeFormat([], {
        hour: 'numeric',
        minute: '2-digit'
    }).format(timestamp);
}

function escapeHtml(value) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function renderActive() {
    const task = activeTask();
    state.activeId = task?.id || null;

    if (!task) {
        activeCard.classList.add('is-empty');
        activeCard.innerHTML = '<p class="empty-state">Add a loop or choose one from the queue.</p>';
        cutButton.disabled = true;
        completeButton.disabled = true;
        return;
    }

    activeCard.classList.remove('is-empty');
    cutButton.disabled = false;
    completeButton.disabled = false;
    activeCard.innerHTML = `
        <h4>${escapeHtml(task.mission)}</h4>
        <div class="mission-meta">
            <div>
                <span>Next action</span>
                <p>${escapeHtml(task.nextAction)}</p>
            </div>
            <div>
                <span>${task.frictionRemoved ? 'Friction removed' : 'Friction to remove'}</span>
                <p>${escapeHtml(task.friction)}</p>
            </div>
        </div>
    `;
}

function renderTasks() {
    const openTasks = state.tasks.filter((task) => !task.complete);

    if (!openTasks.length) {
        taskList.innerHTML = '<p class="empty-state">No open loops. Capture one small avoided thing.</p>';
        return;
    }

    taskList.innerHTML = openTasks.map((task) => `
        <article class="task-item ${task.id === state.activeId ? 'is-active' : ''}">
            <div>
                <strong>${escapeHtml(task.nextAction)}</strong>
                <p>${escapeHtml(task.mission)}</p>
            </div>
            <div class="task-actions">
                <button class="icon-button" type="button" data-select-task="${task.id}" aria-label="Make active">→</button>
                <button class="icon-button danger" type="button" data-delete-task="${task.id}" aria-label="Delete task">×</button>
            </div>
        </article>
    `).join('');
}

function renderProofs() {
    if (!state.proofs.length) {
        proofList.innerHTML = '<p class="empty-state">No proof yet. Contact counts. Log it when it happens.</p>';
        return;
    }

    proofList.innerHTML = state.proofs.slice(0, 6).map((proof) => `
        <article class="proof-item">
            <time>${formatStamp(proof.createdAt)}</time>
            <p>${escapeHtml(proof.text)}</p>
        </article>
    `).join('');
}

function renderTimer() {
    timerDisplay.textContent = formatTime(state.timerRemaining);
    timerDisplay.classList.toggle('is-running', state.timerRunning);
    presetButtons.forEach((button) => {
        button.classList.toggle('is-active', Number(button.dataset.minutes) === state.selectedMinutes);
        button.setAttribute('aria-pressed', Number(button.dataset.minutes) === state.selectedMinutes ? 'true' : 'false');
    });
}

function renderStatus() {
    const openTasks = state.tasks.filter((task) => !task.complete).length;
    openCount.textContent = openTasks;
    proofCount.textContent = state.proofs.length;

    const task = activeTask();
    if (state.timerRunning) {
        statusTitle.textContent = 'Launch in progress';
    } else if (task?.frictionRemoved) {
        statusTitle.textContent = 'Friction is cut';
    } else if (task) {
        statusTitle.textContent = 'Ready to launch';
    } else {
        statusTitle.textContent = 'Capture a loop';
    }

    const total = Math.max(1, state.selectedMinutes * 60);
    const elapsed = total - state.timerRemaining;
    const progress = Math.max(0, Math.min(100, (elapsed / total) * 100));
    meterFill.style.width = `${progress}%`;
}

function render() {
    renderActive();
    renderTasks();
    renderProofs();
    renderTimer();
    renderStatus();
    saveState();
}

function addProof(text) {
    if (!text.trim()) return;
    state.proofs.unshift({
        id: uid('proof'),
        text: text.trim(),
        createdAt: Date.now()
    });
    saveState();
    render();
}

function stopTimer() {
    window.clearInterval(timerId);
    timerId = null;
    state.timerRunning = false;
}

captureForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(captureForm);
    const mission = data.get('mission').trim();
    const nextAction = data.get('nextAction').trim();
    const friction = data.get('friction').trim();

    if (!mission || !nextAction || !friction) {
        announce('Add the avoided thing, the next physical action, and the friction to remove.');
        return;
    }

    const task = {
        id: uid('task'),
        mission,
        nextAction,
        friction,
        frictionRemoved: false,
        complete: false,
        createdAt: Date.now()
    };

    state.tasks.unshift(task);
    state.activeId = task.id;
    captureForm.reset();
    announce('Loop added and made active. Saved in this browser.');
    render();
});

proofForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = proofForm.elements.proof;
    if (!input.value.trim()) {
        announce('Name one visible proof before logging it.');
        return;
    }
    addProof(input.value);
    input.value = '';
    announce('Proof logged. The dashboard has been saved.');
});

taskList.addEventListener('click', (event) => {
    const select = event.target.closest('[data-select-task]');
    const remove = event.target.closest('[data-delete-task]');

    if (select) {
        setActive(select.dataset.selectTask);
        announce('Active mission updated.');
    }

    if (remove) {
        state.tasks = state.tasks.filter((task) => task.id !== remove.dataset.deleteTask);
        if (state.activeId === remove.dataset.deleteTask) state.activeId = activeTask()?.id || null;
        announce('Task removed from the queue.');
        render();
    }
});

cutButton.addEventListener('click', () => {
    const task = activeTask();
    if (!task) return;
    task.frictionRemoved = true;
    addProof(`Removed friction: ${task.friction}`);
    announce('Friction marked as removed and logged as proof.');
    render();
});

completeButton.addEventListener('click', () => {
    const task = activeTask();
    if (!task) return;
    task.complete = true;
    addProof(`Completed: ${task.nextAction}`);
    state.activeId = activeTask()?.id || null;
    announce('Mission completed and logged as proof.');
    render();
});

presetButtons.forEach((button) => {
    button.addEventListener('click', () => {
        stopTimer();
        state.selectedMinutes = Number(button.dataset.minutes);
        state.timerRemaining = state.selectedMinutes * 60;
        announce(`${state.selectedMinutes}-minute launch window selected.`);
        render();
    });
});

startButton.addEventListener('click', () => {
    if (timerId) return;
    state.timerRunning = true;
    announce(`${state.selectedMinutes}-minute launch started.`);
    renderStatus();

    timerId = window.setInterval(() => {
        state.timerRemaining -= 1;
        if (state.timerRemaining <= 0) {
            state.timerRemaining = 0;
            stopTimer();
            addProof(`Completed a ${state.selectedMinutes}-minute launch.`);
        }
        renderTimer();
        renderStatus();
        saveState();
    }, 1000);
});

pauseButton.addEventListener('click', () => {
    stopTimer();
    announce('Timer paused. Progress saved.');
    render();
});

resetButton.addEventListener('click', () => {
    stopTimer();
    state.timerRemaining = state.selectedMinutes * 60;
    announce('Timer reset.');
    render();
});

resetDemoButton.addEventListener('click', () => {
    stopTimer();
    localStorage.removeItem(storageKey);
    state = structuredClone(seedState);
    announce('Demo data reset.');
    render();
});

render();
