// owns: settings panel controls
// edit for: panel layout, control wiring

const UI = {
	handlers: null,
	settings: null,
	quarter: null,
	shift: null,
	flip: null,
	difficulty: null,
	difficultyLabel: null,
	newPuzzle: null
};

UI.init = function(handlers, settings) {
	UI.handlers = handlers;
	UI.settings = settings;
	UI.quarter = $('rotQuarter');
	UI.shift = $('rotShift');
	UI.flip = $('flipCorners');
	UI.difficulty = $('difficulty');
	UI.difficultyLabel = $('difficultyLabel');
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
	UI.newPuzzle.addEventListener('click', function() {
		handlers.newGame();
	});
	UI.sync(settings);
};

UI.difficultyName = function(value) {
	if (value < 0.2) return 'Easy';
	if (value < 0.4) return 'Casual';
	if (value < 0.6) return 'Medium';
	if (value < 0.8) return 'Hard';
	return 'Expert';
};

UI.sync = function(settings) {
	UI.settings = settings;
	const quarter = settings.mode !== 'shift';
	UI.quarter.classList.toggle('active', quarter);
	UI.shift.classList.toggle('active', !quarter);
	UI.flip.checked = settings.flipAtCorners;
	const value = Math.round(settings.difficulty * 100);
	UI.difficulty.value = value;
	UI.difficultyLabel.textContent = UI.difficultyName(settings.difficulty);
};

if (typeof module !== 'undefined' && module.exports) module.exports = { UI: UI };