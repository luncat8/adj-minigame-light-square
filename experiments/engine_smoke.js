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

function blank(mode, flipAtCorners) {
	const b = Board.create();
	b.mode = mode;
	b.flipAtCorners = flipAtCorners;
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

function assertRingState(b, ring, refs, diags, label) {
	const slots = b.rings[ring].slots;
	for (let i = 0; i < slots.length; i++) {
		assert.strictEqual(b.grid[slots[i]], refs[i], label + ' ref ' + i);
		assert.strictEqual(b.grid[slots[i]].diag, diags[i], label + ' diag ' + i);
	}
}

Optics.init();

const base = Board.create();
assert.strictEqual(base.grid.length, 225);
assert.deepStrictEqual(base.rings.map(r => r.size), [7, 5, 3, 1]);
assert.deepStrictEqual(base.rings.map(r => r.slots.length), [24, 16, 8, 0]);
assert.deepStrictEqual(base.rings.map((r, i) => Board.period(base, i)), [4, 4, 4, 2]);

const q = blank('quarter', true);
for (let ring = 0; ring < 3; ring++) {
	const slots = q.rings[ring].slots;
	const refs = slots.map(i => q.grid[i]);
	const diags = refs.map(c => c.diag);
	for (let k = 0; k < 4; k++) Board.rotateRing(q, ring, 1);
	assertRingState(q, ring, refs, diags, 'quarter ring ' + ring);
}
const qc = q.grid[Board.center * q.n + Board.center];
const qd = qc.diag;
for (let k = 0; k < 2; k++) Board.rotateRing(q, 3, 1);
assert.strictEqual(qc.diag, qd, 'quarter 1x1');

const s = blank('shift', true);
for (let ring = 0; ring < 3; ring++) {
	const slots = s.rings[ring].slots;
	const refs = slots.map(i => s.grid[i]);
	const diags = refs.map(c => c.diag);
	for (let k = 0; k < slots.length; k++) Board.rotateRing(s, ring, 1);
	assertRingState(s, ring, refs, diags, 'shift ring ' + ring);
}
for (let ring = 0; ring < 3; ring++) {
	const slots = s.rings[ring].slots;
	const before = s.grid[slots[0]];
	Board.rotateRing(s, ring, 1);
	assert.notStrictEqual(s.grid[slots[0]], before, 'shift ring ' + ring + ' moves');
}

const so = blank('shift', false);
for (let ring = 0; ring < 3; ring++) {
	const slots = so.rings[ring].slots;
	const refs = slots.map(i => so.grid[i]);
	const diags = refs.map(c => c.diag);
	for (let k = 0; k < slots.length; k++) Board.rotateRing(so, ring, 1);
	assertRingState(so, ring, refs, diags, 'shift off ring ' + ring);
}

const cr = blank('shift', true);
const cSlots = cr.rings[2].slots;
const cCorner = cr.grid[cSlots[0]];
const cNext = cr.grid[cSlots[1]];
Board.rotateRing(cr, 2, 1);
assert.strictEqual(cr.grid[cSlots[1]], cCorner, 'corner leaves');
assert.strictEqual(cCorner.diag, 0, 'leaving corner does not flip');
assert.strictEqual(cr.grid[cSlots[2]], cNext, 'corner enters');
assert.strictEqual(cNext.diag, 1, 'entering corner flips');

const cf = blank('shift', false);
const fSlots = cf.rings[2].slots;
const fCorner = cf.grid[fSlots[0]];
const fNext = cf.grid[fSlots[1]];
Board.rotateRing(cf, 2, 1);
assert.strictEqual(cf.grid[fSlots[1]], fCorner, 'off leaves');
assert.strictEqual(cf.grid[fSlots[2]], fNext, 'off enters');
assert.strictEqual(fCorner.diag, 0, 'off leaving');
assert.strictEqual(fNext.diag, 0, 'off entering');

const inv = blank('shift', true);
const iSlots = inv.rings[2].slots;
const iRefs = iSlots.map(i => inv.grid[i]);
const iDiags = iRefs.map(c => c.diag);
for (let k = 0; k < 3; k++) Board.rotateRing(inv, 2, 1);
for (let k = 0; k < 3; k++) Board.rotateRing(inv, 2, -1);
assertRingState(inv, 2, iRefs, iDiags, 'corner inverse');

const one = blank('quarter', true);
const oneCell = one.grid[Board.center * one.n + Board.center];
const oneDiag = oneCell.diag;
Board.rotateRing(one, 3, 1);
assert.strictEqual(oneCell.diag, oneDiag ^ 1, '1x1 flips');
Board.rotateRing(one, 3, -1);
assert.strictEqual(oneCell.diag, oneDiag, '1x1 restores');

const norm = blank('shift', true);
const normTurns = [25, -1, 17, 5];
Board.normalizeTurns(norm, normTurns);
assert.deepStrictEqual(normTurns, [1, 15, 1, 1], 'normalize turns');

const at = blank('quarter', true);
Board.applyTurns(at, [1, 2, 3, 0]);
assert.deepStrictEqual(at.rings.map(r => r.turns), [1, 2, 3, 0], 'apply turns counters');
Board.applyTurns(at, [0, 0, 0, 0]);
assert.deepStrictEqual(at.rings.map(r => r.turns), [0, 0, 0, 0], 'apply turns back');

const rb = blank('quarter', true);
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
assert.ok(hasSegment(7.5, 10.5, 8.5, 10.5), 'mirror segment');

const sb = blank('quarter', true);
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

function testGenerated(mode, flipAtCorners, seeds) {
	for (let seed = 1; seed <= seeds; seed++) {
		const g = Board.generate(mulberry32(seed), { mode: mode, flipAtCorners: flipAtCorners, targetCount: 4 }, Optics.trace);
		assert.ok(g, 'seed ' + seed + ' board');
		assert.strictEqual(g.mode, mode, 'seed ' + seed + ' mode');
		assert.strictEqual(g.flipAtCorners, flipAtCorners, 'seed ' + seed + ' corners');
		assert.ok(g.targets.length >= 2, 'seed ' + seed + ' targets');
		for (const t of g.targets) {
			assert.ok(Board.isBorder(Math.floor(t.idx / 15), t.idx % 15), 'seed ' + seed + ' border');
			assert.ok(t.mask >= 1 && t.mask <= 7, 'seed ' + seed + ' mask');
		}
		const center = g.grid[Board.center * g.n + Board.center];
		assert.strictEqual(center.type, Board.MIRROR, 'seed ' + seed + ' center');
		assert.ok(center.mask >= 1 && center.mask <= 7, 'seed ' + seed + ' center mask');
		Optics.trace(g);
		assert.ok(Board.countSolved(g) < g.targets.length, 'seed ' + seed + ' start solved');
		assert.strictEqual(Board.laserSolves(g, Optics.trace), false, 'seed ' + seed + ' laser solves');
		Optics.trace(g);
		assert.ok(Board.countSolved(g) < g.targets.length, 'seed ' + seed + ' laser restore');
		const refs = g.grid.slice();
		const diags = g.grid.map(c => c.diag);
		Board.applyTurns(g, g.solutionTurns);
		g.laserCol = g.solutionLaser;
		Board.updateLaser(g);
		Optics.trace(g);
		assert.ok(Board.isSolved(g), 'seed ' + seed + ' witness');
		Board.applyTurns(g, g.startTurns);
		g.laserCol = g.solutionLaser;
		Board.updateLaser(g);
		Optics.trace(g);
		for (let i = 0; i < g.grid.length; i++) {
			assert.strictEqual(g.grid[i], refs[i], 'seed ' + seed + ' restore ref ' + i);
			assert.strictEqual(g.grid[i].diag, diags[i], 'seed ' + seed + ' restore diag ' + i);
		}
	}
}

testGenerated('quarter', true, 100);
testGenerated('shift', true, 100);
testGenerated('shift', false, 50);

console.log('engine_smoke ok');