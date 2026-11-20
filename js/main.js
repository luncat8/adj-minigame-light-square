// owns: boot, wiring, frame loop
// edit for: load order, boot, wiring

const $ = id => document.getElementById(id);

const Game = {
	canvas: null,
	board: null,
	status: '',
	solved: false
};

Game.handlers = {
	rotate: function(ring, dir) {
		Game.rotate(ring, dir);
	},
	setLaser: function(col) {
		Game.setLaser(col);
	},
	moveLaser: function(delta) {
		Game.moveLaser(delta);
	},
	setWidth: function(w) {
		Game.setWidth(w);
	},
	newGame: function() {
		Game.newGame();
	},
	ringAt: function(row, col) {
		return Board.ringAt(row, col);
	}
};

Game.start = function() {
	Game.canvas = $('canv');
	Renderer.init(Game.canvas, Board.n);
	Optics.init();
	Input.init(Game.canvas, Renderer, Game.handlers);
	Game.newGame();
	window.addEventListener('resize', Game.resize);
	requestAnimationFrame(Game.frame);
};

Game.newGame = function() {
	Game.board = Board.generate(Math.random, 4, Optics.trace);
	Game.refresh();
};

Game.refresh = function() {
	const b = Game.board;
	Optics.trace(b);
	const total = b.targets.length;
	const lit = Board.countSolved(b);
	const solved = total > 0 && lit === total;
	Game.solved = solved;
	Game.status = 'targets ' + lit + '/' + total + '   laser ' + b.laserCol + '   width ' + b.laserWidth + (solved ? '   SOLVED' : '');
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
