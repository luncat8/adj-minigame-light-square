// owns: 0.1 move invariant fixtures — strides, laps, corner flips, inverse, emitter
// run: node experiments/move_fixtures.js

const board = require('../board.js');
const c = require('./check.js');

function freshTiles() {
	const t = new Uint8Array(49);
	for (let i = 0; i < 49; i++) t[i] = ((i % 7) + 1) | ((i >> 1) & 1 ? 8 : 0);
	return t;
}

function puzzle(mode, corner) {
	const p = board.createPuzzle(mode, corner);
	p.tiles.set(freshTiles());
	board.commitStart(p);
	return p;
}

function idArr() {
	const a = new Int8Array(49);
	for (let i = 0; i < 49; i++) a[i] = i;
	return a;
}

// ring table: slot counts and corner slots of the 0.1 enumeration
c.eq(board.RING_CELLS[0].length, 24, 'ring7 slots');
c.eq(board.RING_CELLS[1].length, 16, 'ring5 slots');
c.eq(board.RING_CELLS[2].length, 8, 'ring3 slots');
c.eq(board.RING_CELLS[0][0], 0, 'ring7 top-left corner');
c.eq(board.RING_CELLS[0][6], 6, 'ring7 top-right corner');
c.eq(board.RING_CELLS[0][12], 48, 'ring7 bottom-right corner');
c.eq(board.RING_CELLS[0][18], 42, 'ring7 bottom-left corner');
c.eq(board.RING_CELLS[1][0], 8, 'ring5 top-left corner');
c.eq(board.RING_CELLS[1][4], 12, 'ring5 top-right corner');
c.eq(board.RING_CELLS[1][8], 40, 'ring5 bottom-right corner');
c.eq(board.RING_CELLS[1][12], 36, 'ring5 bottom-left corner');
c.eq(board.RING_CELLS[2][0], 16, 'ring3 top-left corner');
c.eq(board.RING_CELLS[2][4], 32, 'ring3 bottom-right corner');
c.eq(board.CENTER_CELL, 24, 'center cell index');

// strides: quarter step moves each tile side-1 slots, single step moves one
function strideOk(ring, step, msg) {
	const cells = board.RING_CELLS[ring];
	const n = cells.length;
	const a = idArr();
	const orig = idArr();
	board.permuteRing(a, ring, step);
	let h = true;
	for (let s = 0; s < n; s++) {
		if (a[cells[(s + step) % n]] !== orig[cells[s]]) h = false;
	}
	c.ok(h, msg);
}
strideOk(0, 6, 'ring7 quarter stride 6');
strideOk(1, 4, 'ring5 quarter stride 4');
strideOk(2, 2, 'ring3 quarter stride 2');
strideOk(0, 1, 'ring7 single stride 1');

// laps: four quarter turns, or one single-slot lap, restore every position
function lapOk(ring, step, moves, msg) {
	const a = idArr();
	for (let i = 0; i < moves; i++) board.permuteRing(a, ring, step);
	c.same(a, idArr(), msg);
}
lapOk(0, 6, 4, 'ring7 quarter lap');
lapOk(0, 1, 24, 'ring7 single lap');
lapOk(1, 4, 4, 'ring5 quarter lap');
lapOk(1, 1, 16, 'ring5 single lap');
lapOk(2, 2, 4, 'ring3 quarter lap');
lapOk(2, 1, 8, 'ring3 single lap');

// a move never touches cells outside its ring
const stray = idArr();
const strayOrig = idArr();
board.permuteRing(stray, 0, 6);
let h = true;
for (let i = 0; i < 49; i++) {
	let onRing = false;
	for (let s = 0; s < 24; s++) if (board.RING_CELLS[0][s] === i) onRing = true;
	if (!onRing && stray[i] !== strayOrig[i]) h = false;
}
c.ok(h, 'cells off the moved ring keep identity');

// a quarter turn equals its single-step equivalent (0.1)
for (let r = 0; r < 3; r++) {
	const side = board.RING_SIDE[r];
	for (let d = -1; d <= 1; d += 2) {
		for (let k = 0; k < 2; k++) {
			const corner = !!k;
			const q = puzzle(board.MODE_QUARTER, corner);
			board.shiftRing(q, r, d);
			const s = puzzle(board.MODE_SINGLE, corner);
			for (let i = 0; i < side - 1; i++) board.shiftRing(s, r, d);
			c.same(q.tiles, s.tiles, 'quarter==single r=' + r + ' d=' + d + ' corner=' + corner);
		}
	}
}

// move then inverse restores every tile, diagonal and mask
for (let m = 0; m < 2; m++) {
	for (let k = 0; k < 2; k++) {
		for (let r = 0; r < 4; r++) {
			for (let d = -1; d <= 1; d += 2) {
				const p = puzzle(m, !!k);
				board.shiftRing(p, r, d);
				board.shiftRing(p, r, -d);
				c.same(p.tiles, p.start, 'inverse m=' + m + ' k=' + k + ' r=' + r + ' d=' + d);
			}
		}
	}
}

// a mixed sequence reverses exactly (scramble safety for 0.4)
const seq = [[0, 1], [1, -1], [2, 1], [3, 1], [0, -1], [1, 1], [2, -1], [3, -1]];
const sq = puzzle(board.MODE_QUARTER, true);
for (let i = 0; i < seq.length; i++) board.shiftRing(sq, seq[i][0], seq[i][1]);
for (let i = seq.length - 1; i >= 0; i--) board.shiftRing(sq, seq[i][0], -seq[i][1]);
c.same(sq.tiles, sq.start, 'sequence inverse');

// corner rule: marked edges leave corner slots — count flips per move (0.1)
function flipCount(ring, mode, corner, dir) {
	const p = board.createPuzzle(mode, corner);
	p.tiles.fill(7);
	board.commitStart(p);
	board.shiftRing(p, ring, dir);
	const cells = board.RING_CELLS[ring];
	let n = 0;
	for (let s = 0; s < cells.length; s++) if (p.tiles[cells[s]] & 8) n++;
	return n;
}
c.eq(flipCount(0, board.MODE_QUARTER, true, 1), 24, 'quarter cw flips every ring7 tile');
c.eq(flipCount(0, board.MODE_QUARTER, true, -1), 24, 'quarter ccw flips every ring7 tile');
c.eq(flipCount(0, board.MODE_QUARTER, false, 1), 0, 'corner off never flips');
c.eq(flipCount(0, board.MODE_SINGLE, true, 1), 4, 'single cw flips 4 corner exits');
c.eq(flipCount(0, board.MODE_SINGLE, true, -1), 4, 'single ccw flips 4 corner exits');
c.eq(flipCount(1, board.MODE_SINGLE, true, 1), 4, 'ring5 single flips');
c.eq(flipCount(2, board.MODE_SINGLE, true, 1), 4, 'ring3 single flips');

// full laps restore positions and diagonals with the corner rule on
for (let r = 0; r < 3; r++) {
	const side = board.RING_SIDE[r];
	const qp = puzzle(board.MODE_QUARTER, true);
	for (let i = 0; i < 4; i++) board.shiftRing(qp, r, 1);
	c.same(qp.tiles, qp.start, 'quarter lap restores r=' + r);
	const sp = puzzle(board.MODE_SINGLE, true);
	for (let i = 0; i < 4 * (side - 1); i++) board.shiftRing(sp, r, 1);
	c.same(sp.tiles, sp.start, 'single lap restores r=' + r);
}

// center flip: both modes, both directions, corner setting ignored; clear stays clear
for (let m = 0; m < 2; m++) {
	for (let k = 0; k < 2; k++) {
		for (let d = -1; d <= 1; d += 2) {
			const p = board.createPuzzle(m, !!k);
			p.tiles[board.CENTER_CELL] = 7 | 8;
			board.commitStart(p);
			board.shiftRing(p, 3, d);
			c.eq(p.tiles[board.CENTER_CELL], 7, 'center flips m=' + m + ' k=' + k + ' d=' + d);
			board.shiftRing(p, 3, d);
			c.eq(p.tiles[board.CENTER_CELL], 7 | 8, 'center restores m=' + m + ' k=' + k + ' d=' + d);
		}
	}
}
const clearC = board.createPuzzle(board.MODE_QUARTER, true);
board.shiftRing(clearC, 3, 1);
c.eq(clearC.tiles[board.CENTER_CELL], 0, 'clear center stays clear');
c.eq(clearC.glyphs[board.CENTER_CELL], board.GLYPH_CENTER_ALT, 'clear center still flips its relief glyph');
board.shiftRing(clearC, 3, -1);
c.eq(clearC.glyphs[board.CENTER_CELL], board.CENTER_CELL, 'second center flip restores center glyph');

// cell relief glyphs: 25 Chinese + 25 Hindi distinct symbols, script-swapping across quarter turns, reversible and restartable
c.eq(board.CELL_GLYPHS.length, 50, '50 cell glyph entries (49 cells + center flip)');
c.eq(new Set(board.CELL_GLYPHS).size, 50, 'every cell glyph is distinct');
c.eq(board.CELL_GLYPHS.filter(g => /[\u4e00-\u9fff]/.test(g)).length, 25, '25 Chinese light/mirror glyphs');
c.eq(board.CELL_GLYPHS.filter(g => /[\u0900-\u097f]/.test(g)).length, 25, '25 Hindi light/mirror glyphs');
for (let r = 0; r < 3; r++) {
	const gp = board.createPuzzle(board.MODE_QUARTER, false);
	board.shiftRing(gp, r, 1);
	let swapped = true;
	for (const cell of board.RING_CELLS[r]) {
		const wasHi = /[\u0900-\u097f]/.test(board.CELL_GLYPHS[cell]);
		const nowHi = /[\u0900-\u097f]/.test(board.CELL_GLYPHS[gp.glyphs[cell]]);
		if (wasHi === nowHi) swapped = false;
	}
	c.ok(swapped, 'quarter turn swaps script on every ring ' + r + ' cell');
	for (let i = 0; i < 3; i++) board.shiftRing(gp, r, 1);
	c.same(gp.glyphs, gp.startGlyphs, 'quarter lap restores glyphs r=' + r);
}

// outer ring moves leave the center alone
const ringC = puzzle(board.MODE_QUARTER, true);
const centerBefore = ringC.tiles[board.CENTER_CELL];
board.shiftRing(ringC, 0, 1);
c.eq(ringC.tiles[board.CENTER_CELL], centerBefore, 'ring move leaves center');

// emitter stops and restart (0.1)
const em = board.createPuzzle(board.MODE_QUARTER, false);
em.emitter = 1;
board.stepEmitter(em, -1);
c.eq(em.emitter, 1, 'emitter low stop');
em.emitter = 13;
board.stepEmitter(em, 1);
c.eq(em.emitter, 13, 'emitter high stop');
board.stepEmitter(em, -1);
c.eq(em.emitter, 12, 'emitter steps back');
board.setEmitter(em, 5);
c.eq(em.emitter, 5, 'emitter set');
board.setEmitter(em, 99);
c.eq(em.emitter, 13, 'set clamps high');
board.setEmitter(em, 0);
c.eq(em.emitter, 1, 'set clamps low');

const rs = puzzle(board.MODE_SINGLE, true);
board.shiftRing(rs, 1, 1);
rs.tiles[0] = 0;
rs.emitter = 3;
board.commitStart(rs);
const committedGlyph8 = rs.glyphs[8];
rs.tiles[48] = 0;
rs.emitter = 9;
board.shiftRing(rs, 1, 1);
board.restartPuzzle(rs);
c.eq(rs.emitter, 3, 'restart restores emitter');
c.eq(rs.tiles[0], 0, 'restart keeps committed tiles');
c.eq(rs.glyphs[8], committedGlyph8, 'restart restores committed glyphs');
c.eq(rs.tiles[48], freshTiles()[48], 'restart drops later edits');

c.report('move_fixtures');
