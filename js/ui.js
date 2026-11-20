// owns: settings panel controls
// edit for: panel layout, control wiring

const UI = {
	handlers: null,
	settings: null,
	hints: null,
	quarter: null,
	shift: null,
	flip: null,
	difficulty: null,
	difficultyLabel: null,
	hintGood: null,
	hintFound: null,
	hintTargets: null,
	solution: null,
	hoverPreview: null,
	newPuzzle: null
};

UI.init = function(handlers, settings, hints) {
	UI.handlers = handlers;
	UI.settings = settings;
	UI.hints = hints || { good: true, found: true, targets: true };
	UI.quarter = $('rotQuarter');
	UI.shift = $('rotShift');
	UI.flip = $('flipCorners');
	UI.difficulty = $('difficulty');
	UI.difficultyLabel = $('difficultyLabel');
	UI.hintGood = $('hintGood');
	UI.hintFound = $('hintFound');
	UI.hintTargets = $('hintTargets');
	UI.solution = $('solutionPreview');
	UI.hoverPreview = $('hoverPreview');
	UI.newPuzzle = $('newPuzzle');
	UI.quarter.addEventListener('click', function() {
		handlers.setMode('quarter');
	});
	UI.shift.addEventListener('click', function() {
		handlers.setMode('shift');
	});
	UI.flip.addEventListener('change', function() {
		handlers.setFlipAtCorners(UI.flip.checked);
	});
	UI.difficulty.addEventListener('input', function() {
		handlers.setDifficulty(Number(UI.difficulty.value) / 100);
	});
	UI.hintGood.addEventListener('change', function() {
		handlers.setHint('good', UI.hintGood.checked);
	});
	UI.hintFound.addEventListener('change', function() {
		handlers.setHint('found', UI.hintFound.checked);
	});
	UI.hintTargets.addEventListener('change', function() {
		handlers.setHint('targets', UI.hintTargets.checked);
	});
	UI.hoverPreview.addEventListener('change', function() {
		handlers.setHoverPreview(UI.hoverPreview.checked);
	});
	UI.solution.addEventListener('pointerdown', function(e) {
		e.preventDefault();
		handlers.previewStart();
		if (UI.solution.setPointerCapture) UI.solution.setPointerCapture(e.pointerId);
	});
	UI.solution.addEventListener('pointerup', function() {
		handlers.previewEnd();
	});
	UI.solution.addEventListener('pointercancel', function() {
		handlers.previewEnd();
	});
	UI.solution.addEventListener('pointerenter', function(e) {
		if (e.buttons === 0 && UI.settings.hoverPreview) handlers.previewStart();
	});
	UI.solution.addEventListener('pointerleave', function(e) {
		if (e.buttons === 0 && UI.settings.hoverPreview) handlers.previewEnd();
	});
	window.addEventListener('keydown', function(e) {
		if (e.code !== 'KeyS' || e.repeat) return;
		const tag = e.target && e.target.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
		e.preventDefault();
		handlers.previewStart();
	});
	window.addEventListener('keyup', function(e) {
		if (e.code === 'KeyS') handlers.previewEnd();
	});
	window.addEventListener('blur', function() {
		handlers.previewEnd();
	});
	UI.newPuzzle.addEventListener('click', function() {
		handlers.newGame();
	});
	UI.sync(settings, UI.hints);
};

UI.difficultyName = function(value) {
	if (value < 0.2) return 'Easy';
	if (value < 0.4) return 'Casual';
	if (value < 0.6) return 'Medium';
	if (value < 0.8) return 'Hard';
	return 'Expert';
};

UI.sync = function(settings, hints) {
	UI.settings = settings;
	if (hints) UI.hints = hints;
	const h = UI.hints;
	const quarter = settings.mode !== 'shift';
	UI.quarter.classList.toggle('active', quarter);
	UI.shift.classList.toggle('active', !quarter);
	UI.flip.checked = settings.flipAtCorners;
	const value = Math.round(settings.difficulty * 100);
	UI.difficulty.value = value;
	UI.difficultyLabel.textContent = UI.difficultyName(settings.difficulty);
	UI.hintGood.checked = h.good;
	UI.hintFound.checked = h.found;
	UI.hintTargets.checked = h.targets;
	UI.hintGood.disabled = !h.targets;
	UI.hintFound.disabled = !h.targets;
	UI.hoverPreview.checked = settings.hoverPreview;
};

UI.setPreview = function(active) {
	UI.solution.classList.toggle('active', !!active);
};

if (typeof module !== 'undefined' && module.exports) module.exports = { UI: UI };