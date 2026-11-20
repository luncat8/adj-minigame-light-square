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
	fillText() {}
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
		value: '50',
		style: {},
		textContent: ''
	};
}

const panel = {};
for (const id of ['rotQuarter', 'rotShift', 'flipCorners', 'difficulty', 'difficultyLabel', 'newPuzzle']) panel[id] = element();

let raf = null;
const sandbox = {
	console,
	document: {
		getElementById(id) {
			if (id === 'canv') return canvas;
			return panel[id] || null;
		}
	},
	window: {
		innerWidth: 1200,
		innerHeight: 800,
		devicePixelRatio: 1,
		addEventListener() {}
	},
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
const files = ['js/board.js', 'js/optics.js', 'js/render.js', 'js/input.js', 'js/ui.js', 'js/main.js'];
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
vm.runInContext('UI.newPuzzle.dispatch("click");', sandbox);
if (!vm.runInContext('Game.board', sandbox)) throw new Error('new puzzle');
console.log('dom_smoke ok');