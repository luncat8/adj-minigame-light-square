// owns: integration smoke for game controls, regenerate-on-change settings, rim feedback and classic-script boot
// run: node experiments/dom_smoke.js

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const c = require('./check.js');
const board = require('../board.js');
const trace = require('../trace.js');
const goal = require('../contract.js');
const render = require('../render.js');
const rim = require('../rim.js');
const game = require('../game.js');
const gen = require('../generate.js');

const drawnTexts = [];
const dashOffsets = [];
const ctxStub = new Proxy({
	fillText(txt) { drawnTexts.push(txt); }
}, {
	get(t, p) { return p in t ? t[p] : () => {}; },
	set(t, p, v) {
		if (p === 'lineDashOffset' && v < 0) dashOffsets.push(v);
		t[p] = v;
		return true;
	}
});

const els = {};
function makeEl(id) {
	return {
		id,
		checked: false,
		value: '',
		textContent: '',
		clientWidth: 600,
		width: 0,
		height: 0,
		handlers: {},
		addEventListener(t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); },
		fire(t, ev) {
			ev = ev || {};
			if (!ev.preventDefault) ev.preventDefault = () => {};
			for (const f of this.handlers[t] || []) f(ev);
		},
		getBoundingClientRect() { return { left: 0, top: 0, width: 600, height: 600 }; },
		getContext() { return ctxStub; },
		setPointerCapture() {},
		releasePointerCapture() {},
		focus() {}
	};
}

global.document = { getElementById(id) { return els[id] || (els[id] = makeEl(id)); } };
global.$ = id => global.document.getElementById(id);

const winHandlers = {};
global.window = {
	devicePixelRatio: 1,
	addEventListener(t, f) { (winHandlers[t] = winHandlers[t] || []).push(f); }
};

let rafCb = null;
global.requestAnimationFrame = f => { rafCb = f; };
function pump(n, now) {
	drawnTexts.length = 0;
	dashOffsets.length = 0;
	for (let i = 0; i < n && rafCb; i++) {
		const f = rafCb;
		rafCb = null;
		f(now);
	}
}

const cellPx = 600 / render.RENDER_SPAN;
const px = cell => (cell + render.RIM_PAD + 0.5) * cellPx;
global.document.getElementById('rule-mode').value = '0';
global.document.getElementById('difficulty').value = '25';
global.document.getElementById('mirror-count').value = '11';

require('../app.js');
pump(1, 0);

const live = () => game.gameLive();
const canv = global.document.getElementById('canv');

function sameArr(a, b) {
	if (!b || a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}
const tilesCopy = () => Uint8Array.from(live().puzzle.tiles);
const recvCopy = () => Uint8Array.from(trace.traceRecv);
function hasDiscovery(progress) {
	for (let i = 0; i < progress.discoveries.length; i++) if (progress.discoveries[i]) return true;
	return false;
}

// boot + animated beam dash progression
c.ok(!!(live().puzzle && live().progress && live().gen), 'boot generated a puzzle');
c.ok(!live().progress.result.won, 'start pose not already won');
c.ok(gen.countMirrors(live().puzzle.tiles) === 11 && gen.countMirrors(live().gen.witness) === 11, 'boot puzzle has the default 11 mirrors');
c.ok(/^\d+%$/.test(global.document.getElementById('readout-pct').textContent), 'percent readout set');
c.eq(live().puzzle.mode, 0, 'boot used mode control');
c.ok(!live().puzzle.corner, 'boot used corner control');
c.eq(live().gen.difficulty, 0.25, 'boot uses default dial 25');
c.eq($('mirror-count-label').textContent, 'Mirrors 11/49', 'default mirror label');
c.eq($('difficulty-label').textContent, 'Difficulty 25/100', 'default difficulty label');
c.ok($('readout-generation').textContent.includes('Active · Mirrors 11/49 · requested difficulty 25/100'), 'active summary shows generated settings');
c.ok($('readout-generation').textContent.includes('walk escape ' + Math.round(live().gen.measurement.winRate * 100) + '%'), 'active summary reports measured win rate');
c.eq(live().view.tiles, live().puzzle.tiles, 'view shows live tiles');
c.eq(live().view.result, live().progress.result, 'view publishes live contract result');
c.eq(render.glassPoint(5, 5), null, 'outer rim margin ignores board hit-test');
pump(1, 80);
const off80 = dashOffsets[0];
pump(1, 160);
const off160 = dashOffsets[0];
c.ok(off80 < 0 && off160 < off80, 'beam dashes animate forward from emitter toward target');

// distinct ring tiles so every rotation visibly changes the pose
const ring0 = board.RING_CELLS[0];
for (let i = 0; i < ring0.length; i++) live().puzzle.tiles[ring0[i]] = (i % 7) + 1;
const ring2 = board.RING_CELLS[2];
for (let i = 0; i < ring2.length; i++) live().puzzle.tiles[ring2[i]] = ((i + 2) % 7) + 1;

// Each button and shortcut addresses its own square, independently of hover selection.
for (let ring = 0; ring < 3; ring++) {
	for (let i = 0; i < board.RING_CELLS[ring].length; i++) live().puzzle.tiles[board.RING_CELLS[ring][i]] = (i % 7) + 1;
}
live().puzzle.tiles[board.CENTER_CELL] = 7;
function expectMove(action, ring, dir, label) {
	const expected = { tiles: tilesCopy(), mode: live().puzzle.mode, corner: live().puzzle.corner };
	board.shiftRing(expected, ring, dir);
	action();
	c.ok(sameArr(expected.tiles, live().puzzle.tiles), label);
}
const keys = [['1', '2'], ['q', 'w'], ['a', 's'], ['z', 'x']];
for (let ring = 0; ring < 4; ring++) {
	for (let col = 0; col < 2; col++) {
		const dir = col ? 1 : -1;
		const id = 'btn-' + (col ? 'cw-' : 'ccw-') + ring;
		expectMove(() => els[id].fire('click'), ring, dir, id + ' moves its own square');
		let prevented = false;
		expectMove(() => winHandlers.keydown[0]({ key: keys[ring][col], preventDefault() { prevented = true; } }), ring, dir, 'key ' + keys[ring][col] + ' moves its own square');
		c.ok(prevented, 'shortcut prevents browser default');
	}
}
let before = tilesCopy();
winHandlers.keydown[0]({ key: 'q', target: { tagName: 'INPUT' } });
winHandlers.keydown[0]({ key: 'w', ctrlKey: true });
c.ok(sameArr(before, live().puzzle.tiles), 'shortcuts ignore form controls and modifiers');

// Wheel magnitudes and delta modes do not multiply steps; bursts coalesce, reversals remain responsive.
let wheelNow = 1000;
global.performance = { now: () => wheelNow };
function wheel(deltaY, x, y, deltaMode = 0) {
	let prevented = false;
	canv.fire('wheel', { deltaY, deltaMode, clientX: px(x), clientY: px(y), preventDefault() { prevented = true; } });
	return prevented;
}
expectMove(() => wheel(-1200, 7, 4), 0, 1, 'large wheel delta makes one quarter turn');
before = tilesCopy();
wheelNow += 10;
c.ok(wheel(-3, 7, 4, 1), 'coalesced wheel still prevents page scroll');
c.ok(sameArr(before, live().puzzle.tiles), 'same-direction burst does not rotate again');
wheelNow += 50;
expectMove(() => wheel(-1, 7, 4, 1), 0, 1, 'next wheel step after cooldown');
expectMove(() => wheel(500, 7, 4), 0, -1, 'wheel reversal is immediate');
expectMove(() => wheel(500, 7, 5), 1, -1, 'new wheel target is immediate');
before = tilesCopy();
c.ok(wheel(0, 7, 5), 'zero vertical delta still prevents scrolling over a square');
c.ok(sameArr(before, live().puzzle.tiles), 'zero vertical delta does not rotate');
c.ok(!wheel(5, 0, 0), 'wheel outside controls is not intercepted');
live().puzzle.emitter = 7;
c.ok(wheel(-1000, 7, 14), 'emitter wheel prevents page scroll');
c.eq(live().puzzle.emitter, 8, 'emitter wheel moves one cell');
wheelNow += 10;
wheel(-1000, 7, 14);
c.eq(live().puzzle.emitter, 8, 'emitter wheel burst is coalesced');
wheel(1000, 7, 14);
c.eq(live().puzzle.emitter, 7, 'emitter reversal is immediate');
canv.fire('pointermove', { pointerId: 9, clientX: px(7), clientY: px(4) });
pump(1, 200);

// drag one quarter arc = exactly one quarter-turn stride
before = tilesCopy();
const R = 3 * cellPx;
const sweep = 100 * Math.PI / 180;
const endX = 300 + R * Math.sin(sweep);
const endY = 300 - R * Math.cos(sweep);
canv.fire('pointerdown', { pointerId: 1, clientX: 300, clientY: 300 - R });
canv.fire('pointermove', { pointerId: 1, clientX: endX, clientY: endY });
canv.fire('pointerup', { pointerId: 1, clientX: endX, clientY: endY });
c.ok(!sameArr(before, live().puzzle.tiles), 'cw drag rotates ring');

// center click flips only center; moving before pointerup never drags outer rings
live().puzzle.tiles[board.CENTER_CELL] = 7;
before = tilesCopy();
canv.fire('pointerdown', { pointerId: 4, clientX: px(7), clientY: px(7) });
c.eq(live().puzzle.tiles[board.CENTER_CELL], 7 | board.TILE_DIAG, 'center click flips center');
const afterCenter = tilesCopy();
canv.fire('pointermove', { pointerId: 4, clientX: endX, clientY: endY });
canv.fire('pointerup', { pointerId: 4, clientX: endX, clientY: endY });
c.ok(sameArr(afterCenter, live().puzzle.tiles), 'pointermove after center click leaves outer rings untouched');

// emitter drag along the bottom border
canv.fire('pointerdown', { pointerId: 2, clientX: px(5), clientY: px(14) });
c.eq(live().puzzle.emitter, 5, 'pointer sets emitter');
canv.fire('pointermove', { pointerId: 2, clientX: px(9), clientY: px(14) });
canv.fire('pointerup', { pointerId: 2, clientX: px(9), clientY: px(14) });
c.eq(live().puzzle.emitter, 9, 'drag moves emitter');

// preview: hover holds, shows witness item state, leave/blur/key release restore live view
const recvBefore = recvCopy();
const progressRef = live().progress;
const resultRef = progressRef.result;
els['btn-preview'].fire('pointerenter');
c.ok(game.gamePreviewing(), 'preview starts on hover');
c.eq(live().view.tiles, live().gen.witness, 'preview shows witness tiles');
c.eq(live().view.glyphs, live().witnessGlyphs, 'preview shows witness glyphs');
c.eq(goal.contractState(live().view.result), goal.CONTRACT_MATCH, 'preview publishes met item state');
pump(1, 240);
c.ok(drawnTexts.includes('成功') && drawnTexts.includes('PREVIEW'), 'preview paints met rim billboard and tag');
els['btn-preview'].fire('pointerleave');
c.ok(!game.gamePreviewing(), 'preview ends on leave');
c.eq(live().view.tiles, live().puzzle.tiles, 'preview end restores live tiles');
c.eq(live().view.glyphs, live().puzzle.glyphs, 'preview end restores live glyphs');
c.eq(live().view.result, resultRef, 'preview end restores live item state');
c.ok(sameArr(recvBefore, trace.traceRecv), 'preview end restores live trace');
c.eq(progressRef.result, resultRef, 'preview leaves progress untouched');

els['btn-preview'].fire('pointerenter');
const suspended = tilesCopy();
game.gameMoveRing(0, 1);
c.ok(sameArr(suspended, live().puzzle.tiles), 'moves suspended during preview');
els['btn-cw-0'].fire('click');
winHandlers.keydown[0]({ key: 'w', preventDefault() {} });
c.ok(sameArr(suspended, live().puzzle.tiles), 'button and shortcut moves suspended during preview');
els['btn-preview'].fire('pointerup');
c.ok(!game.gamePreviewing(), 'release ends preview');

els['btn-preview'].fire('keydown', { key: ' ' });
c.ok(game.gamePreviewing(), 'preview starts on Space');
winHandlers.blur[0]();
c.ok(!game.gamePreviewing(), 'window blur ends preview');
els['btn-preview'].fire('keyup', { key: ' ' });

// replaying the witness wins; preview release on won board keeps 'solved'
game.gameRestart();
const startTiles = tilesCopy();
for (const m of live().gen.solution) {
	if (m.r !== undefined) game.gameMoveRing(m.r, m.d);
	else game.gameSetEmitter(live().puzzle.emitter + m.e);
}
c.ok(live().progress.result.won, 'replaying the witness wins');
c.ok(sameArr(live().puzzle.glyphs, live().witnessGlyphs), 'replaying the witness aligns cell glyphs with preview');
c.eq(global.document.getElementById('readout-pct').textContent, '100%', 'percent reads 100 on win');
c.eq(global.document.getElementById('readout-msg').textContent, 'solved', 'solved readout on win');
els['btn-preview'].fire('pointerenter');
els['btn-preview'].fire('pointerleave');
c.eq(global.document.getElementById('readout-msg').textContent, 'solved', 'preview release preserves solved readout');
c.ok(hasDiscovery(live().progress), 'discoveries recorded');
game.gameRestart();
c.eq(live().progress, progressRef, 'restart keeps the progress object');
c.ok(sameArr(startTiles, live().puzzle.tiles), 'restart restores start tiles');
c.ok(!live().progress.result.won, 'start pose not won after restart');
c.ok(hasDiscovery(live().progress), 'discoveries survive restart');

// Committed setting changes regenerate immediately; input events (typing, dragging) only relabel.
els['btn-preview'].fire('pointerenter');
let prevGen = live().gen;
let prevProgress = live().progress;
$('difficulty').value = '73';
els['difficulty'].fire('input');
c.eq($('difficulty-label').textContent, 'Difficulty 73/100', 'dial drag syncs label');
c.eq(live().gen, prevGen, 'dial drag (input) does not regenerate');
c.ok(game.gamePreviewing(), 'dial drag leaves preview active');
els['difficulty'].fire('change');
c.ok(!game.gamePreviewing(), 'dial change ends preview');
c.ok(live().gen !== prevGen, 'dial change regenerates');
c.ok(live().progress !== prevProgress, 'dial change replaces progress');
c.eq(live().gen.difficulty, 0.73, 'dial change applies continuous dial');
c.ok($('readout-generation').textContent.includes('requested difficulty 73/100'), 'active summary follows dial change');
const settingCases = [
	['rule-mode', () => { $('rule-mode').value = '1'; }, () => live().puzzle.mode === 1, 'mode'],
	['rule-corner', () => { $('rule-corner').checked = true; }, () => live().puzzle.corner, 'corner rule'],
	['mirror-count', () => { $('mirror-count').value = '5'; }, () => gen.countMirrors(live().puzzle.tiles) === 5, 'count']
];
for (const [id, edit, applied, name] of settingCases) {
	prevGen = live().gen;
	edit();
	els[id].fire('input');
	c.eq(live().gen, prevGen, name + ' input does not regenerate');
	els[id].fire('change');
	c.ok(live().gen !== prevGen, name + ' change regenerates');
	c.ok(applied(), name + ' change applies');
	c.eq(live().puzzle.emitter, live().puzzle.startEmitter, name + ' puzzle starts committed');
}
c.ok($('readout-generation').textContent.includes('Mirrors 5/49 · requested difficulty 73/100'), 'active summary matches controls');
c.eq(live().puzzle.mode, 1, 'later changes keep earlier mode');
c.eq(live().gen.difficulty, 0.73, 'later changes keep earlier dial');

for (const [raw, expected] of [['', 11], [' ', 11], ['NaN', 11], ['Infinity', 11], ['0', 1], ['-8', 1], ['50', 49], ['7.6', 8]]) {
	prevGen = live().gen;
	$('mirror-count').value = raw;
	els['mirror-count'].fire('input');
	c.eq($('mirror-count').value, raw, 'input allows unfinished count ' + raw);
	c.eq($('mirror-count-label').textContent, 'Mirrors ' + expected + '/49', 'normalized count label ' + raw);
	c.eq(live().gen, prevGen, 'unfinished count does not regenerate ' + raw);
	els['mirror-count'].fire('change');
	c.eq(Number($('mirror-count').value), expected, 'change normalizes count ' + raw);
	c.eq(live().gen.mirrorCount, expected, 'change generates normalized count ' + raw);
	c.eq(gen.countMirrors(live().puzzle.tiles), expected, 'normalized count is exact ' + raw);
}
for (const [raw, expected] of [['', 25], ['NaN', 25], ['-1', 0], ['101', 100], ['42.6', 43]]) {
	$('difficulty').value = raw;
	els['difficulty'].fire('change');
	c.eq(Number($('difficulty').value), expected, 'normalizes dial ' + raw);
	c.eq($('difficulty-label').textContent, 'Difficulty ' + expected + '/100', 'normalized dial label ' + raw);
	c.eq(live().gen.difficulty, expected / 100, 'dial change generates normalized dial ' + raw);
}
for (const n of [1, 5, 11, 49]) {
	$('mirror-count').value = String(n);
	$('difficulty').value = '25';
	els['mirror-count'].fire('change');
	c.eq(gen.countMirrors(live().puzzle.tiles), n, 'generated count ' + n);
	c.eq(gen.countMirrors(live().gen.witness), n, 'witness count ' + n);
	$('mirror-count').value = '23';
	els['mirror-count'].fire('input');
	game.gameMoveRing(0, 1);
	els['btn-restart'].fire('click');
	c.eq(gen.countMirrors(live().puzzle.tiles), n, 'restart preserves active count ' + n);
	c.same(live().puzzle.tiles, live().gen.start, 'restart restores active start ' + n);
	els['btn-preview'].fire('pointerenter');
	c.eq(gen.countMirrors(live().view.tiles), n, 'preview preserves active count ' + n);
	c.eq(live().view.tiles, live().gen.witness, 'preview ignores uncommitted count ' + n);
	els['btn-preview'].fire('pointerleave');
}
prevGen = live().gen;
$('mirror-count').value = '11';
els['btn-generate'].fire('click');
c.ok(live().gen !== prevGen, 'Generate rerolls with unchanged settings');
c.eq(live().gen.mode, prevGen.mode, 'reroll keeps mode');
c.eq(live().gen.difficulty, prevGen.difficulty, 'reroll keeps dial');
$('mirror-count').value = '';
els['btn-generate'].fire('click');
c.eq(live().gen.mirrorCount, 11, 'Generate normalizes count without change event');
c.eq(Number($('mirror-count').value), 11, 'Generate restores normalized control');
c.eq($('mirror-count-label').textContent, 'Mirrors 11/49', 'Generate restores normalized label');

before = tilesCopy();
game.gameMoveRing(0, 1);
els['btn-restart'].fire('click');
c.ok(sameArr(before, live().puzzle.tiles), 'restart button restores start');

for (let i = 0; i < ring0.length; i++) live().puzzle.tiles[ring0[i]] = (i % 7) + 1;
wheelNow += 60;
expectMove(() => wheel(-900, 7, 4), 0, 1, 'large wheel delta makes one single-slot turn');

// 0.6 acceptance: drive idle -> partial -> met via explicit controls with all hints unchecked
$('hint-current').checked = false;
$('hint-discoveries').checked = false;
$('hint-targets').checked = false;
live().puzzle.tiles.fill(0);
live().puzzle.emitter = 3;
live().progress = goal.createContractProgress(goal.createStrictContract([{ cell: 5, mask: 7 }]));
live().gen.witness.fill(0);
live().gen.witnessEmitter = 5;
els['btn-right'].fire('click');
pump(1, 300);
c.eq(goal.contractState(live().view.result), goal.CONTRACT_NONE, 'emitter col 4 is idle');
c.ok(drawnTexts.includes('待机'), 'idle paints standby rim billboard');
live().puzzle.tiles[1] = 2;
els['btn-right'].fire('click');
pump(1, 340);
c.eq(goal.contractState(live().view.result), goal.CONTRACT_PARTIAL, 'wrong-color + extra hit is partial');
c.ok(drawnTexts.includes('过载'), 'partial with forbidden extra paints overload billboard');
live().progress = goal.createContractProgress(goal.createContract([{ cell: 5, mask: 7 }], 1, false));
els['btn-left'].fire('click');
els['btn-right'].fire('click');
pump(1, 350);
c.ok(drawnTexts.includes('调光'), 'partial without forbidden extra paints tuning billboard');
const discSnap = Uint8Array.from(live().progress.discoveries);
els['btn-preview'].fire('pointerenter');
pump(1, 360);
c.ok(drawnTexts.includes('成功'), 'preview from partial shows met rim state');
els['btn-preview'].fire('pointerleave');
pump(1, 380);
c.ok(drawnTexts.includes('调光'), 'preview release restores partial rim state');
c.ok(sameArr(discSnap, live().progress.discoveries), 'preview does not alter discoveries');
live().puzzle.tiles.fill(0);
els['btn-left'].fire('click');
els['btn-right'].fire('click');
pump(1, 400);
c.eq(goal.contractState(live().view.result), goal.CONTRACT_MATCH, 'clean hit at col 5 is met');
c.ok(drawnTexts.includes('成功'), 'met paints success rim billboard without hints');

// hint toggles republish overlays without touching trace, progress or item state
$('hint-targets').checked = true;
els['hint-targets'].fire('change');
c.eq(live().view.overlays.targets, live().progress.contract.requirements, 'targets overlay published');
c.eq(goal.contractState(live().view.result), goal.CONTRACT_MATCH, 'hint show keeps item state');
$('hint-targets').checked = false;
els['hint-targets'].fire('change');
c.ok(!live().view.overlays.targets, 'targets overlay hides');
c.eq(goal.contractState(live().view.result), goal.CONTRACT_MATCH, 'hint hide keeps item state');

// 0.6 wiring + bottom power cell: lit-only stubs/buses/drops and charge segments
const segLog = [];
const fillLog = [];
const strokeRectLog = [];
const rimCtx = {
	globalCompositeOperation: '',
	globalAlpha: 1,
	strokeStyle: '',
	fillStyle: '',
	lineWidth: 0,
	font: '',
	textAlign: '',
	textBaseline: '',
	_mx: 0,
	_my: 0,
	beginPath() {},
	moveTo(x, y) { this._mx = x; this._my = y; },
	lineTo(x, y) { segLog.push([this._mx, this._my, x, y]); },
	stroke() {},
	fillRect(x, y, w, h) { fillLog.push([x, y, w, h]); },
	strokeRect(x, y, w, h) { strokeRectLog.push([x, y, w, h]); },
	arc() {},
	closePath() {},
	fill() {},
	fillText() {}
};
function hasSeg(x0, y0, x1, y1) {
	for (let i = 0; i < segLog.length; i++) {
		const s = segLog[i];
		if (s[0] === x0 && s[1] === y0 && s[2] === x1 && s[3] === y1) return true;
	}
	return false;
}
function hasRect(log, x, y, w, h) {
	for (let i = 0; i < log.length; i++) {
		const r = log[i];
		if (r[0] === x && r[1] === y && r[2] === w && r[3] === h) return true;
	}
	return false;
}
const idleRes = { percent: 0, forbiddenLight: false, won: false, matches: 0, wrongColor: false };
const partRes = { percent: 50, forbiddenLight: false, won: false, matches: 1, wrongColor: false };
const metRes = { percent: 100, forbiddenLight: false, won: true, matches: 1, wrongColor: false };
segLog.length = 0; fillLog.length = 0; strokeRectLog.length = 0;
rim.drawRimItems(rimCtx, idleRes, new Uint8Array(225), 7, 0);
c.ok(!hasSeg(5.5, 14.82, 5.5, 15.16), 'unlit bottom receiver has no wire stub');
c.ok(hasRect(fillLog, 6.3, 15.45, 2.4, 0.9), 'bottom power cell panel paints when idle');
c.ok(hasRect(strokeRectLog, 6.42, 15.57, 0.4, 0.66), 'idle power cell segments stay uncharged');
const botRecv = new Uint8Array(225);
botRecv[14 * 15 + 5] = 7;
segLog.length = 0; fillLog.length = 0; strokeRectLog.length = 0;
rim.drawRimItems(rimCtx, partRes, botRecv, 7, 0);
c.ok(hasSeg(5.5, 14.82, 5.5, 15.16), 'lit bottom receiver wires to bottom bus');
c.ok(hasSeg(5.5, 15.16, 7.5, 15.16), 'bottom bus runs to power cell');
c.ok(hasSeg(7.5, 15.16, 7.5, 15.9), 'bottom bus drops into power cell');
c.ok(hasRect(fillLog, 6.42, 15.57, 0.4, 0.66), 'partial power cell charges first segment');
const sideRecv = new Uint8Array(225);
sideRecv[2] = 1;
sideRecv[7] = 2;
sideRecv[13] = 4;
sideRecv[5 * 15] = 3;
sideRecv[5 * 15 + 14] = 5;
segLog.length = 0; fillLog.length = 0; strokeRectLog.length = 0;
rim.drawRimItems(rimCtx, metRes, sideRecv, 7, 0);
c.ok(hasSeg(2.5, 0.18, 2.5, -0.1), 'lit top lamp receiver wires to lamp bus');
c.ok(hasSeg(7.5, 0.18, 7.5, -0.1), 'lit top billboard receiver wires to billboard bus');
c.ok(hasSeg(13.5, 0.18, 13.5, -0.1), 'lit top crystal receiver wires to crystal bus');
c.ok(hasSeg(0.18, 5.5, -0.18, 5.5), 'lit left receiver wires to boiler bus');
c.ok(hasSeg(14.82, 5.5, 15.09, 5.5), 'lit right receiver wires to detector bus');
c.ok(hasSeg(2.2, -0.1, 2.2, -0.66), 'lamp bus drops into lamp');
c.ok(hasSeg(7.5, -0.1, 7.5, -0.73), 'billboard bus drops into billboard');
c.ok(hasSeg(12.8, -0.1, 12.8, -0.7), 'crystal bus drops into crystal');
c.ok(hasSeg(-0.18, 7.5, -0.77, 7.5), 'boiler bus drops into boiler');
c.ok(hasSeg(15.09, 7.5, 15.74, 7.5), 'detector bus drops into detector');

// classic-script lexical scope check: load all index.html scripts in index.html order in one shared vm context
const rootDir = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const scripts = Array.from(html.matchAll(/<script src="([^"]+)"><\/script>/g), m => m[1]);
const vmEls = {};
const vmCtx = vm.createContext({
	Date,
	Math,
	Uint8Array,
	Int8Array,
	Int32Array,
	RangeError,
	Set,
	document: {
		getElementById(id) {
			if (!vmEls[id]) {
				const el = makeEl(id);
				if (id === 'rule-mode') el.value = '0';
				if (id === 'difficulty') el.value = '25';
				if (id === 'mirror-count') el.value = '11';
				vmEls[id] = el;
			}
			return vmEls[id];
		}
	},
	window: { devicePixelRatio: 1, addEventListener() {} },
	requestAnimationFrame() {}
});
for (const script of scripts) {
	vm.runInContext(fs.readFileSync(path.join(rootDir, script), 'utf8'), vmCtx, { filename: script });
}
c.eq(vmEls['canv'].width, 600, 'all 12 classic scripts boot cleanly in one shared lexical scope');

c.ok(/id="mirror-count"[^>]*min="1"[^>]*max="49"[^>]*step="1"[^>]*value="11"/.test(html), 'count control HTML bounds and default');
c.ok(/id="difficulty"[^>]*min="0"[^>]*max="100"[^>]*step="1"[^>]*value="25"/.test(html), 'dial HTML bounds and default');
c.ok(!html.includes('id="band"'), 'obsolete band removed');
vm.runInContext('startPuzzle(generate(7, 1, true, 1, 49, { maxAttempts: 0 }))', vmCtx);
c.ok(vmEls['readout-generation'].textContent.includes('Mirrors 49/49 · requested difficulty 100/100 · preset · difficulty not matched · not measured'), 'preset UI explicitly reports unmatched and unmeasured');
c.ok(!vmEls['readout-generation'].textContent.includes('walk escape'), 'unmeasured preset has no invented rate');
c.ok(vm.runInContext('gameLive().gen.preset && countMirrors(gameLive().puzzle.tiles) === 49', vmCtx), 'classic preset retains requested count');
c.eq(vm.runInContext('gameGenerationText({mirrorCount:11,difficulty:0.25,preset:false,measurement:null})', vmCtx), 'Active · Mirrors 11/49 · requested difficulty 25/100 · not measured', 'unmeasured non-preset wording');
c.report('dom_smoke');
