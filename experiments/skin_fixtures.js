// owns: render skin dispatch smoke — glass default, prototype switch, rim items adopted, hit-testing
// run: node experiments/skin_fixtures.js

const path = require('node:path');
const c = require('./check.js');
const render = require('../render.js');
const skins = require('../skins.js');

const drawnTexts = [];
let strokeCount = 0;
const ctxStub = new Proxy({
	fillText(txt) { drawnTexts.push(txt); },
	stroke() { strokeCount++; }
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

c.eq(skins.skinName(), 'glass', 'default skin is glass');
c.ok(strokeCount > 0, 'glass skin paints on boot');
c.ok(drawnTexts.some(rimText), 'glass skin paints rim items');
c.eq(skins.renderPointToCell(px(7), px(7)).row, 7, 'glass hit-test maps a board cell');
c.eq(skins.renderPointToCell(5, 5), null, 'glass hit-test ignores the rim margin');

skins.skinSelect('prototype');
c.eq(skins.skinName(), 'prototype', 'switch selects the prototype skin');
pump(1, 100);
c.ok(strokeCount > 0, 'prototype skin paints after switch');
c.ok(drawnTexts.some(rimText), 'prototype skin adopts the rim items');
c.eq(skins.renderPointToCell(px(7), px(7)).row, 7, 'prototype hit-test maps a board cell');
c.eq(skins.renderPointToCell(5, 5), null, 'prototype hit-test ignores the rim margin');

skins.skinSelect('glass');
c.eq(skins.skinName(), 'glass', 'switch back selects the glass skin');
pump(1, 200);
c.ok(drawnTexts.some(rimText), 'glass skin paints again after switch back');

c.eq(skins.skinSelect('nope'), undefined, 'unknown skin name is ignored');
c.eq(skins.skinName(), 'glass', 'unknown skin keeps the active skin');

c.report('skin_fixtures');
