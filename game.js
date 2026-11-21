// owns: live puzzle, progress, preview switching and readouts
// edit for: game flow, band labels, readout wording

const gBoard = typeof module !== 'undefined' && module.exports ? require('./board.js') : null;
const gTrace = typeof module !== 'undefined' && module.exports ? require('./trace.js') : null;
const gGoal = typeof module !== 'undefined' && module.exports ? require('./contract.js') : null;
const gHints = typeof module !== 'undefined' && module.exports ? require('./hints.js') : null;
const gGen = typeof module !== 'undefined' && module.exports ? require('./generate.js') : null;
const gRender = typeof module !== 'undefined' && module.exports ? require('./render.js') : null;

const fCreate = gBoard ? gBoard.createPuzzle : createPuzzle;
const fCommit = gBoard ? gBoard.commitStart : commitStart;
const fRestart = gBoard ? gBoard.restartPuzzle : restartPuzzle;
const fShift = gBoard ? gBoard.shiftRing : shiftRing;
const fStep = gBoard ? gBoard.stepEmitter : stepEmitter;
const fSetE = gBoard ? gBoard.setEmitter : setEmitter;
const fSide = gBoard ? gBoard.RING_SIDE : RING_SIDE;
const fSlots = gBoard ? gBoard.stepSlots : stepSlots;
const fMQ = gBoard ? gBoard.MODE_QUARTER : MODE_QUARTER;
const fTrace = gTrace ? gTrace.traceLight : traceLight;
const fProgress = gGoal ? gGoal.createContractProgress : createContractProgress;
const fUpdate = gGoal ? gGoal.updateContractProgress : updateContractProgress;
const fControls = gHints ? gHints.readHintControls : readHintControls;
const fOverlay = gHints ? gHints.hintOverlay : hintOverlay;
const fGenerate = gGen ? gGen.generate : generate;
const fRng = gGen ? gGen.makeRng : makeRng;
const fRenderView = gRender ? gRender.renderView : renderView;

const BAND_LABELS = ['few targets · any color', 'all targets · any color', 'all targets · exact colors'];

// trace buffers are lazy; read them at call time, never at load
function recvBuf() {
	return gTrace ? gTrace.traceRecv : traceRecv;
}

function segBuf() {
	return gTrace ? gTrace.traceSeg : traceSeg;
}

const live = {
	puzzle: null,
	gen: null,
	progress: null,
	previewing: false,
	// persistent view handed to the renderer; only refs and scalars change
	view: { tiles: null, emitter: 0, seg: null, recv: null, overlays: null, previewing: false }
};

function gameBandLabel(band) {
	return BAND_LABELS[band] || '';
}

function gameInit() {
	gameNew();
}

// rules and difficulty apply only here; changing a control alone never replaces the puzzle
function gameNew() {
	const mode = parseInt($('rule-mode').value, 10);
	const corner = $('rule-corner').checked;
	const band = parseInt($('band').value, 10);
	const seed = (Date.now() ^ (Math.random() * 0x7fffffff)) | 0;
	startPuzzle(fGenerate(fRng(seed), mode, corner, band));
}

function startPuzzle(cand) {
	live.gen = cand;
	live.previewing = false;
	const p = fCreate(cand.mode, cand.corner);
	p.tiles.set(cand.start);
	p.emitter = cand.startEmitter;
	fCommit(p);
	live.puzzle = p;
	live.progress = fProgress(cand.contract);
	refresh();
}

// retrace + evaluate the live pose; preview paths skip this to keep progress frozen
function refresh() {
	fTrace(live.puzzle.tiles, live.puzzle.emitter);
	const result = fUpdate(live.progress, recvBuf());
	readout(result);
	publishView();
}

// preview swaps buffer refs and traces the witness pose; the live pose is never mutated
function publishView() {
	const v = live.view;
	v.tiles = live.previewing ? live.gen.witness : live.puzzle.tiles;
	v.emitter = live.previewing ? live.gen.witnessEmitter : live.puzzle.emitter;
	v.seg = segBuf();
	v.recv = recvBuf();
	v.overlays = fOverlay(live.progress, fControls(), live.previewing);
	v.previewing = live.previewing;
	fRenderView(v);
}

function readout(result) {
	$('readout-pct').textContent = result.percent + '%';
	$('readout-msg').textContent = result.won ? 'solved' : feedback(result);
	$('readout-rules').textContent = ruleText();
}

function feedback(result) {
	const parts = [];
	if (result.wrongColor) parts.push('right cell, wrong color');
	if (result.missingLight) parts.push('light more targets');
	if (result.forbiddenLight) parts.push('extra light is forbidden');
	return parts.length ? parts.join(' · ') : 'shift rings to move the light';
}

function ruleText() {
	const p = live.puzzle;
	return (p.mode === fMQ ? 'quarter turns' : 'single slots') + ' · corners ' + (p.corner ? 'flip' : 'hold');
}

function gameMoveRing(ring, dir) {
	if (live.previewing) return;
	fShift(live.puzzle, ring, dir);
	refresh();
}

function gameStride(ring) {
	return fSlots(live.puzzle.mode, fSide[ring]) || 1;
}

function gameEmitterStep(dir) {
	if (live.previewing) return;
	fStep(live.puzzle, dir);
	refresh();
}

function gameSetEmitter(col) {
	if (live.previewing) return;
	const before = live.puzzle.emitter;
	fSetE(live.puzzle, col);
	if (live.puzzle.emitter !== before) refresh();
}

function gameRestart() {
	if (live.previewing) return;
	fRestart(live.puzzle);
	refresh();
}

function gamePreviewStart() {
	if (live.previewing) return;
	live.previewing = true;
	fTrace(live.gen.witness, live.gen.witnessEmitter);
	publishView();
	$('readout-msg').textContent = 'preview — release to restore';
}

function gamePreviewEnd() {
	if (!live.previewing) return;
	live.previewing = false;
	fTrace(live.puzzle.tiles, live.puzzle.emitter);
	publishView();
	$('readout-msg').textContent = feedback(live.progress.result);
}

function gamePreviewing() {
	return live.previewing;
}

// re-publish overlays after a hint toggle; no trace or progress change
function gameRepublish() {
	publishView();
}

function gameLive() {
	return live;
}

if (typeof module !== 'undefined') module.exports = {
	gameInit,
	gameNew,
	gameRestart,
	gameMoveRing,
	gameStride,
	gameEmitterStep,
	gameSetEmitter,
	gamePreviewStart,
	gamePreviewEnd,
	gamePreviewing,
	gameRepublish,
	gameBandLabel,
	gameLive
};
