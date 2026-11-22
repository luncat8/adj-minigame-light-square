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

let rafCb = null;
global.requestAnimationFrame = f => { rafCb = f; };
function pump(n, now) {
	drawnTexts.length = 0;
	strokeStyles.length = 0;
	fillStyles.length = 0;
	for (let i = 0; i < n && rafCb; i++) {
		const f = rafCb;
		rafCb = null;
		f(now);
	}
}

$('rule-mode').value = '0';
$('difficulty').value = '25';
$('mirror-count').value = '11';

require('../app.js');
pump(1, 0);

const cellPx = 600 / render.RENDER_SPAN;
const px = cell => (cell + render.RIM_PAD + 0.5) * cellPx;
const rimText = t => ['待机', '调光', '过载', '成功'].includes(t);
const glyphSet = new Set(board.CELL_GLYPHS);
const isGlassGlow = s => typeof s === 'string' && s.startsWith('rgba(255,40,24');
const glassShade = s => typeof s === 'string' && s.startsWith('rgba(155,188,255,');
const protoShade = s => typeof s === 'string' && s.startsWith('rgba(105,170,250,');

c.eq(skins.skinName(), 'glass', 'default skin is glass');
c.eq(skins.rayIndex(), 2, 'default ray is short dashes');
c.eq($('ray').value, 'short', 'ray select synced to the default');
c.ok(strokeCount > 0, 'glass skin paints on boot');
c.ok(!strokeStyles.some(isGlassGlow), 'glass short mode omits laser glow in cells, drawing only dashes');
c.ok(new Set(fillStyles.filter(glassShade)).size >= 8, 'glass rotated-square cells paint varied random brightness');
c.ok(drawnTexts.some(rimText), 'glass skin paints rim items');
c.eq(drawnTexts.filter(t => glyphSet.has(t)).length, 49 * 3, 'glass skin paints 3-pass relief glyphs on all 49 cells');
c.eq(skins.renderPointToCell(px(7), px(7)).row, 7, 'glass hit-test maps a board cell');
c.eq(skins.renderPointToCell(5, 5), null, 'glass hit-test ignores the rim margin');

skins.skinSelect('prototype');
c.eq(skins.skinName(), 'prototype', 'switch selects the prototype skin');
litFills.length = 0;
pump(1, 100);
c.ok(strokeCount > 0, 'prototype skin paints after switch');
c.ok(litFills.some(f => f[0] === 'lighter' && f[1] <= 0.24), 'prototype skin paints whole-cell glow under the beam');
c.ok(fillStyles.includes('rgba(72,128,208,0.055)'), 'prototype outer cells use dimmer fill');
c.ok(new Set(fillStyles.filter(protoShade)).size >= 8, 'prototype rotated-square cells use lighter varied brightness');
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

c.eq(skins.skinSelect('nope'), undefined, 'unknown skin name is ignored');
c.eq(skins.skinName(), 'glass', 'unknown skin keeps the active skin');

c.report('skin_fixtures');
