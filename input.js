// owns: pointer, wheel detent quantizing, drag gestures and control button bindings
// edit for: bindings, drag and wheel tuning, hit rules

const iBoard = typeof module !== 'undefined' && module.exports ? require('./board.js') : null;
const iGame = typeof module !== 'undefined' && module.exports ? require('./game.js') : null;
const iRender = typeof module !== 'undefined' && module.exports ? require('./render.js') : null;

const iN = iBoard ? iBoard.BOARD_N : BOARD_N;
const iGlass = iBoard ? iBoard.GLASS : GLASS;
const iGlassOff = iBoard ? iBoard.GLASS_OFF : GLASS_OFF;
const iCenter = iBoard ? iBoard.CENTER_CELL : CENTER_CELL;
const iRings = iBoard ? iBoard.RING_CELLS : RING_CELLS;
const iSide = iBoard ? iBoard.RING_SIDE : RING_SIDE;
const iMin = iBoard ? iBoard.EMITTER_MIN : EMITTER_MIN;
const iMax = iBoard ? iBoard.EMITTER_MAX : EMITTER_MAX;
const gNew = iGame ? iGame.gameNew : gameNew;
const gRestart = iGame ? iGame.gameRestart : gameRestart;
const gMove = iGame ? iGame.gameMoveRing : gameMoveRing;
const gStride = iGame ? iGame.gameStride : gameStride;
const gStep = iGame ? iGame.gameEmitterStep : gameEmitterStep;
const gSetE = iGame ? iGame.gameSetEmitter : gameSetEmitter;
const gPrevStart = iGame ? iGame.gamePreviewStart : gamePreviewStart;
const gPrevEnd = iGame ? iGame.gamePreviewEnd : gamePreviewEnd;
const gRepublish = iGame ? iGame.gameRepublish : gameRepublish;
const gBand = iGame ? iGame.gameBandLabel : gameBandLabel;
const iCell = iRender ? iRender.renderPointToCell : renderPointToCell;
const iSelect = iRender ? iRender.renderSetSelection : renderSetSelection;

let iRoot = null;
let cellRing = null;
let selected = -1;
const gest = { pointer: -1, kind: '', ring: -1, cx: 0, cy: 0, prev: 0, acc: 0 };
const iPt = { x: 0, y: 0 };

const WHEEL_GAP_MS = 120;
const WHEEL_LEARN_MS = 200;
const WHEEL_MID = 0.5;
const WHEEL_LINE_PX = 100 / 3;
const WHEEL_PAGE_PX = 800;
const WHEEL_UNIT_PX = [1, WHEEL_LINE_PX, WHEEL_PAGE_PX];
const wheel = { dir: 0, first: 0, last: -Infinity, sum: 0, acc: 0, notch: 100, n: 0, head: 0 };
const wheelSamples = new Float64Array(8);
const wheelSorted = new Float64Array(8);

function inputInit(root) {
	iRoot = root;
	// ring cells are glass-local (49 cells); map them onto board coordinates
	const ringOf = new Int8Array(iGlass * iGlass).fill(-1);
	for (let ring = 0; ring < 3; ring++) {
		const cells = iRings[ring];
		for (let i = 0; i < cells.length; i++) ringOf[cells[i]] = ring;
	}
	ringOf[iCenter] = 3;
	cellRing = new Int8Array(iN * iN).fill(-1);
	for (let r = 0; r < iGlass; r++) {
		for (let c = 0; c < iGlass; c++) cellRing[(r + iGlassOff) * iN + (c + iGlassOff)] = ringOf[r * iGlass + c];
	}
	root.addEventListener('pointerdown', onDown);
	root.addEventListener('pointermove', onMove);
	root.addEventListener('pointerup', onUp);
	root.addEventListener('pointercancel', onUp);
	root.addEventListener('wheel', onWheel, { passive: false });
	bindButton('btn-left', () => gStep(-1));
	bindButton('btn-right', () => gStep(1));
	bindButton('btn-generate', () => gNew());
	bindButton('btn-restart', () => gRestart());
	bindPreview();
	bindHints();
	const bandEl = $('band');
	const syncBand = () => { $('band-label').textContent = gBand(bandEl.value); };
	bandEl.addEventListener('input', syncBand);
	syncBand();
	select(0);
	if (typeof window !== 'undefined') window.addEventListener('blur', () => gPrevEnd());
}

function bindButton(id, fn) {
	$(id).addEventListener('click', fn);
}

// hover-enter or press holds the preview; each new entry or press restarts it
function bindPreview() {
	const btn = $('btn-preview');
	btn.addEventListener('pointerenter', () => gPrevStart());
	btn.addEventListener('pointerdown', () => gPrevStart());
	btn.addEventListener('pointerleave', () => gPrevEnd());
	btn.addEventListener('pointerup', () => gPrevEnd());
	btn.addEventListener('pointercancel', () => gPrevEnd());
	btn.addEventListener('blur', () => gPrevEnd());
	btn.addEventListener('keydown', e => {
		if (e.key !== ' ' && e.key !== 'Enter') return;
		e.preventDefault();
		gPrevStart();
	});
	btn.addEventListener('keyup', e => {
		if (e.key !== ' ' && e.key !== 'Enter') return;
		gPrevEnd();
	});
}

function bindHints() {
	$('hint-current').addEventListener('change', () => gRepublish());
	$('hint-discoveries').addEventListener('change', () => gRepublish());
	$('hint-targets').addEventListener('change', () => gRepublish());
}

function select(ring) {
	if (ring === selected) return;
	selected = ring;
	iSelect(ring);
}

function ringAt(cell) {
	return cellRing[cell.row * iN + cell.col];
}

function onDown(e) {
	if (gest.pointer >= 0) return;
	const cell = iCell(e.clientX, e.clientY);
	if (!cell) return;
	if (cell.row === iN - 1 && cell.col >= iMin && cell.col <= iMax) {
		gest.pointer = e.pointerId;
		gest.kind = 'emitter';
		gSetE(cell.col);
		iRoot.setPointerCapture(e.pointerId);
		return;
	}
	const ring = ringAt(cell);
	if (ring < 0) return;
	select(ring);
	if (ring === 3) {
		gMove(3, 1);
		return;
	}
	gest.pointer = e.pointerId;
	iRoot.setPointerCapture(e.pointerId);
	gest.kind = 'ring';
	gest.ring = ring;
	const mid = iRoot.width / 2;
	gest.cx = mid;
	gest.cy = mid;
	const pt = canvasPoint(e);
	gest.prev = Math.atan2(pt.y - mid, pt.x - mid);
	gest.acc = 0;
}

function onMove(e) {
	const cell = iCell(e.clientX, e.clientY);
	if (gest.pointer < 0) {
		if (cell) select(ringAt(cell));
		return;
	}
	if (e.pointerId !== gest.pointer || !cell) return;
	if (gest.kind === 'emitter') {
		gSetE(cell.col);
		return;
	}
	if (gest.kind !== 'ring') return;
	const pt = canvasPoint(e);
	const a = Math.atan2(pt.y - gest.cy, pt.x - gest.cx);
	let da = a - gest.prev;
	if (da > Math.PI) da -= 2 * Math.PI;
	else if (da < -Math.PI) da += 2 * Math.PI;
	gest.prev = a;
	const side = iSide[gest.ring];
	gest.acc += da * (4 * (side - 1) / (2 * Math.PI));
	const stride = gStride(gest.ring);
	while (gest.acc >= stride) {
		gMove(gest.ring, 1);
		gest.acc -= stride;
	}
	while (gest.acc <= -stride) {
		gMove(gest.ring, -1);
		gest.acc += stride;
	}
}

function onUp(e) {
	if (e.pointerId !== gest.pointer) return;
	gest.pointer = -1;
	gest.kind = '';
}

function onWheel(e) {
	const cell = iCell(e.clientX, e.clientY);
	if (!cell) return;
	const onEmitter = cell.row === iN - 1 && cell.col >= iMin && cell.col <= iMax;
	const ring = onEmitter ? -1 : ringAt(cell);
	if (!onEmitter && ring < 0) return;
	e.preventDefault();
	if (ring >= 0) select(ring);
	const dir = wheelDetent(e);
	if (!dir) return;
	if (onEmitter) gStep(dir);
	else gMove(ring, dir);
}

// one step per physical detent whatever the OS lines-per-notch or hi-res split: a burst after idle steps at once,
// then each step fires mid-detent of the learned size so estimate error and split count cannot double-step; max one per event
function wheelDetent(e) {
	if (!e.deltaY) return 0;
	const dir = e.deltaY < 0 ? 1 : -1;
	const mag = Math.abs(e.deltaY) * WHEEL_UNIT_PX[e.deltaMode];
	const t = e.timeStamp;
	const fresh = dir !== wheel.dir || t - wheel.last > WHEEL_GAP_MS;
	if (fresh) wheelLearn();
	wheel.last = t;
	if (fresh) {
		wheel.dir = dir;
		wheel.first = t;
		wheel.sum = mag;
		wheel.acc = Math.min(mag - (1 + WHEEL_MID) * wheel.notch, 0);
		return dir;
	}
	wheel.sum += mag;
	wheel.acc += mag;
	if (wheel.acc < 0) return 0;
	wheel.acc = Math.min(wheel.acc - wheel.notch, 0);
	return dir;
}

// a short isolated burst holds one detent or a quick multi-detent flick; the lower quartile skips flicks and stray partial nudges
function wheelLearn() {
	if (!wheel.dir || wheel.last - wheel.first > WHEEL_LEARN_MS) return;
	wheelSamples[wheel.head] = wheel.sum;
	wheel.head = (wheel.head + 1) % wheelSamples.length;
	if (wheel.n < wheelSamples.length) wheel.n++;
	for (let i = 0; i < wheel.n; i++) wheelSorted[i] = wheelSamples[i];
	wheelSorted.subarray(0, wheel.n).sort();
	wheel.notch = wheelSorted[wheel.n >> 2];
}

function canvasPoint(e) {
	const rect = iRoot.getBoundingClientRect();
	const scale = iRoot.width / rect.width;
	iPt.x = (e.clientX - rect.left) * scale;
	iPt.y = (e.clientY - rect.top) * scale;
	return iPt;
}

if (typeof module !== 'undefined') module.exports = { inputInit };
