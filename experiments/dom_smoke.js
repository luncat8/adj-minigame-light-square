// owns: 0.5 integration smoke — boots the page under a stub DOM and drives real handlers
// run: node experiments/dom_smoke.js

const c = require('./check.js');
const board = require('../board.js');
const trace = require('../trace.js');
const game = require('../game.js');

const ctxStub = new Proxy({}, {
	get(t, p) { return p in t ? t[p] : () => {}; },
	set(t, p, v) { t[p] = v; return true; }
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
function pump(n) {
	for (let i = 0; i < n && rafCb; i++) {
		const f = rafCb;
		rafCb = null;
		f();
	}
}

// control defaults before boot; canvas cell = 600/15 = 40 css px
const px = cell => (cell + 0.5) * 40;
global.document.getElementById('rule-mode').value = '0';
global.document.getElementById('band').value = '1';

require('../app.js');
pump(1);

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

// boot
c.ok(!!(live().puzzle && live().progress && live().gen), 'boot generated a puzzle');
c.ok(!live().progress.result.won, 'start pose not already won');
c.ok(/^\d+%$/.test(global.document.getElementById('readout-pct').textContent), 'percent readout set');
c.eq(live().puzzle.mode, 0, 'boot used mode control');
c.ok(!live().puzzle.corner, 'boot used corner control');
c.eq(live().view.tiles, live().puzzle.tiles, 'view shows live tiles');

// distinct ring tiles so every rotation visibly changes the pose
const ring0 = board.RING_CELLS[0];
for (let i = 0; i < ring0.length; i++) live().puzzle.tiles[ring0[i]] = (i % 7) + 1;

// wheel steps the hovered ring and selects it
let before = tilesCopy();
canv.fire('wheel', { deltaY: -120, clientX: px(7), clientY: px(4) });
c.ok(!sameArr(before, live().puzzle.tiles), 'wheel steps ring 0');
canv.fire('pointermove', { pointerId: 9, clientX: px(7), clientY: px(4) });
pump(1);

// drag one quarter arc = exactly one quarter-turn stride
before = tilesCopy();
const R = 120;
const sweep = 100 * Math.PI / 180;
const endX = 300 + R * Math.sin(sweep);
const endY = 300 - R * Math.cos(sweep);
canv.fire('pointerdown', { pointerId: 1, clientX: 300, clientY: 180 });
canv.fire('pointermove', { pointerId: 1, clientX: endX, clientY: endY });
canv.fire('pointerup', { pointerId: 1, clientX: endX, clientY: endY });
c.ok(!sameArr(before, live().puzzle.tiles), 'cw drag rotates ring');

// buttons act on the selected ring
before = tilesCopy();
els['btn-cw'].fire('click');
c.ok(!sameArr(before, live().puzzle.tiles), 'cw button rotates selected ring');

// emitter drag along the bottom border
canv.fire('pointerdown', { pointerId: 2, clientX: px(5), clientY: px(14) });
c.eq(live().puzzle.emitter, 5, 'pointer sets emitter');
canv.fire('pointermove', { pointerId: 2, clientX: px(9), clientY: px(14) });
canv.fire('pointerup', { pointerId: 2, clientX: px(9), clientY: px(14) });
c.eq(live().puzzle.emitter, 9, 'drag moves emitter');

// preview: hover holds, leave/blur/key release restore the exact live view
const recvBefore = recvCopy();
const progressRef = live().progress;
const resultRef = progressRef.result;
els['btn-preview'].fire('pointerenter');
c.ok(game.gamePreviewing(), 'preview starts on hover');
c.eq(live().view.tiles, live().gen.witness, 'preview shows witness tiles');
pump(1);
els['btn-preview'].fire('pointerleave');
c.ok(!game.gamePreviewing(), 'preview ends on leave');
c.eq(live().view.tiles, live().puzzle.tiles, 'preview end restores live tiles');
c.ok(sameArr(recvBefore, trace.traceRecv), 'preview end restores live trace');
c.eq(progressRef.result, resultRef, 'preview leaves progress untouched');

els['btn-preview'].fire('pointerenter');
const suspended = tilesCopy();
game.gameMoveRing(0, 1);
c.ok(sameArr(suspended, live().puzzle.tiles), 'moves suspended during preview');
els['btn-preview'].fire('pointerup');
c.ok(!game.gamePreviewing(), 'release ends preview');

els['btn-preview'].fire('keydown', { key: ' ' });
c.ok(game.gamePreviewing(), 'preview starts on Space');
winHandlers.blur[0]();
c.ok(!game.gamePreviewing(), 'window blur ends preview');
els['btn-preview'].fire('keyup', { key: ' ' });

// replaying the witness wins; restart keeps discoveries and restores the start
game.gameRestart();
const startTiles = tilesCopy();
for (const m of live().gen.solution) {
	if (m.r !== undefined) game.gameMoveRing(m.r, m.d);
	else game.gameSetEmitter(live().puzzle.emitter + m.e);
}
c.ok(live().progress.result.won, 'replaying the witness wins');
c.eq(global.document.getElementById('readout-pct').textContent, '100%', 'percent reads 100 on win');
c.ok(hasDiscovery(live().progress), 'discoveries recorded');
game.gameRestart();
c.eq(live().progress, progressRef, 'restart keeps the progress object');
c.ok(sameArr(startTiles, live().puzzle.tiles), 'restart restores start tiles');
c.ok(!live().progress.result.won, 'start pose not won after restart');
c.ok(hasDiscovery(live().progress), 'discoveries survive restart');

// generate applies controls and replaces the puzzle
$('rule-mode').value = '1';
$('rule-corner').checked = true;
$('band').value = '0';
els['band'].fire('input');
c.eq(global.document.getElementById('band-label').textContent, game.gameBandLabel('0'), 'band label syncs');
els['btn-generate'].fire('click');
c.ok(live().progress !== progressRef, 'generate replaces progress');
c.eq(live().puzzle.mode, 1, 'generate applies mode');
c.ok(live().puzzle.corner, 'generate applies corner rule');
c.eq(live().puzzle.emitter, live().puzzle.startEmitter, 'new puzzle starts committed');

before = tilesCopy();
game.gameMoveRing(0, 1);
els['btn-restart'].fire('click');
c.ok(sameArr(before, live().puzzle.tiles), 'restart button restores start');

// hint toggles republish overlays without touching trace or progress
$('hint-targets').checked = true;
els['hint-targets'].fire('change');
c.eq(live().view.overlays.targets, live().progress.contract.requirements, 'targets overlay published');
$('hint-targets').checked = false;
els['hint-targets'].fire('change');
c.ok(!live().view.overlays.targets, 'targets overlay hides');
pump(3);

c.report('dom_smoke');
