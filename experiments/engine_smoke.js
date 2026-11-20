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

function checkGroups(g, label) {
	assert.ok(g.groups.length >= 1 && g.groups.length <= 3, label + ' group count');
	const used = new Set();
	for (let gi = 0; gi < g.groups.length; gi++) {
		const group = g.groups[gi];
		assert.ok(group.cells.length >= 1, label + ' group cells');
		assert.ok(group.need >= 1 && group.need <= group.cells.length, label + ' group need');
		for (const cell of group.cells) {
			assert.ok(Board.isBorder(Math.floor(cell.idx / 15), cell.idx % 15), label + ' border');
			assert.ok(!used.has(cell.idx), label + ' disjoint');
			used.add(cell.idx);
			if (group.exact) assert.ok(cell.mask >= 1 && cell.mask <= 7, label + ' exact mask');
			else assert.strictEqual(cell.mask, 0, label + ' any mask');
		}
	}
}

function testGenerated(mode, flipAtCorners, difficulty, seeds) {
	for (let seed = 1; seed <= seeds; seed++) {
		const label = mode + ' d' + difficulty + ' seed ' + seed;
		const g = Board.generate(mulberry32(seed), { mode: mode, flipAtCorners: flipAtCorners, difficulty: difficulty }, Optics.trace);
		assert.ok(g, label + ' board');
		assert.strictEqual(g.mode, mode, label + ' mode');
		assert.strictEqual(g.flipAtCorners, flipAtCorners, label + ' corners');
		assert.strictEqual(g.difficulty, difficulty, label + ' difficulty');
		checkGroups(g, label);
		assert.ok(g.difficultyScore >= 0 && g.difficultyScore <= 1, label + ' score');
		Optics.trace(g);
		assert.strictEqual(Board.isSolved(g), false, label + ' start solved');
		assert.strictEqual(Board.laserSolves(g, Optics.trace), false, label + ' laser solves');
		Optics.trace(g);
		assert.strictEqual(Board.isSolved(g), false, label + ' laser restore');
		const startLight = new Uint8Array(225);
		for (let i = 0; i < 225; i++) startLight[i] = g.grid[i].light;
		for (let gi = 0; gi < g.groups.length; gi++) {
			const group = g.groups[gi];
			assert.ok(Board.groupGoodLight(group, startLight) < group.need, label + ' group ' + gi + ' pre-satisfied');
		}
		const refs = g.grid.slice();
		const diags = g.grid.map(c => c.diag);
		Board.applyTurns(g, g.solutionTurns);
		g.laserCol = g.solutionLaser;
		Board.updateLaser(g);
		Optics.trace(g);
		assert.ok(Board.isSolved(g), label + ' witness');
		Board.applyTurns(g, g.startTurns);
		g.laserCol = g.solutionLaser;
		Board.updateLaser(g);
		Optics.trace(g);
		for (let i = 0; i < g.grid.length; i++) {
			assert.strictEqual(g.grid[i], refs[i], label + ' restore ref ' + i);
			assert.strictEqual(g.grid[i].diag, diags[i], label + ' restore diag ' + i);
		}
	}
}

for (const difficulty of [0, 0.5, 1]) {
	testGenerated('quarter', true, difficulty, 200);
	testGenerated('shift', true, difficulty, 200);
}

console.log('engine_smoke ok');