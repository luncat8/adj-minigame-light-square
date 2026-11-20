const fs = require('fs');
const vm = require('vm');
const path = require('path');

const gradient = { addColorStop() {} };
const ctx = {
	setTransform() {},
	createRadialGradient() {
		return gradient;
	},
	fillRect() {},
	beginPath() {},
	roundRect() {},
	fill() {},
	stroke() {},
	moveTo() {},
	lineTo() {},
	strokeRect() {},
	closePath() {},
	fillText() {},
	setLineDash() {},
	arc() {}
};
const canvas = {
	width: 0,
	height: 0,
	style: {},
	getContext() {
		return ctx;
	},
	addEventListener() {},
	getBoundingClientRect() {
		return { left: 0, top: 0 };
	},
	setPointerCapture() {},
	hasPointerCapture() {
		return false;
	},
	releasePointerCapture() {}
};

function element() {
	const classes = {};
	const listeners = {};
	return {
		addEventListener(type, fn) {
			if (!listeners[type]) listeners[type] = [];
			listeners[type].push(fn);
		},
		dispatch(type, ev) {
			const list = listeners[type];
			if (!list) return;
			for (let i = 0; i < list.length; i++) list[i](ev || {});
		},
		classList: {
			toggle(name, force) {
				if (force === undefined) force = !classes[name];
				classes[name] = !!force;
			},
			add(name) {
				classes[name] = true;
			},
			remove(name) {
				classes[name] = false;
			},
			contains(name) {
				return !!classes[name];
			}
		},
		checked: false,
		disabled: false,
		value: '50',
		style: {},
		textContent: '',
		setPointerCapture() {}
	};
}

const panel = {};
for (const id of ['rotQuarter', 'rotShift', 'flipCorners', 'difficulty', 'difficultyLabel', 'hintGood', 'hintFound', 'hintTargets', 'solutionPreview', 'hoverPreview', 'newPuzzle']) panel[id] = element();

let raf = null;
const win = {
	innerWidth: 1200,
	innerHeight: 800,
	devicePixelRatio: 1,
	listeners: {},
	addEventListener(type, fn) {
		if (!win.listeners[type]) win.listeners[type] = [];
		win.listeners[type].push(fn);
	},
	dispatch(type, ev) {
		const list = win.listeners[type];
		if (!list) return;
		for (let i = 0; i < list.length; i++) list[i](ev || {});
	}
};
const sandbox = {
	console,
	document: {
		getElementById(id) {
			if (id === 'canv') return canvas;
			return panel[id] || null;
		}
	},
	window: win,
	requestAnimationFrame(cb) {
		raf = cb;
	},
	Int8Array,
	Int16Array,
	Uint8Array,
	Array,
	Math,
	Object,
	Number,
	String
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
const root = path.join(__dirname, '..');
const files = ['js/board.js', 'js/generate.js', 'js/optics.js', 'js/render.js', 'js/input.js', 'js/ui.js', 'js/main.js'];
for (const f of files) {
	vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
}
if (!raf) throw new Error('no frame scheduled');
raf();
vm.runInContext('UI.difficulty.value = 80; UI.difficulty.dispatch("input");', sandbox);
if (vm.runInContext('Game.settings.difficulty', sandbox) !== 0.8) throw new Error('difficulty handler');
if (vm.runInContext('UI.difficultyLabel.textContent', sandbox) !== 'Expert') throw new Error('difficulty label');
vm.runInContext('UI.sync({ mode: "shift", flipAtCorners: false, difficulty: 0.5 });', sandbox);
if (vm.runInContext('UI.flip.checked', sandbox) !== false) throw new Error('panel sync checked');
if (vm.runInContext('UI.shift.classList.contains("active")', sandbox) !== true) throw new Error('panel sync mode');
if (vm.runInContext('UI.difficulty.value', sandbox) !== 50) throw new Error('panel sync difficulty');
if (vm.runInContext('UI.difficultyLabel.textContent', sandbox) !== 'Medium') throw new Error('panel sync label');
vm.runInContext('UI.hintTargets.checked = false; UI.hintTargets.dispatch("change");', sandbox);
if (vm.runInContext('Game.hints.targets', sandbox) !== false) throw new Error('hint targets handler');
if (vm.runInContext('UI.hintGood.disabled', sandbox) !== true) throw new Error('hint master disable');
vm.runInContext('UI.hintTargets.checked = true; UI.hintTargets.dispatch("change");', sandbox);
vm.runInContext('UI.hintGood.checked = false; UI.hintGood.dispatch("change");', sandbox);
if (vm.runInContext('Game.hints.good', sandbox) !== false) throw new Error('hint good handler');
vm.runInContext('UI.solution.dispatch("pointerdown", { pointerId: 1, preventDefault() {} });', sandbox);
if (vm.runInContext('Game.preview', sandbox) !== true) throw new Error('pointer preview start');
if (vm.runInContext('Game.board.preview', sandbox) !== true) throw new Error('board preview flag');
if (vm.runInContext('Game.status.indexOf("SOLUTION PREVIEW") >= 0', sandbox) !== true) throw new Error('preview status');
if (vm.runInContext('UI.solution.classList.contains("active")', sandbox) !== true) throw new Error('preview button active');
vm.runInContext('UI.solution.dispatch("pointerup", {});', sandbox);
if (vm.runInContext('Game.preview', sandbox) !== false) throw new Error('pointer preview end');
if (vm.runInContext('Game.board.preview', sandbox) !== false) throw new Error('board preview clear');
vm.runInContext('window.dispatch("keydown", { code: "KeyS", repeat: false, target: { tagName: "BODY" }, preventDefault() {} });', sandbox);
if (vm.runInContext('Game.preview', sandbox) !== true) throw new Error('key preview start');
vm.runInContext('window.dispatch("keyup", { code: "KeyS" });', sandbox);
if (vm.runInContext('Game.preview', sandbox) !== false) throw new Error('key preview end');
vm.runInContext('UI.hoverPreview.checked = true; UI.hoverPreview.dispatch("change");', sandbox);
if (vm.runInContext('Game.settings.hoverPreview', sandbox) !== true) throw new Error('hover setting');
vm.runInContext('UI.solution.dispatch("pointerenter", { buttons: 0 });', sandbox);
if (vm.runInContext('Game.preview', sandbox) !== true) throw new Error('hover preview start');
vm.runInContext('UI.solution.dispatch("pointerleave", { buttons: 0 });', sandbox);
if (vm.runInContext('Game.preview', sandbox) !== false) throw new Error('hover preview end');
vm.runInContext('UI.newPuzzle.dispatch("click");', sandbox);
if (!vm.runInContext('Game.board', sandbox)) throw new Error('new puzzle');
console.log('dom_smoke ok');