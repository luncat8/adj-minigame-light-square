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
let raf = null;
const sandbox = {
	console,
	document: {
		getElementById(id) {
			return id === 'canv' ? canvas : null;
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
	Array,
	Math,
	Object,
	Number,
	String
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
const root = path.join(__dirname, '..');
const files = ['js/board.js', 'js/optics.js', 'js/render.js', 'js/input.js', 'js/main.js'];
for (const f of files) {
	vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
}
if (!raf) throw new Error('no frame scheduled');
raf();
console.log('dom_smoke ok');
