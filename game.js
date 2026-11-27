// owns: live puzzle, progress, preview switching and readouts
// edit for: game flow, normalized generation settings and active readouts

const gBoard = typeof module !== 'undefined' && module.exports ? require('./board.js') : null;
const gTrace = typeof module !== 'undefined' && module.exports ? require('./trace.js') : null;
const gGoal = typeof module !== 'undefined' && module.exports ? require('./contract.js') : null;
const gHints = typeof module !== 'undefined' && module.exports ? require('./hints.js') : null;
const gGen = typeof module !== 'undefined' && module.exports ? require('./generate.js') : null;
const gRender = typeof module !== 'undefined' && module.exports ? require('./skins.js') : null;
const gAudio = typeof module !== 'undefined' && module.exports ? require('./audio.js') : null;

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
const fEval = gGoal ? gGoal.evaluateContract : evaluateContract;
const fProgress = gGoal ? gGoal.createContractProgress : createContractProgress;
const fUpdate = gGoal ? gGoal.updateContractProgress : updateContractProgress;
const fControls = gHints ? gHints.readHintControls : readHintControls;
const fOverlay = gHints ? gHints.hintOverlay : hintOverlay;
const fGenerate = gGen ? gGen.generate : generate;
const fRenderView = gRender ? gRender.renderView : renderView;

// trace buffers are lazy; read them at call time, never at load
function recvBuf() {
	return gTrace ? gTrace.traceRecv : traceRecv;
}

function segBuf() {
	return gTrace ? gTrace.traceSeg : traceSeg;
}

function soundSink(v) {
	if (gAudio) return gAudio.soundView(v);
	if (typeof soundView !== 'undefined') soundView(v);
}

function soundMoveRing(ring, dir, mode) {
	if (gAudio) return gAudio.soundRotate(ring, dir, mode);
	if (typeof soundRotate !== 'undefined') soundRotate(ring, dir, mode);
}

function soundMoveEmitter(fromCol, toCol) {
	if (gAudio) return gAudio.soundEmitter(fromCol, toCol);
	if (typeof soundEmitter !== 'undefined') soundEmitter(fromCol, toCol);
}

const live = {
	puzzle: null,
	gen: null,
	progress: null,
	previewResult: null,
	previewing: false,
	witnessGlyphs: null,
	// persistent view handed to the renderer and sound sink; only refs and scalars change
	view: { tiles: null, glyphs: null, shadeOff: 0, sideTint: false, emitter: 0, seg: null, recv: null, overlays: null, result: null, previewing: false, moved: false }
};

function gameControlValue(raw, fallback, min, max) {
	const value = Number(raw);
	return String(raw).trim() && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}

function gameSettings() {
	return {
		mode: parseInt($('rule-mode').value, 10),
		corner: $('rule-corner').checked,
		mirrorCount: gameControlValue($('mirror-count').value, 11, 1, 49),
		difficulty: gameControlValue($('difficulty').value, 25, 0, 100)
	};
}

function gameGenerationText(cand) {
	const settings = 'Active · Mirrors ' + cand.mirrorCount + '/49 · requested difficulty ' + Math.round(cand.difficulty * 100) + '/100';
	if (cand.preset) return settings + ' · preset · difficulty not matched · not measured';
	if (!cand.measurement) return settings + ' · not measured';
	return settings + ' · walk escape ' + Math.round(cand.measurement.winRate * 100) + '%';
}

function gameInit() {
	gameNew();
}

// every committed setting change lands here, so the active puzzle always matches the controls
function gameNew() {
	const settings = gameSettings();
	$('mirror-count').value = settings.mirrorCount;
	$('difficulty').value = settings.difficulty;
	const seed = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0;
	startPuzzle(fGenerate(seed, settings.mode, settings.corner, settings.difficulty / 100, settings.mirrorCount));
}

function startPuzzle(cand) {
	live.gen = cand;
	$('readout-generation').textContent = gameGenerationText(cand);
	live.previewResult = null;
	live.previewing = false;
	const p = fCreate(cand.mode, cand.corner);
	p.tiles.set(cand.start);
	p.emitter = cand.startEmitter;
	fCommit(p);
	const w = fCreate(cand.mode, cand.corner);
	w.glyphs.set(p.glyphs);
	for (const m of cand.solution) {
		if (m.r !== undefined) fShift(w, m.r, m.d);
	}
	live.witnessGlyphs = w.glyphs;
	live.puzzle = p;
	live.progress = fProgress(cand.contract);
	refresh();
}

// retrace + evaluate the live pose; preview paths skip this to keep progress frozen
function refresh() {
	fTrace(live.puzzle.tiles, live.puzzle.emitter);
	const result = fUpdate(live.progress, recvBuf());
	readout(result);
	publishView(true);
}

// preview swaps buffer refs and traces the witness pose; the live pose is never mutated
function publishView(moved) {
	const v = live.view;
	v.tiles = live.previewing ? live.gen.witness : live.puzzle.tiles;
	v.glyphs = live.previewing ? live.witnessGlyphs : live.puzzle.glyphs;
	v.shadeOff = live.gen.seed % 50;
	v.sideTint = live.puzzle.mode === fMQ;
	v.emitter = live.previewing ? live.gen.witnessEmitter : live.puzzle.emitter;
	v.seg = segBuf();
	v.recv = recvBuf();
	v.overlays = fOverlay(live.progress, fControls(), live.previewing);
	v.result = live.previewing ? live.previewResult : live.progress.result;
	v.previewing = live.previewing;
	v.moved = !!moved;
	fRenderView(v);
	soundSink(v);
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
	soundMoveRing(ring, dir, live.puzzle.mode);
	refresh();
}

function gameStride(ring) {
	return fSlots(live.puzzle.mode, fSide[ring]) || 1;
}

function gameEmitterStep(dir) {
	if (live.previewing) return;
	const before = live.puzzle.emitter;
	fStep(live.puzzle, dir);
	soundMoveEmitter(before, live.puzzle.emitter);
	if (live.puzzle.emitter !== before) refresh();
}

function gameSetEmitter(col) {
	if (live.previewing) return;
	const before = live.puzzle.emitter;
	fSetE(live.puzzle, col);
	if (live.puzzle.emitter !== before) {
		soundMoveEmitter(before, live.puzzle.emitter);
		refresh();
	}
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
	live.previewResult = fEval(live.progress.contract, recvBuf());
	publishView(true);
	$('readout-msg').textContent = 'preview — release to restore';
}

function gamePreviewEnd() {
	if (!live.previewing) return;
	live.previewing = false;
	fTrace(live.puzzle.tiles, live.puzzle.emitter);
	publishView(false);
	readout(live.progress.result);
}

function gamePreviewing() {
	return live.previewing;
}

// re-publish overlays after a hint toggle; no trace or progress change
function gameRepublish() {
	publishView(false);
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
	gameControlValue,
	gameSettings,
	gameGenerationText,
	gameLive
};
