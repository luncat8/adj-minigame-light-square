// owns: boot, wiring, frame loop
// edit for: load order, boot, wiring

const $ = id => document.getElementById(id);

const Game = {
	canvas: null,
	board: null,
	status: '',
	solved: false,
	preview: false,
	_saved: { laserCol: 0, laserWidth: 1, turns: [0, 0, 0, 0] },
	hints: { good: true, found: true, targets: true },
	settings: { mode: 'quarter', flipAtCorners: true, difficulty: 0.5, hoverPreview: false }
};

Game.handlers = {
	rotate: function(ring, dir) {
		Game.rotate(ring, dir);
	},
	laser: function(col) {
		Game.setLaser(col);
	},
	moveLaser: function(delta) {
		Game.moveLaser(delta);
	},
	setMode: function(mode) {
		Game.setMode(mode);
	},
	setFlipAtCorners: function(value) {
		Game.setFlipAtCorners(value);
	},
	setDifficulty: function(value) {
		Game.setDifficulty(value);
	},
	setHint: function(name, value) {
		Game.setHint(name, value);
	},
	setHoverPreview: function(value) {
		Game.setHoverPreview(value);
	},
	previewStart: function() {
		Game.previewStart();
	},
	previewEnd: function() {
		Game.previewEnd();
	},
	canInteract: function() {
		return !Game.preview;
	},
	newGame: function() {
		Game.newGame();
	},
	ringAt: function(row, col) {
		return Board.ringAt(row, col);
	},
	ringSize: function(ring) {
		return Board.ringSize(ring);
	}
};

Game.start = function() {
	Game.canvas = $('canv');
	Renderer.init(Game.canvas, Board.n);
	Optics.init();
	Input.init(Game.canvas, Renderer, Game.handlers);
	UI.init(Game.handlers, Game.settings, Game.hints);
	Game.newGame();
	window.addEventListener('resize', Game.resize);
	requestAnimationFrame(Game.frame);
};

Game.newGame = function() {
	Game.previewEnd();
	Game.board = Generate.make(Math.random, Game.settings, Optics.trace);
	Game.refresh();
};

Game.refresh = function() {
	const b = Game.board;
	Optics.trace(b);
	Board.refreshStatus(b);
	Game.updateStatus();
};

Game.updateStatus = function() {
	const b = Game.board;
	const total = b.groups.length;
	const done = Board.countGroupsSatisfied(b);
	const solved = total > 0 && done === total;
	Game.solved = solved;
	const d = b.difficulty.toFixed(2);
	if (b.preview) {
		Game.status = 'SOLUTION PREVIEW   100%   release to restore';
		return;
	}
	if (solved) {
		Game.status = 'SOLVED   100%   laser ' + b.laserCol + '   d ' + d;
		return;
	}
	const groups = [];
	for (let i = 0; i < total; i++) {
		groups.push('g' + (i + 1) + ' ' + b.groupGood[i] + '/' + b.groupNeed[i]);
	}
	Game.status = 'groups ' + done + '/' + total + '   ' + Math.round(b.progress * 100) + '%   ' + groups.join('  ') + '   need ' + b.remaining + (b.wrong > 0 ? '   ' + b.wrong + ' wrong' : '') + '   laser ' + b.laserCol + '   d ' + d;
};

Game.setMode = function(mode) {
	Game.previewEnd();
	if (Game.settings.mode === mode) return;
	Game.settings.mode = mode;
	UI.sync(Game.settings, Game.hints);
	Game.newGame();
};

Game.setFlipAtCorners = function(value) {
	value = !!value;
	Game.previewEnd();
	if (Game.settings.flipAtCorners === value) return;
	Game.settings.flipAtCorners = value;
	UI.sync(Game.settings, Game.hints);
	Game.newGame();
};

Game.setDifficulty = function(value) {
	value = Board.clamp01(value);
	if (Game.settings.difficulty === value) return;
	Game.settings.difficulty = value;
	UI.sync(Game.settings, Game.hints);
	Game.refresh();
};

Game.setHoverPreview = function(value) {
	value = !!value;
	if (Game.settings.hoverPreview === value) return;
	Game.settings.hoverPreview = value;
	UI.sync(Game.settings, Game.hints);
};

Game.setHint = function(name, value) {
	const hints = Game.hints;
	if (!hints || !(name in hints) || !Game.board) return;
	value = !!value;
	if (hints[name] === value) return;
	hints[name] = value;
	UI.sync(Game.settings, Game.hints);
	Board.refreshStatus(Game.board);
	Game.updateStatus();
};

Game.previewStart = function() {
	const b = Game.board;
	if (!b || Game.preview) return;
	const saved = Game._saved;
	saved.laserCol = b.laserCol;
	saved.laserWidth = b.laserWidth;
	for (let r = 0; r < 4; r++) saved.turns[r] = b.rings[r].turns;
	b.preview = true;
	Game.preview = true;
	Board.applyTurns(b, b.solutionTurns);
	b.laserCol = b.solutionLaser;
	b.laserWidth = b.solutionWidth;
	Board.updateLaser(b);
	Game.refresh();
	UI.setPreview(true);
};

Game.previewEnd = function() {
	if (!Game.preview || !Game.board) return;
	const b = Game.board;
	const saved = Game._saved;
	Board.applyTurns(b, saved.turns);
	b.laserCol = saved.laserCol;
	b.laserWidth = saved.laserWidth;
	Board.updateLaser(b);
	b.preview = false;
	Game.preview = false;
	Game.refresh();
	UI.setPreview(false);
};

Game.rotate = function(ring, dir) {
	Board.rotateRing(Game.board, ring, dir);
	Game.refresh();
};

Game.setLaser = function(col) {
	const n = Game.board.n;
	if (col < 0) col = 0;
	if (col >= n) col = n - 1;
	if (col === Game.board.laserCol) return;
	Game.board.laserCol = col;
	Board.updateLaser(Game.board);
	Game.refresh();
};

Game.moveLaser = function(delta) {
	Game.setLaser(Game.board.laserCol + delta);
};

Game.setWidth = function(w) {
	if (w < 1) w = 1;
	if (w > 3) w = 3;
	if (w === Game.board.laserWidth) return;
	Game.board.laserWidth = w;
	Board.updateLaser(Game.board);
	Game.refresh();
};

Game.resize = function() {
	Renderer.resize(window.innerWidth, window.innerHeight);
};

Game.frame = function() {
	Renderer.draw(Game.board, Game.status, Optics.segments, Optics.segCount, Game.solved, Game.hints, Game.preview);
	requestAnimationFrame(Game.frame);
};

Game.start();
