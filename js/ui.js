// owns: settings panel controls
// edit for: panel layout, control wiring

const UI = {
	handlers: null,
	settings: null,
	quarter: null,
	shift: null,
	flip: null,
	newPuzzle: null
};

UI.init = function(handlers, settings) {
	UI.handlers = handlers;
	UI.settings = settings;
	UI.quarter = $('rotQuarter');
	UI.shift = $('rotShift');
	UI.flip = $('flipCorners');
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
	UI.newPuzzle.addEventListener('click', function() {
		handlers.newGame();
	});
	UI.sync(settings);
};

UI.sync = function(settings) {
	UI.settings = settings;
	const quarter = settings.mode !== 'shift';
	UI.quarter.classList.toggle('active', quarter);
	UI.shift.classList.toggle('active', !quarter);
	UI.flip.checked = settings.flipAtCorners;
};

if (typeof module !== 'undefined' && module.exports) module.exports = { UI: UI };