// owns: panel controls, status/rule display, hint toggles, preview gesture
// edit for: control wiring, labels

let els = null;

function startPreview() { game.setPreview(true); }
function endPreview() { game.setPreview(false); }

function onDifficulty() {
	game.difficulty = +els.difficulty.value;
	els.difficultyVal.textContent = els.difficulty.value;
}

function onMode() { game.rules.mode = els.mode.value; }
function onCorners() { game.rules.corners = els.corners.checked; }
function onExact() { game.strict = els.exact.checked; }

function onHints() {
	game.hints.match = els.hintMatch.checked;
	game.hints.remember = els.hintRemember.checked;
	game.hints.targets = els.hintTargets.checked;
}

function syncControls() {
	els.difficulty.value = game.difficulty;
	els.difficultyVal.textContent = game.difficulty;
	els.mode.value = game.rules.mode;
	els.corners.checked = game.rules.corners;
	els.exact.checked = game.strict;
	els.hintMatch.checked = game.hints.match;
	els.hintRemember.checked = game.hints.remember;
	els.hintTargets.checked = game.hints.targets;
}

function updateStatus() {
	if (!game.puzzle) { els.status.textContent = ''; els.rules.textContent = ''; return; }
	const e = game.evaluation;
	const q = game.puzzle.contract.quota;
	els.rules.textContent = game.rules.mode + ' - corners ' + (game.rules.corners ? 'on' : 'off') + ' - ring ' + game.selectedRing;
	let text = e.progress + '% - ' + e.matches + '/' + q + ' matched';
	if (e.extras) text += ' - ' + e.extras + ' extra';
	if (game.solved) text = 'solved';
	els.status.textContent = text;
}

function bindHints() {
	els.hintMatch.addEventListener('change', onHints);
	els.hintRemember.addEventListener('change', onHints);
	els.hintTargets.addEventListener('change', onHints);
}

function bindPreview() {
	const btn = els.preview;
	btn.addEventListener('pointerenter', startPreview);
	btn.addEventListener('pointerleave', endPreview);
	btn.addEventListener('pointerdown', startPreview);
	btn.addEventListener('pointerup', endPreview);
	btn.addEventListener('pointercancel', endPreview);
	btn.addEventListener('keydown', ev => {
		if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); startPreview(); }
	});
	btn.addEventListener('keyup', ev => {
		if (ev.key === ' ' || ev.key === 'Enter') endPreview();
	});
	btn.addEventListener('blur', endPreview);
	window.addEventListener('blur', endPreview);
	document.addEventListener('visibilitychange', endPreview);
}

function bindUi() {
	els = {
		difficulty: $('difficulty'),
		difficultyVal: $('difficulty-val'),
		mode: $('mode'),
		corners: $('corners'),
		exact: $('exact'),
		generate: $('generate'),
		restart: $('restart'),
		preview: $('preview'),
		hintMatch: $('hint-match'),
		hintRemember: $('hint-remember'),
		hintTargets: $('hint-targets'),
		ringCcw: $('ring-ccw'),
		ringCw: $('ring-cw'),
		emitterLeft: $('emitter-left'),
		emitterRight: $('emitter-right'),
		rules: $('rules'),
		status: $('status')
	};
	els.difficulty.addEventListener('input', onDifficulty);
	els.mode.addEventListener('change', onMode);
	els.corners.addEventListener('change', onCorners);
	els.exact.addEventListener('change', onExact);
	els.generate.addEventListener('click', () => game.generate());
	els.restart.addEventListener('click', () => game.restart());
	els.ringCcw.addEventListener('click', () => game.applyRingMove(game.selectedRing, -1));
	els.ringCw.addEventListener('click', () => game.applyRingMove(game.selectedRing, 1));
	els.emitterLeft.addEventListener('click', () => game.setEmitter(game.pose.emitter - 1));
	els.emitterRight.addEventListener('click', () => game.setEmitter(game.pose.emitter + 1));
	bindHints();
	bindPreview();
}

if (typeof module !== 'undefined') module.exports = { bindUi, syncControls, updateStatus };
