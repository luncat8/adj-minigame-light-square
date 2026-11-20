// owns: shared game state and boot wiring; implements no features
// edit for: state shape, boot order, wiring

const $ = id => document.getElementById(id);

function blankTrace() {
	return { hits: new Uint8Array(225), segments: new Uint8Array(900) };
}

function blankPose() {
	return { diagonal: new Uint8Array(225), mask: new Uint8Array(225), emitter: 7 };
}

function makeGame() {
	return {
		rules: { mode: 'single', corners: false },
		strict: false,
		difficulty: 50,
		puzzle: null,
		pose: blankPose(),
		trace: blankTrace(),
		evaluation: { matches: 0, extras: 0, statuses: new Uint8Array(225), won: false, progress: 0 },
		discoveries: new Uint8Array(225),
		hints: { match: false, remember: false, targets: false },
		selectedRing: 7,
		previewActive: false,
		previewTrace: blankTrace(),
		previewEvaluation: { matches: 0, extras: 0, statuses: new Uint8Array(225), won: false, progress: 0 },
		solved: false
	};
}

// difficulty slider 0 (easy) .. 100 (hard) maps to a target sampled win rate
function targetFromDifficulty(d) {
	return 0.2 - 0.19 * (d / 100);
}

function recompute() {
	const trace = traceLight(game.pose);
	game.trace = trace;
	const ev = evaluateContract(game.puzzle.contract, trace.hits);
	game.evaluation = ev;
	const st = ev.statuses;
	const disc = game.discoveries;
	for (let i = 0; i < 225; i++) if (st[i] > disc[i]) disc[i] = st[i];
	game.solved = ev.won;
	updateStatus();
}

const game = makeGame();

game.generate = function () {
	game.puzzle = generatePuzzle({
		mode: game.rules.mode,
		corners: game.rules.corners,
		strict: game.strict,
		targetWinRate: targetFromDifficulty(game.difficulty)
	});
	game.pose = copyPose(game.puzzle.start);
	game.discoveries = new Uint8Array(225);
	game.solved = false;
	recompute();
	syncControls();
};

game.restart = function () {
	if (!game.puzzle) return;
	game.pose = copyPose(game.puzzle.start);
	game.solved = false;
	recompute();
};

game.recompute = recompute;

game.applyRingMove = function (side, dir) {
	if (!game.puzzle || game.previewActive) return;
	moveRing(game.pose, side, dir, game.rules.mode, game.rules.corners);
	recompute();
};

game.setEmitter = function (col) {
	if (!game.puzzle || game.previewActive) return;
	const c = Math.max(1, Math.min(13, Math.round(col)));
	if (c === game.pose.emitter) return;
	game.pose.emitter = c;
	recompute();
};

game.selectRing = function (side) {
	game.selectedRing = side;
};

game.strideFor = function (side) {
	return game.rules.mode === 'quarter' ? side - 1 : 1;
};

game.setPreview = function (active) {
	if (active === game.previewActive) return;
	game.previewActive = active;
	if (active) {
		game.previewTrace = traceLight(game.puzzle.witness);
		game.previewEvaluation = evaluateContract(game.puzzle.contract, game.previewTrace.hits);
	}
};

bindRender();
bindControls();
bindUi();
game.generate();
