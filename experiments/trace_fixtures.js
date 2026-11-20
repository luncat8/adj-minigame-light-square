// owns: 0.2 light transport fixtures — empty board, diagonals, split, combine, bottom, loop, order
// run: node experiments/trace_fixtures.js

const trace = require('../trace.js');
const board = require('../board.js');
const c = require('./check.js');

const N = board.BOARD_N;
const UP = trace.DIR_UP;
const RIGHT = trace.DIR_RIGHT;
const DOWN = trace.DIR_DOWN;
const LEFT = trace.DIR_LEFT;

function zeroTiles() {
	return new Uint8Array(49);
}

function flat(r, cc) {
	return r * N + cc;
}

function g(r, cc) {
	return (r - board.GLASS_OFF) * board.GLASS + (cc - board.GLASS_OFF);
}

function recv(r, cc) {
	return trace.traceRecv[flat(r, cc)];
}

function seg(r, cc, dir) {
	return trace.traceSeg[flat(r, cc) * 4 + dir];
}

function putMirror(tiles, r, cc, diag, mask) {
	tiles[g(r, cc)] = mask | (diag ? 8 : 0);
}

function onlyHit(r, cc, want, msg) {
	const hits = [];
	for (let i = 0; i < trace.traceRecv.length; i++) if (trace.traceRecv[i]) hits.push(i);
	c.eq(hits.length, 1, msg + ' hit count');
	if (hits.length !== 1) return;
	c.eq(hits[0], flat(r, cc), msg + ' hit cell');
	c.eq(trace.traceRecv[hits[0]], want, msg + ' hit mask');
}

function hitCount() {
	let n = 0;
	for (let i = 0; i < trace.traceRecv.length; i++) if (trace.traceRecv[i]) n++;
	return n;
}

// empty board: one white beam straight up, emission itself hits nothing
const empty = zeroTiles();
trace.traceLight(empty, 7);
onlyHit(0, 7, 7, 'empty board');
for (let r = 1; r <= 13; r++) c.eq(seg(r, 7, UP), 7, 'empty beam up r=' + r);
c.eq(recv(13, 7), 0, 'emission cell not a receiver');
c.eq(recv(14, 7), 0, 'bottom under emitter dark');

// both diagonals from all four sides (0.2 acceptance)
const diagCases = [
	[8, 7, UP, 0, 7, 14],
	[7, 6, RIGHT, 0, 0, 7],
	[6, 7, DOWN, 0, 7, 0],
	[7, 8, LEFT, 0, 14, 7],
	[8, 7, UP, 1, 7, 0],
	[7, 6, RIGHT, 1, 14, 7],
	[6, 7, DOWN, 1, 7, 14],
	[7, 8, LEFT, 1, 0, 7]
];
for (let i = 0; i < diagCases.length; i++) {
	const cs = diagCases[i];
	const tiles = zeroTiles();
	putMirror(tiles, 7, 7, cs[3], 7);
	trace.traceReset();
	trace.traceSeed(flat(cs[0], cs[1]), cs[2], 7);
	trace.traceRun(tiles);
	onlyHit(cs[4], cs[5], 7, 'case' + i + ' diag=' + cs[3] + ' dir=' + cs[2]);
}

// split: white on '/' with R|B reflect -> magenta right, green up
const split = zeroTiles();
putMirror(split, 7, 7, 0, 5);
trace.traceReset();
trace.traceSeed(flat(8, 7), UP, 7);
trace.traceRun(split);
c.eq(hitCount(), 2, 'split two receivers');
c.eq(recv(7, 14), 5, 'split magenta right');
c.eq(recv(0, 7), 2, 'split green up');

// combined hits: one source, two colors merge on the exit segment (0.2 acceptance)
const comb = zeroTiles();
putMirror(comb, 7, 7, 0, 5);
putMirror(comb, 4, 7, 1, 7);
putMirror(comb, 4, 6, 0, 7);
putMirror(comb, 10, 6, 1, 7);
putMirror(comb, 7, 10, 1, 7);
putMirror(comb, 9, 10, 0, 7);
putMirror(comb, 9, 9, 0, 7);
putMirror(comb, 10, 9, 1, 5);
trace.traceLight(comb, 7);
onlyHit(10, 14, 7, 'combined receiver');
c.eq(seg(10, 9, RIGHT), 7, 'combined exit segment');

// return to the bottom border
const back = zeroTiles();
putMirror(back, 7, 7, 0, 7);
putMirror(back, 7, 9, 1, 7);
trace.traceLight(back, 7);
onlyHit(14, 9, 7, 'return to bottom');

// closed loop: the seed circulates until visited drops it; no receiver ever lights
const loop = zeroTiles();
putMirror(loop, 6, 6, 0, 7);
putMirror(loop, 6, 7, 1, 7);
putMirror(loop, 7, 7, 0, 7);
putMirror(loop, 7, 6, 1, 7);
trace.traceReset();
trace.traceSeed(flat(6, 6), UP, 7);
trace.traceRun(loop);
c.eq(hitCount(), 0, 'closed loop reaches no receiver');
c.eq(seg(6, 6, RIGHT), 7, 'loop edge 1');
c.eq(seg(6, 7, DOWN), 7, 'loop edge 2');
c.eq(seg(7, 7, LEFT), 7, 'loop edge 3');
c.eq(seg(7, 6, UP), 7, 'loop edge 4');

// queue order cannot change results: seed arrival order swapped
const orderTiles = zeroTiles();
putMirror(orderTiles, 7, 7, 0, 5);
function orderRun(first) {
	trace.traceReset();
	if (first === 0) {
		trace.traceSeed(flat(8, 7), UP, 1);
		trace.traceSeed(flat(8, 7), UP, 6);
	} else {
		trace.traceSeed(flat(8, 7), UP, 6);
		trace.traceSeed(flat(8, 7), UP, 1);
	}
	trace.traceRun(orderTiles);
	return [Uint8Array.from(trace.traceRecv), Uint8Array.from(trace.traceSeg)];
}
const o1 = orderRun(0);
const o2 = orderRun(1);
let h = true;
for (let i = 0; i < o1[0].length; i++) if (o1[0][i] !== o2[0][i]) h = false;
for (let i = 0; i < o1[1].length; i++) if (o1[1][i] !== o2[1][i]) h = false;
c.ok(h, 'seed order leaves identical results');
c.eq(o1[0][flat(0, 7)], 2, 'order run green up');
c.eq(o1[0][flat(7, 14)], 5, 'order run red+blue right');

c.report('trace_fixtures');
