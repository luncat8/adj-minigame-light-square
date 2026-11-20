// owns: boot, wiring, frame loop
// edit for: load order, boot, wiring

const $ = id => document.getElementById(id);

const Game = {
	canvas: null,
	board: null,
	status: '',
	solved: false,
	settings: { mode: 'quarter', flipAtCorners: true, difficulty: 0.5 }
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
	UI.init(Game.handlers, Game.settings);
	Game.newGame();
	window.addEventListener('resize', Game.resize);
	requestAnimationFrame(Game.frame);
};

Game.newGame = function() {
	Game.board = Board.generate(Math.random, Game.settings, Optics.trace);
	Game.refresh();
};

Game.refresh = function() {
	const b = Game.board;
	Optics.trace(b);
	const total = b.groups.length;
	const done = Board.countGroupsSatisfied(b);
	const solved = total > 0 && done === total;
	Game.solved = solved;
	const mode = b.mode === 'shift' ? 'mode cell' : 'mode 90°';
	Game.status = 'groups ' + done + '/' + total + '   laser ' + b.laserCol + '   ' + mode + '   d ' + b.difficulty.toFixed(2) + (solved ? '   SOLVED' : '');
};

Game.setMode = function(mode) {
	if (Game.settings.mode === mode) return;
	Game.settings.mode = mode;
	UI.sync(Game.settings);
	Game.newGame();
};

Game.setFlipAtCorners = function(value) {
	value = !!value;
	if (Game.settings.flipAtCorners === value) return;
	Game.settings.flipAtCorners = value;
	UI.sync(Game.settings);
	Game.newGame();
};

Game.setDifficulty = function(value) {
	value = Board.clamp01(value);
	if (Game.settings.difficulty === value) return;
	Game.settings.difficulty = value;
	UI.sync(Game.settings);
	Game.refresh();
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
	Renderer.draw(Game.board, Game.status, Optics.segments, Optics.segCount, Game.solved);
	requestAnimationFrame(Game.frame);
};

Game.start();
