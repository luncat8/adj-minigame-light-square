// owns: board geometry, ring strides, cell relief glyph map and player moves
// edit for: stride table, corner rule, center flip, cell glyph table, emitter range

const BOARD_N = 15;
const GLASS = 7;
const GLASS_OFF = 4;
const CENTER_CELL = (GLASS * GLASS) >> 1;
const GLYPH_CENTER_ALT = GLASS * GLASS;
const SHADE_STEPS = 16;
const MODE_QUARTER = 0;
const MODE_SINGLE = 1;
// tile bits: 0-2 reflect mask (0 = clear), 3 = diagonal (0 '/', 1 '\')
const TILE_DIAG = 8;
const EMITTER_MIN = 1;
const EMITTER_MAX = 13;
const EMITTER_MID = 7;

const RING_SIDE = [7, 5, 3, 1];
const GLYPH_ZH = [
	'日', '阳', '明', '旭', '晃', '晖', '映', '照', '影', '镜', '棱', '晶',
	'玻', '璃', '激', '束', '射', '折', '线', '芒', '辉', '烁', '炫', '虹', '光'
];
const GLYPH_HI = [
	'रवि', 'भानु', 'अर्क', 'तेज', 'आभा', 'प्रभा', 'द्युति', 'ज्योति', 'दीप्ति', 'अंशु', 'रश्मि', 'किरण',
	'भास', 'बिंब', 'छाया', 'दर्पण', 'काँच', 'मणि', 'वर्ण', 'रंग', 'दीप', 'शिखा', 'कांति', 'ऊर्जा', 'सूर्य'
];

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

// alternates Chinese and Hindi along edges and across quarter-turn images so both 1-slot and quarter moves visibly swap glyphs
function buildCellGlyphs() {
	const out = new Array(GLYPH_CENTER_ALT + 1);
	let zh = 0;
	let hi = 0;
	for (let r = 0; r < 3; r++) {
		const cells = RING_CELLS[r];
		const edge = RING_SIDE[r] - 1;
		for (let s = 0; s < cells.length; s++) {
			const useHi = (((s / edge) | 0) + (s & 1)) & 1;
			out[cells[s]] = useHi ? GLYPH_HI[hi++] : GLYPH_ZH[zh++];
		}
	}
	out[CENTER_CELL] = GLYPH_ZH[zh];
	out[GLYPH_CENTER_ALT] = GLYPH_HI[hi];
	return out;
}

const CELL_GLYPHS = buildCellGlyphs();

function buildCellShade() {
	const out = new Uint8Array(GLYPH_CENTER_ALT + 1);
	for (let i = 0; i < out.length; i++) {
		let h = Math.imul(i + 1, 0x9e3779b1) >>> 0;
		h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
		out[i] = ((h ^ (h >>> 13)) >>> 0) % SHADE_STEPS;
	}
	return out;
}

const CELL_SHADE = buildCellShade();

// quarter turns carry each strip of side-1 slots onto the next side; tints follow tile identity via glyphs
function buildCellSide() {
	const out = new Uint8Array(GLYPH_CENTER_ALT + 1);
	for (let r = 0; r < 3; r++) {
		const cells = RING_CELLS[r];
		const seg = RING_SIDE[r] - 1;
		for (let s = 0; s < cells.length; s++) out[cells[s]] = (s / seg) | 0;
	}
	out[CENTER_CELL] = 4;
	out[GLYPH_CENTER_ALT] = 4;
	return out;
}

const CELL_SIDE = buildCellSide();

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

function flipCenterGlyph(glyphs) {
	glyphs[CENTER_CELL] = glyphs[CENTER_CELL] === CENTER_CELL ? GLYPH_CENTER_ALT : CENTER_CELL;
}

function shiftRing(puzzle, ring, dir) {
	const side = RING_SIDE[ring];
	if (side === 1) {
		if (puzzle.glyphs) flipCenterGlyph(puzzle.glyphs);
		return flipDiag(puzzle.tiles, CENTER_CELL);
	}
	const cells = RING_CELLS[ring];
	if (puzzle.corner) {
		for (let s = 0; s < cells.length; s++) {
			if (crossesMarked(s, side, puzzle.mode, dir)) flipDiag(puzzle.tiles, cells[s]);
		}
	}
	const step = dir * stepSlots(puzzle.mode, side);
	permuteRing(puzzle.tiles, ring, step);
	if (puzzle.glyphs) permuteRing(puzzle.glyphs, ring, step);
}

function stepEmitter(puzzle, dir) {
	puzzle.emitter = Math.max(EMITTER_MIN, Math.min(EMITTER_MAX, puzzle.emitter + dir));
}

function setEmitter(puzzle, col) {
	puzzle.emitter = Math.max(EMITTER_MIN, Math.min(EMITTER_MAX, col));
}

function createPuzzle(mode, corner) {
	const glyphs = new Uint8Array(GLASS * GLASS);
	const startGlyphs = new Uint8Array(GLASS * GLASS);
	for (let i = 0; i < glyphs.length; i++) {
		glyphs[i] = i;
		startGlyphs[i] = i;
	}
	return {
		mode,
		corner,
		tiles: new Uint8Array(GLASS * GLASS),
		start: new Uint8Array(GLASS * GLASS),
		glyphs,
		startGlyphs,
		emitter: EMITTER_MID,
		startEmitter: EMITTER_MID
	};
}

function commitStart(puzzle) {
	puzzle.start.set(puzzle.tiles);
	if (puzzle.glyphs && puzzle.startGlyphs) puzzle.startGlyphs.set(puzzle.glyphs);
	puzzle.startEmitter = puzzle.emitter;
}

function restartPuzzle(puzzle) {
	puzzle.tiles.set(puzzle.start);
	if (puzzle.glyphs && puzzle.startGlyphs) puzzle.glyphs.set(puzzle.startGlyphs);
	puzzle.emitter = puzzle.startEmitter;
}

if (typeof module !== 'undefined') module.exports = {
	BOARD_N,
	GLASS,
	GLASS_OFF,
	CENTER_CELL,
	GLYPH_CENTER_ALT,
	SHADE_STEPS,
	CELL_GLYPHS,
	CELL_SHADE,
	CELL_SIDE,
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
