// owns: 0.3 secret contract, discovery and hint selection fixtures
// run: node experiments/contract_fixtures.js

const board = require('../board.js');
const trace = require('../trace.js');
const goal = require('../contract.js');
const hints = require('../hints.js');
const c = require('./check.js');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const N = board.BOARD_N;
const A = 3;
const B = 5;
const C = 7;
const D = 9;
const OUT = 11;
const target = (cell, mask = 0) => ({ cell, mask });
const recv = (...hits) => {
	const buffer = new Uint8Array(N * N);
	for (const [cell, mask] of hits) buffer[cell] = mask;
	return buffer;
};

const easy = goal.createContract([target(A), target(B), target(C)], 2, false);
c.eq(goal.contractState(null), goal.CONTRACT_NONE, 'null result is idle');
let result = goal.evaluateContract(easy, recv([OUT, 7]));
c.eq(goal.contractState(result), goal.CONTRACT_NONE, 'outside-only hit stays idle');
result = goal.evaluateContract(easy, recv([A, 1]));
c.eq(result.matches, 1, 'below quota matches');
c.eq(result.percent, 50, 'below quota percent');
c.eq(goal.contractState(result), goal.CONTRACT_PARTIAL, 'below quota is partial');
c.ok(!result.won && result.missingLight && !result.wrongColor, 'below quota reports missing');
result = goal.evaluateContract(easy, recv([A, 1], [B, 2], [OUT, 7]));
c.ok(result.won && result.percent === 100 && result.extras === 0, 'at quota permits outside light');
c.eq(goal.contractState(result), goal.CONTRACT_MATCH, 'won result is met');
c.ok(!result.missingLight, 'optional dark target not reported');
result = goal.evaluateContract(easy, recv([A, 1], [B, 2], [C, 7]));
c.ok(result.won && result.matches === 3 && result.percent === 100, 'above quota capped');
c.ok(goal.evaluateContract(easy, recv([A, 1], [C, 1])).won, 'any target combination wins');
const lower = goal.createContract([target(A), target(B), target(C)], 1, false);
const enlarged = goal.createContract([target(A), target(B), target(C), target(D)], 2, false);
c.ok(goal.evaluateContract(lower, recv([A, 1], [B, 2])).won, 'lower quota preserves win');
c.ok(goal.evaluateContract(enlarged, recv([A, 1], [B, 2])).won, 'larger pool preserves win');

const forbidden = goal.createContract([target(A), target(B), target(C)], 2, true);
result = goal.evaluateContract(forbidden, recv([OUT, 7]));
c.eq(goal.contractState(result), goal.CONTRACT_NONE, 'forbidden outside alone stays idle');
result = goal.evaluateContract(forbidden, recv([A, 1], [B, 2], [OUT, 7]));
c.ok(!result.won && result.forbiddenLight && result.extras === 1, 'forbidden extra blocks win');
c.eq(goal.contractState(result), goal.CONTRACT_PARTIAL, 'quota blocked by extra is partial');
c.eq(result.percent, 66, 'extra counted in denominator');
result = goal.evaluateContract(forbidden, recv([A, 1], [OUT, 7], [D, 2]));
c.eq(result.percent, 25, 'multiple extras and unmet quota');
c.ok(result.missingLight && result.forbiddenLight, 'missing and extras reported separately');

const strict = goal.createStrictContract([target(A, 1), target(B, 4)]);
result = goal.evaluateContract(strict, recv([A, 3], [B, 4]));
c.ok(!result.won && result.matches === 1 && result.wrongColor && !result.missingLight, 'superset is wrong color');
c.eq(result.status[A], goal.CONTRACT_PARTIAL, 'wrong color partial');
result = goal.evaluateContract(strict, recv([A, 3]));
c.eq(goal.contractState(result), goal.CONTRACT_PARTIAL, 'wrong color alone is partial');
result = goal.evaluateContract(strict, recv([A, 3], [B, 4]));
result = goal.evaluateContract(strict, recv([A, 3], [OUT, 7]));
c.ok(result.wrongColor && result.missingLight && result.forbiddenLight, 'wrong, missing and extra feedback are independent');
result = goal.evaluateContract(strict, recv([A, 1], [B, 4]));
c.ok(result.won && result.percent === 100, 'exact masks win');
result = goal.evaluateContract(strict, recv([A, 1], [B, 4], [OUT, 1]));
c.ok(!result.won && result.forbiddenLight, 'strict forbids extra');
const mixed = goal.createContract([target(A, 1), target(B, 2), target(C, 4)], 1, false);
result = goal.evaluateContract(mixed, recv([A, 1], [B, 7]));
c.ok(result.won && !result.wrongColor && !result.missingLight, 'optional mismatch not reported after quota');
c.eq(result.status[B], goal.CONTRACT_PARTIAL, 'optional mismatch still marked');

const progress = goal.createContractProgress(strict);
const off = { current: false, discoveries: false, targets: false };
goal.updateContractProgress(progress, recv([A, 3]));
c.eq(progress.discoveries[A], goal.CONTRACT_PARTIAL, 'partial remembered with hints off');
goal.updateContractProgress(progress, recv([A, 1]));
c.eq(progress.discoveries[A], goal.CONTRACT_MATCH, 'match improves remembered partial');
goal.updateContractProgress(progress, recv([A, 3], [B, 4]));
c.eq(progress.discoveries[A], goal.CONTRACT_MATCH, 'partial cannot downgrade match');
c.ok(!progress.result.won && progress.result.matches === 1, 'discoveries across turns do not win');
goal.updateContractProgress(progress, recv());
c.eq(progress.discoveries[B], goal.CONTRACT_MATCH, 'past match remains after light moves');
c.eq(progress.discoveries[OUT], goal.CONTRACT_NONE, 'outside cells are never discoveries');
c.eq(progress.result.status[B], goal.CONTRACT_NONE, 'live status cleared');

for (let bits = 0; bits < 8; bits++) {
	const options = { current: !!(bits & 1), discoveries: !!(bits & 2), targets: !!(bits & 4) };
	const overlay = hints.hintOverlay(progress, options, false);
	c.eq(overlay.current, options.current ? progress.result.status : null, 'current independently toggled ' + bits);
	c.eq(overlay.discoveries, options.discoveries ? progress.discoveries : null, 'history independently toggled ' + bits);
	c.eq(overlay.targets, options.targets ? strict.requirements : null, 'targets independently toggled ' + bits);
}
const beforeResult = progress.result;
const beforeHistory = Uint8Array.from(progress.discoveries);
const previewResult = goal.evaluateContract(strict, recv([A, 1], [B, 4]));
const hidden = hints.hintOverlay(progress, { current: true, discoveries: true, targets: true }, true);
c.ok(previewResult.won && !hidden.current && !hidden.discoveries && !hidden.targets, 'preview suppresses all overlays');
c.eq(progress.result, beforeResult, 'preview and hint selection do not overwrite live result');
c.same(progress.discoveries, beforeHistory, 'preview and hint selection do not record discoveries');
c.ok(!hints.hintOverlay(progress, off, false).targets, 'off hides targets');

const puzzle = board.createPuzzle(board.MODE_SINGLE, false);
board.commitStart(puzzle);
board.restartPuzzle(puzzle);
c.same(progress.discoveries, beforeHistory, 'restarting board preserves puzzle discoveries');
c.eq(goal.createContractProgress(strict).discoveries[A], goal.CONTRACT_NONE, 'new puzzle starts with no discoveries');

// Real traces drive current-pose scoring rather than an accumulated receiver union.
const traced = goal.createContract([target(7), target(8)], 2, false);
const live = goal.createContractProgress(traced);
trace.traceLight(puzzle.tiles, 7);
goal.updateContractProgress(live, trace.traceRecv);
trace.traceLight(puzzle.tiles, 8);
goal.updateContractProgress(live, trace.traceRecv);
c.ok(!live.result.won && live.result.matches === 1, 'separate traced turns do not satisfy quota');
c.ok(live.discoveries[7] === goal.CONTRACT_MATCH && live.discoveries[8] === goal.CONTRACT_MATCH, 'both traced turns remembered');

const splitTiles = new Uint8Array(board.GLASS * board.GLASS);
splitTiles[3 * board.GLASS + 3] = 5;
trace.traceLight(splitTiles, 7);
const right = 7 * N + N - 1;
const splitStrict = goal.createStrictContract([target(7, 2), target(right, 5)]);
c.ok(goal.evaluateContract(splitStrict, trace.traceRecv).won, 'real split trace matches exact contract');
const splitWrong = goal.createStrictContract([target(7, 2), target(right, 1)]);
c.ok(goal.evaluateContract(splitWrong, trace.traceRecv).wrongColor, 'real split superset fails exact mask');
const splitExtra = goal.createStrictContract([target(7, 2)]);
c.ok(goal.evaluateContract(splitExtra, trace.traceRecv).forbiddenLight, 'real split extra is forbidden');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = Array.from(html.matchAll(/<script src="([^"]+)"><\/script>/g), match => match[1]);
c.eq(scripts.length, 11, 'classic script count');
c.same(scripts, ['board.js', 'trace.js', 'contract.js', 'hints.js', 'presets.js', 'generate.js', 'rim.js', 'render.js', 'game.js', 'input.js', 'app.js'], 'classic scripts load in order');
const inputs = {};
for (const id of ['hint-current', 'hint-discoveries', 'hint-targets']) {
	const input = html.match(new RegExp('<input[^>]*id="' + id + '"[^>]*>'));
	c.ok(!!input && !/\schecked(?:\s|=|>)/.test(input[0]), id + ' initially unchecked');
	inputs[id] = { checked: false };
}
const browser = vm.createContext({ document: { getElementById: id => inputs[id] } });
// vm covers the DOM-free rule layer; render/game/input/app need real DOM and boot via app.js
for (const script of scripts.slice(0, 4)) vm.runInContext(fs.readFileSync(path.join(root, script), 'utf8'), browser, { filename: script });
inputs['hint-current'].checked = true;
inputs['hint-targets'].checked = true;
const controls = vm.runInContext('readHintControls()', browser);
c.ok(controls.current && !controls.discoveries && controls.targets, 'checkbox state read independently in classic scripts');
c.ok(vm.runInContext('createStrictContract([{cell: 7, mask: 7}]).quota === 1', browser), 'contract works in classic browser scripts');

function rejects(fn, message) {
	let threw = false;
	try { fn(); } catch (error) { threw = error instanceof RangeError; }
	c.ok(threw, message);
}
rejects(() => goal.createContract([target(A)], 0, false), 'zero quota rejected');
rejects(() => goal.createContract([target(A)], 2, false), 'oversized quota rejected');
rejects(() => goal.createContract([target(A), target(A)], 1, false), 'duplicate target rejected');
rejects(() => goal.createContract([target(0)], 1, false), 'unreachable corner rejected');
rejects(() => goal.createContract([target(N + 1)], 1, false), 'interior rejected');
rejects(() => goal.createContract([target(A, 8)], 1, false), 'invalid mask rejected');
rejects(() => goal.createStrictContract([target(A)]), 'strict any-color target rejected');
rejects(() => goal.evaluateContract(easy, new Uint8Array(1)), 'wrong trace buffer size rejected');

c.report('contract_fixtures');
