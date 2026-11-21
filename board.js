// owns: board geometry, ring strides and player moves
// edit for: stride table, corner rule, center flip, emitter range

const BOARD_N = 15;
const GLASS = 7;
const GLASS_OFF = 4;
const CENTER_CELL = (GLASS * GLASS) >> 1;
const MODE_QUARTER = 0;
const MODE_SINGLE = 1;
// tile bits: 0-2 reflect mask (0 = clear), 3 = diagonal (0 '/', 1 '\')
const TILE_DIAG = 8;
const EMITTER_MIN = 1;
const EMITTER_MAX = 13;
const EMITTER_MID = 7;

const RING_SIDE = [7, 5, 3, 1];

function buildRing(side) {
	const cells = new Int8Array(4 * (side - 1));
	if (side === 1) return cells;
	const off = (GLASS - side) >> 1;
	let i = 0;
	for (let c = 0; c < side; c++) cells[i++] = off * GLASS + off + c;
	for (let r = 1; r < side; r++) cells[i++] = (off + r) * GLASS + off + side - 1;
	for (let c = side - 2; c >= 0; c--) cells[i++] = (off + side - 1) * GLASS + off + c;
	for (let r = side - 2; r >= 1; r--) cells[i++] = (off + r) * GLASS + off;
	return cells;
}

const RING_CELLS = RING_SIDE.map(buildRing);
const ringScratch = new Int8Array(24);

// rotation only; diagonal flips belong to shiftRing
function permuteRing(arr, ring, step) {
	const cells = RING_CELLS[ring];
	const n = cells.length;
	if (!n) return;
	for (let s = 0; s < n; s++) ringScratch[s] = arr[cells[s]];
	for (let s = 0; s < n; s++) {
		const to = ((s + step) % n + n) % n;
		arr[cells[to]] = ringScratch[s];
	}
}

function stepSlots(mode, side) {
	return mode === MODE_QUARTER ? side - 1 : 1;
}

// corner rule (plan 0.1): marked edges leave corner slots, traversal flips either way;
// a quarter turn crosses one per tile, a single step only from a corner slot (cw) or into one (ccw)
function crossesMarked(from, side, mode, dir) {
	if (mode === MODE_QUARTER) return true;
	const e = side - 1;
	return dir > 0 ? from % e === 0 : from % e === 1;
}

function flipDiag(tiles, cell) {
	const t = tiles[cell];
	if (t & 7) tiles[cell] = t ^ TILE_DIAG;
}

function shiftRing(puzzle, ring, dir) {
	const side = RING_SIDE[ring];
	if (side === 1) return flipDiag(puzzle.tiles, CENTER_CELL);
	const cells = RING_CELLS[ring];
	if (puzzle.corner) {
		for (let s = 0; s < cells.length; s++) {
			if (crossesMarked(s, side, puzzle.mode, dir)) flipDiag(puzzle.tiles, cells[s]);
		}
	}
	permuteRing(puzzle.tiles, ring, dir * stepSlots(puzzle.mode, side));
}

function stepEmitter(puzzle, dir) {
	puzzle.emitter = Math.max(EMITTER_MIN, Math.min(EMITTER_MAX, puzzle.emitter + dir));
}

function setEmitter(puzzle, col) {
	puzzle.emitter = Math.max(EMITTER_MIN, Math.min(EMITTER_MAX, col));
}

function createPuzzle(mode, corner) {
	return {
		mode,
		corner,
		tiles: new Uint8Array(GLASS * GLASS),
		start: new Uint8Array(GLASS * GLASS),
		emitter: EMITTER_MID,
		startEmitter: EMITTER_MID
	};
}

function commitStart(puzzle) {
	puzzle.start.set(puzzle.tiles);
	puzzle.startEmitter = puzzle.emitter;
}

function restartPuzzle(puzzle) {
	puzzle.tiles.set(puzzle.start);
	puzzle.emitter = puzzle.startEmitter;
}

if (typeof module !== 'undefined') module.exports = {
	BOARD_N,
	GLASS,
	GLASS_OFF,
	CENTER_CELL,
	MODE_QUARTER,
	MODE_SINGLE,
	TILE_DIAG,
	EMITTER_MIN,
	EMITTER_MAX,
	EMITTER_MID,
	RING_SIDE,
	RING_CELLS,
	createPuzzle,
	commitStart,
	restartPuzzle,
	shiftRing,
	permuteRing,
	stepSlots,
	stepEmitter,
	setEmitter
};
