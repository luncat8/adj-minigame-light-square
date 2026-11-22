// owns: 0.2/0.7 light transport and event stream fixtures — empty board, diagonals, split, combine, bottom, loop, order, depth/branch/bend
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

// 0.7 event stream: unpack helper + nondecreasing depth check
function readEvents() {
	const out = [];
	for (let i = 0; i < trace.traceEvN; i++) {
		const info = trace.traceEvInfo[i];
		out.push({
			cell: trace.traceEvCell[i],
			depth: trace.traceEvDepth[i],
			branch: trace.traceEvBranch[i],
			fork: trace.traceEvFork[i],
			kind: info & 7,
			dir: (info >>> 3) & 3,
			passCh: (info >>> 5) & 7,
			refCh: (info >>> 8) & 7,
			refDir: (info >>> 11) & 3
		});
	}
	return out;
}

function nondecreasingDepth(evs) {
	for (let i = 1; i < evs.length; i++) if (evs[i].depth < evs[i - 1].depth) return false;
	return true;
}

// outer empty column (col 2 misses glass): zero interior events, one absorb at depth 14
trace.traceLight(empty, 2);
let evs = readEvents();
c.eq(evs.length, 1, 'empty outer column logs only one absorb');
c.ok(evs[0].kind === trace.EV_ABSORB && evs[0].cell === flat(0, 2) && evs[0].depth === 14 && evs[0].passCh === 7, 'empty outer column absorb at depth 14');

// center empty column (col 7 crosses 7 clear glass cells at depths 4..10, absorbs at depth 14)
trace.traceLight(empty, 7);
evs = readEvents();
c.eq(evs.length, 8, 'empty glass column logs 7 clear glass + 1 absorb');
c.ok(nondecreasingDepth(evs), 'empty glass column depth nondecreasing');
c.ok(evs[0].kind === trace.EV_GLASS && evs[0].depth === 4 && evs[6].kind === trace.EV_GLASS && evs[6].depth === 10, 'clear glass depths 4..10');
c.ok(evs[7].kind === trace.EV_ABSORB && evs[7].depth === 14 && evs[7].branch === 0, 'glass column absorb at depth 14 on branch 0');

// full mirror turn signs across all 8 (dir, diag) combinations: left = +1, right = -1
const wantTurns = [-1, 1, -1, 1, 1, -1, 1, -1];
for (let i = 0; i < diagCases.length; i++) {
	const cs = diagCases[i];
	const tiles = zeroTiles();
	putMirror(tiles, 7, 7, cs[3], 7);
	trace.traceReset();
	trace.traceSeed(flat(cs[0], cs[1]), cs[2], 7);
	trace.traceRun(tiles);
	evs = readEvents();
	const refl = evs.find(e => e.cell === flat(7, 7));
	c.ok(!!refl && refl.kind === trace.EV_REFLECT && refl.passCh === 0 && refl.refCh === 7, 'reflect event case ' + i);
	c.eq(trace.traceTurn(refl.dir, refl.refDir), wantTurns[i], 'reflect turn sign case ' + i);
	c.ok(nondecreasingDepth(evs), 'reflect case depth nondecreasing ' + i);
}

// filter pass: green (2) through R|B (5) mirror logs EV_FILTER with zero bounce
trace.traceReset();
trace.traceSeed(flat(8, 7), UP, 2);
trace.traceRun(split);
evs = readEvents();
const filt = evs.find(e => e.cell === flat(7, 7));
c.ok(!!filt && filt.kind === trace.EV_FILTER && filt.passCh === 2 && filt.refCh === 0, 'disjoint mask logs EV_FILTER');
c.eq(trace.traceBounce[flat(6, 7) * 4 + UP], 0, 'filter pass adds no bounce');

// split: white on R|B '/' keeps branch 0 on straight green ray and forks branch 1 on reflected magenta ray
trace.traceLight(split, 7);
evs = readEvents();
c.ok(nondecreasingDepth(evs), 'split depth nondecreasing');
const sp = evs.find(e => e.cell === flat(7, 7));
c.ok(!!sp && sp.kind === trace.EV_SPLIT && sp.passCh === 2 && sp.refCh === 5 && sp.branch === 0 && sp.fork === 1, 'split logs both channel sets and fork branch');
const topAbs = evs.find(e => e.kind === trace.EV_ABSORB && e.cell === flat(0, 7));
const rightAbs = evs.find(e => e.kind === trace.EV_ABSORB && e.cell === flat(7, 14));
c.ok(!!topAbs && topAbs.branch === 0 && topAbs.passCh === 2, 'continuing split ray keeps parent branch 0');
c.ok(!!rightAbs && rightAbs.branch === 1 && rightAbs.passCh === 5, 'diverging split ray takes fresh branch 1');

// early border absorb + deeper interior reflections stay in nondecreasing depth order
const mixedDepth = zeroTiles();
putMirror(mixedDepth, 10, 4, 0, 1);
putMirror(mixedDepth, 10, 10, 1, 1);
putMirror(mixedDepth, 4, 10, 0, 1);
trace.traceLight(mixedDepth, 4);
evs = readEvents();
c.ok(nondecreasingDepth(evs), 'early border absorb before deeper interior mirrors keeps nondecreasing depth');

// bend accumulation + return-to-bottom absorb
trace.traceLight(back, 7);
evs = readEvents();
const botAbs = evs[evs.length - 1];
c.ok(botAbs.kind === trace.EV_ABSORB && botAbs.cell === flat(14, 9) && Math.floor(botAbs.cell / N) === 14, 'return to bottom logs EV_ABSORB on row 14');
c.eq(trace.traceBend[flat(14, 9) * 4 + DOWN], -2, 'two right turns accumulate bend -2');
c.eq(trace.traceBounce[flat(14, 9) * 4 + DOWN], 2, 'two right turns accumulate bounce 2');

// merge determinism: in comb, magenta (5 bounces: -1,-1,-1,+1,+1 = bend -1) reaches (10, 10, RIGHT) before green (3 bounces, bend +3)
trace.traceLight(comb, 7);
evs = readEvents();
c.ok(nondecreasingDepth(evs), 'combined merge depth nondecreasing');
c.eq(trace.traceBend[flat(10, 10) * 4 + RIGHT], -1, 'merge keeps first-arriving parent bend');
c.eq(trace.traceBounce[flat(10, 10) * 4 + RIGHT], 5, 'merge keeps first-arriving parent bounce');

// equal-depth merge: seed order picks first parent deterministically
const eqMerge = zeroTiles();
putMirror(eqMerge, 7, 6, 0, 1);
putMirror(eqMerge, 7, 8, 1, 2);
putMirror(eqMerge, 6, 7, 0, 0);
trace.traceReset();
trace.traceSeed(flat(7, 5), RIGHT, 1, 1, 0, 3, 1);
trace.traceSeed(flat(7, 9), LEFT, 2, 1, 1, -5, 4);
putMirror(eqMerge, 7, 7, 0, 1);
trace.traceReset();
trace.traceSeed(flat(8, 7), UP, 2, 1, 0, 5, 2);
trace.traceSeed(flat(7, 6), RIGHT, 1, 1, 1, -3, 4);
trace.traceRun(eqMerge);
c.eq(trace.traceBend[flat(6, 7) * 4 + UP], 5, 'equal-depth merge keeps first enqueued parent bend');
c.eq(trace.traceBounce[flat(6, 7) * 4 + UP], 2, 'equal-depth merge keeps first enqueued parent bounce');

// closed loop: visited dedups events after one lap
trace.traceReset();
trace.traceSeed(flat(6, 6), UP, 7);
trace.traceRun(loop);
c.eq(trace.traceEvN, 4, 'closed loop emits one reflect per corner then dedups');

c.report('trace_fixtures');
