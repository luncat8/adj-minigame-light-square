// owns: render skin dispatch smoke — glass default, prototype switch, rim items adopted, hit-testing
// run: node experiments/skin_fixtures.js

const path = require('node:path');
const c = require('./check.js');
const board = require('../board.js');
const render = require('../render.js');
const skins = require('../skins.js');

const drawnTexts = [];
let strokeCount = 0;
const strokeStyles = [];
const fillStyles = [];
const litFills = [];
const dashSets = [];
let ctxStub;
ctxStub = new Proxy({
	fillText(txt) { drawnTexts.push(txt); },
	stroke() { strokeCount++; strokeStyles.push(ctxStub.strokeStyle); },
	fill() { litFills.push([ctxStub.globalCompositeOperation, ctxStub.globalAlpha]); fillStyles.push(ctxStub.fillStyle); },
	fillRect() { fillStyles.push(ctxStub.fillStyle); },
	setLineDash(d) { dashSets.push(d); }
}, {
	get(t, p) { return p in t ? t[p] : () => {}; }
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
global.window = { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };

let rafSeq = 0;
const rafQ = new Map();
global.requestAnimationFrame = f => {
	const id = ++rafSeq;
	rafQ.set(id, f);
	return id;
};
global.cancelAnimationFrame = id => { rafQ.delete(id); };
function pump(n, now) {
	for (let i = 0; i < n && rafQ.size; i++) {
		drawnTexts.length = 0;
		strokeStyles.length = 0;
		fillStyles.length = 0;
		const batch = Array.from(rafQ.entries());
		rafQ.clear();
		for (const [, f] of batch) f(now);
	}
}

$('rule-mode').value = '0';
$('difficulty').value = '25';
$('mirror-count').value = '11';

require('../app.js');
pump(2, 0);

const cellPx = 600 / render.RENDER_SPAN;
const px = cell => (cell + render.RIM_PAD + 0.5) * cellPx;
const rimText = t => ['待机', '调光', '过载', '成功'].includes(t);
const glyphSet = new Set(board.CELL_GLYPHS);
const isGlassGlow = s => typeof s === 'string' && s.startsWith('rgba(255,40,24');
const glassShade = s => typeof s === 'string' && s.startsWith('rgba(155,188,255,');
const sideTints = ['rgba(188,96,86,0.13)', 'rgba(92,168,104,0.12)', 'rgba(96,118,204,0.15)', 'rgba(196,158,84,0.12)'];
const centerTint = 'rgba(132,158,214,0.08)';
const protoTints = ['rgba(188,92,82,0.16)', 'rgba(88,164,100,0.15)', 'rgba(92,114,206,0.18)', 'rgba(196,152,78,0.15)', 'rgba(110,150,220,0.09)'];
// drawGlass fills GLASS_BASE once, then the 49 rotatable cells in row-major order
const cellFills = () => {
	const base = fillStyles.indexOf('rgba(150,180,255,0.03)');
	return fillStyles.slice(base + 1, base + 50);
};

c.eq(skins.skinName(), 'glass', 'default skin is glass');
c.eq(skins.rayIndex(), 2, 'default ray is short dashes');
c.eq($('ray').value, 'short', 'ray select synced to the default');
c.ok(strokeCount > 0, 'glass skin paints on boot');
c.ok(!strokeStyles.some(isGlassGlow), 'glass short mode omits laser glow in cells, drawing only dashes');
c.eq(new Set(fillStyles.filter(s => sideTints.includes(s))).size, 4, 'glass quarter cells paint the four side tints');
c.eq(fillStyles.filter(s => sideTints.includes(s)).length, 48, 'four side tints cover the 48 rotatable strip cells');
c.eq(fillStyles.filter(s => s === centerTint).length, 1, 'center cell paints its own neutral tint');
const beforeTints = cellFills();
$('btn-cw-0').fire('click');
pump(1, 150);
const afterTints = cellFills();
const ring0 = Array.from(board.RING_CELLS[0]);
let rotated = true;
for (let s = 0; s < ring0.length; s++) if (afterTints[ring0[(s + 6) % ring0.length]] !== beforeTints[ring0[s]]) rotated = false;
c.ok(rotated, 'one outer quarter turn carries each side tint onto the next side');
let held = true;
for (let gi = 0; gi < 49; gi++) if (!ring0.includes(gi) && afterTints[gi] !== beforeTints[gi]) held = false;
c.ok(held, 'cells off the moved ring keep their tint');
c.ok(drawnTexts.some(rimText), 'glass skin paints rim items');
c.eq(drawnTexts.filter(t => glyphSet.has(t)).length, 49 * 3, 'glass skin paints 3-pass relief glyphs on all 49 cells');
c.eq(skins.renderPointToCell(px(7), px(7)).row, 7, 'glass hit-test maps a board cell');
c.eq(skins.renderPointToCell(5, 5), null, 'glass hit-test ignores the rim margin');

skins.skinSelect('prototype');
c.eq(skins.skinName(), 'prototype', 'switch selects the prototype skin');
c.eq(rafQ.size, 1, 'skin switch cancels the old rAF loop after multi-frame run');
litFills.length = 0;
pump(2, 100);
c.ok(strokeCount > 0, 'prototype skin paints after switch');
c.ok(litFills.some(f => f[0] === 'lighter' && f[1] <= 0.24), 'prototype skin paints whole-cell glow under the beam');
c.ok(fillStyles.includes('rgba(72,128,208,0.055)'), 'prototype outer cells use dimmer fill');
c.eq(new Set(fillStyles.filter(s => protoTints.includes(s))).size, 5, 'prototype quarter cells paint four side tints and the center tint');
c.eq(fillStyles.filter(s => protoTints.includes(s)).length, 49, 'prototype tints cover all 49 rotatable cells');
c.ok(drawnTexts.some(rimText), 'prototype skin adopts the rim items');
c.eq(drawnTexts.filter(t => glyphSet.has(t)).length, 49 * 3, 'prototype skin paints 3-pass relief glyphs on all 49 cells');
c.eq(skins.renderPointToCell(px(7), px(7)).row, 7, 'prototype hit-test maps a board cell');
c.eq(skins.renderPointToCell(5, 5), null, 'prototype hit-test ignores the rim margin');

skins.raySelect('lines');
dashSets.length = 0;
strokeCount = 0;
pump(1, 300);
c.ok(strokeCount > 0, 'prototype paints in lines mode');
c.ok(!dashSets.some(d => d && d.length === 2), 'prototype lines mode dashes no pass');
skins.raySelect('long');
dashSets.length = 0;
pump(1, 400);
c.ok(dashSets.some(d => d && d[0] === 0.35), 'prototype long mode dashes the thin core');
skins.raySelect('short');
dashSets.length = 0;
pump(1, 500);
c.ok(dashSets.some(d => d && d[0] === 0.2), 'prototype short mode dashes the thin core');
c.eq(skins.raySelect('bogus'), undefined, 'unknown ray name is ignored');
c.eq(skins.rayIndex(), 2, 'unknown ray keeps the active ray');

skins.raySelect('long');
skins.skinSelect('glass');
c.eq(skins.skinName(), 'glass', 'switch back selects the glass skin');
dashSets.length = 0;
pump(1, 200);
c.eq(skins.rayIndex(), 1, 'ray persists across a skin switch');
c.ok(dashSets.some(d => d && d[0] === 0.35), 'new skin receives the ray on switch');
c.ok(!dashSets.some(d => d && d[0] === 0.2), 'glass long mode keeps glow solid instead of dashing at a second speed');
c.ok(strokeStyles.some(isGlassGlow), 'glass long mode draws solid laser glow');
c.eq(dashSets.filter(d => d && d.length === 2).length, 3, 'glass long mode dashes only the 3 thin channel cores');
c.ok(drawnTexts.some(rimText), 'glass skin paints again after switch back');
skins.raySelect('lines');
dashSets.length = 0;
strokeCount = 0;
pump(1, 250);
c.ok(strokeCount > 0, 'glass paints in lines mode');
c.ok(strokeStyles.some(isGlassGlow), 'glass lines mode draws solid laser glow');
c.ok(!dashSets.some(d => d && d.length === 2), 'glass lines mode keeps both glow and ray solid');
skins.raySelect('short');
dashSets.length = 0;
pump(1, 280);
c.ok(!strokeStyles.some(isGlassGlow), 'glass short mode omits laser glow');
c.eq(dashSets.filter(d => d && d.length === 2).length, 3, 'glass short mode dashes only the 3 thin channel cores');

// single-slots mode returns the per-cell random brightness on both skins' glass
$('rule-mode').value = '1';
$('rule-mode').fire('change');
pump(1, 600);
c.ok(new Set(fillStyles.filter(glassShade)).size >= 8, 'single-slots mode restores varied per-cell brightness');
$('rule-mode').value = '0';
$('rule-mode').fire('change');
pump(1, 700);

c.eq(skins.skinSelect('nope'), undefined, 'unknown skin name is ignored');
c.eq(skins.skinName(), 'glass', 'unknown skin keeps the active skin');

c.report('skin_fixtures');
