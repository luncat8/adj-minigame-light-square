// Integration smoke: load the page scripts in one VM context with a DOM stub,
// boot the composer, and drive the app the way the browser would.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
assert(srcs.length >= 5, 'index.html must load the rule and UI scripts');

let drawCalls = 0;
const ctx = new Proxy({}, {
	get(t, k) {
		if (k in t) return t[k];
		return () => { drawCalls++; };
	},
	set(t, k, v) { t[k] = v; return true; }
});

function makeEl(id) {
	return {
		id, style: {}, checked: false, value: '', textContent: '', width: 0, height: 0,
		addEventListener() {}, removeEventListener() {},
		setPointerCapture() {}, releasePointerCapture() {},
		getBoundingClientRect() { return { width: 600, height: 600, left: 0, top: 0 }; },
		getContext() { return ctx; }
	};
}

const elements = {};
const document = {
	getElementById(id) { return elements[id] || (elements[id] = makeEl(id)); },
	addEventListener() {}
};

let rafId = 0;
const requestAnimationFrame = fn => {
	const id = ++rafId;
	if (rafId === 1) queueMicrotask(() => { if (rafId === id) fn(16); });
	return id;
};

const window = {
	innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
	addEventListener() {}, requestAnimationFrame, blur() {}
};

const sandbox = { document, window, requestAnimationFrame, queueMicrotask, performance: { now: () => 0 }, console };
vm.createContext(sandbox);

const code = srcs.map(s => fs.readFileSync(path.join(root, s), 'utf8')).join('\n') + '\n;globalThis.__game = game;';
vm.runInContext(code, sandbox, { filename: 'index-bundle.js' });

const game = sandbox.__game;
assert(game && game.puzzle, 'composer booted and generated a puzzle');
assert.strictEqual(game.solved, false, 'a fresh puzzle is not already solved');
assert(game.evaluation.progress >= 0 && game.evaluation.progress <= 100, 'progress is a percentage');

// the saved solution must actually win when replayed through the app model
const replay = sandbox.copyPose(game.puzzle.start);
for (const move of game.puzzle.solution) sandbox.applyPuzzleMove(replay, move, game.rules);
assert.deepStrictEqual(replay, game.puzzle.witness, 'solution replays to the witness');
assert(sandbox.evaluateContract(game.puzzle.contract, sandbox.traceLight(replay).hits).won, 'witness wins');

// live moves and emitter clamp recompute without throwing
game.applyRingMove(7, 1);
assert(game.evaluation && game.trace.hits.length === 225, 'ring move recomputes the trace');
game.setEmitter(5);
assert.strictEqual(game.pose.emitter, 5, 'emitter moves to the column');
game.setEmitter(99);
assert.strictEqual(game.pose.emitter, 13, 'emitter clamps to the interior');

// preview renders the witness without mutating the live pose
const live = sandbox.copyPose(game.pose);
game.setPreview(true);
assert(game.previewActive && game.previewTrace.hits.length === 225, 'preview traces the witness');
assert.deepStrictEqual(game.pose, live, 'preview never mutates the live pose');
game.setPreview(false);
assert(!game.previewActive, 'preview releases');

// restart restores the start pose but keeps discoveries
game.applyRingMove(7, 1);
game.restart();
assert.deepStrictEqual(game.pose, game.puzzle.start, 'restart restores the start');

(async () => {
	await new Promise(r => setTimeout(r, 0)); // let the single rAF frame flush
	assert(drawCalls > 0, 'the render loop drew the board');
	console.log('dom smoke passed: boot, replay, moves, emitter, preview, restart, ' + drawCalls + ' draw calls');
})();
