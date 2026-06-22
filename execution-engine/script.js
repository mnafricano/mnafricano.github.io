const steps = {
    capture: {
        kicker: 'Capture',
        title: 'Turn a vague intention into a visible object.',
        body: 'The brain should not have to hold the mission, the plan, the anxiety, and the first step at once. Write the exact thing you are avoiding in plain language.',
        command: 'Write: "I am avoiding..."'
    },
    cut: {
        kicker: 'Cut friction',
        title: 'Make starting less expensive than avoiding.',
        body: 'Do not solve the whole problem. Remove the nearest obstacle: open the file, clear the surface, find the tab, place the shoes by the door.',
        command: 'Remove one obstacle'
    },
    launch: {
        kicker: 'Launch',
        title: 'Use a timer as an external nervous system.',
        body: 'A timer turns action into a temporary experiment. You are not promising motivation. You are promising contact for a short, bounded window.',
        command: 'Start a 10-minute launch'
    },
    close: {
        kicker: 'Close',
        title: 'End with evidence that the loop happened.',
        body: 'Record the smallest proof of movement. A sentence, a screenshot, a checked box, a cleared surface. The proof matters because memory lies under stress.',
        command: 'Log one visible proof'
    }
};

const board = document.querySelector('[data-engine-board]');
const detail = document.querySelector('[data-step-detail]');

if (board && detail) {
    board.addEventListener('click', (event) => {
        const button = event.target.closest('[data-step]');
        if (!button) return;

        const step = steps[button.dataset.step];
        if (!step) return;

        board.querySelectorAll('[data-step]').forEach((item) => {
            item.classList.toggle('is-active', item === button);
        });

        detail.innerHTML = `
            <p class="detail-kicker">${step.kicker}</p>
            <h3>${step.title}</h3>
            <p>${step.body}</p>
            <div class="detail-command">${step.command}</div>
        `;
    });
}
