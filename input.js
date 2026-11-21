// owns: pointer, wheel, drag gestures, control bindings and pending-setting labels
// edit for: bindings, pending labels, drag tuning and hit rules

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
const iCell = iRender ? iRender.renderPointToCell : renderPointToCell;
const iSelect = iRender ? iRender.renderSetSelection : renderSetSelection;

let iRoot = null;
let cellRing = null;
let selected = -1;
const gest = { pointer: -1, kind: '', ring: -1, cx: 0, cy: 0, prev: 0, acc: 0 };
const iPt = { x: 0, y: 0 };
const iKeys = ['1', '2', 'q', 'w', 'a', 's', 'z', 'x'];
const iWheelCooldown = 60;
let iWheelTime = -Infinity;
let iWheelDir = 0;
let iWheelTarget = -1;

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
	for (let ring = 0; ring < 4; ring++) {
		bindButton('btn-ccw-' + ring, () => rotate(ring, -1));
		bindButton('btn-cw-' + ring, () => rotate(ring, 1));
	}
	bindButton('btn-left', () => gStep(-1));
	bindButton('btn-right', () => gStep(1));
	bindButton('btn-generate', () => { inputPending(true); gNew(); });
	bindButton('btn-restart', () => gRestart());
	bindPreview();
	bindHints();
	for (const id of ['mirror-count', 'difficulty']) {
		$(id).addEventListener('input', () => inputPending(false));
		$(id).addEventListener('change', () => inputPending(true));
	}
	inputPending(false);
	select(0);
	if (typeof window !== 'undefined') {
		window.addEventListener('blur', () => gPrevEnd());
		window.addEventListener('keydown', onKey);
	}
}

function inputPending(normalize) {
	const settings = iGame ? iGame.gameSettings() : gameSettings();
	$('mirror-count-label').textContent = 'Mirrors ' + settings.mirrorCount + '/49';
	$('difficulty-label').textContent = 'Difficulty ' + settings.difficulty + '/100';
	if (!normalize) return;
	$('mirror-count').value = settings.mirrorCount;
	$('difficulty').value = settings.difficulty;
}

function onKey(e) {
	if (e.ctrlKey || e.metaKey || e.altKey) return;
	const tag = e.target && e.target.tagName;
	if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
	const key = iKeys.indexOf(e.key.toLowerCase());
	if (key < 0) return;
	e.preventDefault();
	rotate(Math.floor(key / 2), key % 2 ? 1 : -1);
}

function rotate(ring, dir) {
	select(ring);
	gMove(ring, dir);
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
	const emitter = cell.row === iN - 1 && cell.col >= iMin && cell.col <= iMax;
	const ring = emitter ? -1 : ringAt(cell);
	if (!emitter && ring < 0) return;
	e.preventDefault();
	if (!e.deltaY) return;
	const dir = e.deltaY < 0 ? 1 : -1;
	const target = emitter ? 4 : ring;
	const now = performance.now();
	// Wheel delta size follows OS settings; coalesce bursts, but allow reversals and new targets immediately.
	if (target === iWheelTarget && dir === iWheelDir && now - iWheelTime < iWheelCooldown) return;
	iWheelTarget = target;
	iWheelDir = dir;
	iWheelTime = now;
	if (emitter) gStep(dir);
	else rotate(ring, dir);
}

function canvasPoint(e) {
	const rect = iRoot.getBoundingClientRect();
	const scale = iRoot.width / rect.width;
	iPt.x = (e.clientX - rect.left) * scale;
	iPt.y = (e.clientY - rect.top) * scale;
	return iPt;
}

if (typeof module !== 'undefined') module.exports = { inputInit };
