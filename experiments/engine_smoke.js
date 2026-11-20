const assert = require('assert');
const Board = require('../js/board.js').Board;
const Optics = require('../js/optics.js').Optics;

function mulberry32(a) {
	return function() {
		a |= 0;
		a = (a + 0x6D2B79F5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function blankBoard() {
	const b = Board.create();
	for (let i = 0; i < b.grid.length; i++) {
		const c = b.grid[i];
		c.type = Board.PASS;
		c.diag = 0;
		c.mask = 0;
		c.light = 0;
	}
	return b;
}

function hasSegment(x1, y1, x2, y2) {
	for (let i = 0; i < Optics.segCount; i++) {
		const s = Optics.segments[i];
		if (s.x1 === x1 && s.y1 === y1 && s.x2 === x2 && s.y2 === y2) return true;
	}
	return false;
}

Optics.init();

const b = Board.create();
assert.strictEqual(b.grid.length, 225);
assert.deepStrictEqual(b.rings.map(r => r.slots.length), [24, 16, 8, 0]);

const before = b.grid.slice();
const diags = b.grid.map(c => c.diag);
for (let k = 0; k < 4; k++) Board.rotateRing(b, 0, 1);
for (let i = 0; i < b.grid.length; i++) {
	assert.strictEqual(b.grid[i], before[i]);
	assert.strictEqual(b.grid[i].diag, diags[i]);
}

const rb = blankBoard();
rb.laserCol = 7;
rb.laserWidth = 1;
const mirror = rb.grid[10 * 15 + 7];
mirror.type = Board.MIRROR;
mirror.diag = 0;
mirror.mask = 7;
Optics.trace(rb);
assert.strictEqual(rb.grid[10 * 15 + 7].light, 7);
assert.strictEqual(rb.grid[10 * 15 + 8].light, 7);
assert.strictEqual(rb.grid[9 * 15 + 7].light, 0);
assert.ok(hasSegment(7.5, 10.5, 8.5, 10.5));

const sb = blankBoard();
sb.laserCol = 7;
sb.laserWidth = 1;
const splitter = sb.grid[10 * 15 + 7];
splitter.type = Board.MIRROR;
splitter.diag = 0;
splitter.mask = 1;
Optics.trace(sb);
assert.strictEqual(sb.grid[10 * 15 + 7].light, 7);
assert.strictEqual(sb.grid[10 * 15 + 8].light, 1);
assert.strictEqual(sb.grid[9 * 15 + 7].light, 6);

for (let seed = 1; seed <= 20; seed++) {
	const g = Board.generate(mulberry32(seed), 4, Optics.trace);
	assert.ok(g.targets.length >= 2, 'seed ' + seed + ' targets');
	for (const t of g.targets) {
		assert.ok(Board.isBorder(Math.floor(t.idx / 15), t.idx % 15), 'seed ' + seed + ' border');
		assert.ok(t.mask >= 1 && t.mask <= 7, 'seed ' + seed + ' mask');
	}
	g.laserCol = g.solutionLaser;
	Optics.trace(g);
	assert.ok(Board.countSolved(g) < g.targets.length, 'seed ' + seed + ' start solved');
	for (let ring = 0; ring < 3; ring++) {
		const delta = (((g.solutionTurns[ring] - g.rings[ring].turns) % 4) + 4) % 4;
		for (let k = 0; k < delta; k++) Board.rotateRing(g, ring, 1);
	}
	g.laserCol = g.solutionLaser;
	Optics.trace(g);
	assert.strictEqual(Board.countSolved(g), g.targets.length, 'seed ' + seed + ' solve');
}

console.log('engine_smoke ok');
