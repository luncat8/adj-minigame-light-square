// owns: render skin selection, beam ray style and the page-facing render entry points
// edit for: adding or switching a skin or ray style; the active skin owns its own painting
// render.js (glass) and renderAlt.js (prototype) are skins behind this dispatcher

const sGlass = typeof module !== 'undefined' && module.exports ? require('./render.js') : null;
const sProto = typeof module !== 'undefined' && module.exports ? require('./renderAlt.js') : null;

const SKINS = { glass: true, prototype: true };
const RAY_VALUES = ['lines', 'long', 'short'];
let activeName = 'glass';
let activeSkin = null;
let rootRef = null;
let lastView = null;
let lastSelection = -1;
let lastRay = 2;	// short dashes: keeps the default boot look unchanged

// read the skin table at call time: classic scripts share globals, node uses exports
function skinTable() {
	return {
		glass: sGlass
			? { init: sGlass.glassInit, view: sGlass.glassView, select: sGlass.glassSelect, setRay: sGlass.glassSetRay, point: sGlass.glassPoint, stop: sGlass.glassStop }
			: { init: glassInit, view: glassView, select: glassSelect, setRay: glassSetRay, point: glassPoint, stop: glassStop },
		prototype: sProto
			? { init: sProto.renderAltInit, view: sProto.renderAltView, select: sProto.renderAltSetSelection, setRay: sProto.renderAltSetRay, point: sProto.renderAltPointToCell, stop: sProto.renderAltStop }
			: { init: renderAltInit, view: renderAltView, select: renderAltSetSelection, setRay: renderAltSetRay, point: renderAltPointToCell, stop: renderAltStop }
	};
}

function active() {
	if (!activeSkin) activeSkin = skinTable()[activeName];
	return activeSkin;
}

function renderInit(rootEl) {
	rootRef = rootEl;
	active().init(rootEl);
	bindSkinSelect();
	bindRaySelect();
}

function renderView(v) {
	lastView = v;
	active().view(v);
}

function renderSetSelection(ring) {
	lastSelection = ring;
	active().select(ring);
}

function renderPointToCell(x, y) {
	return active().point(x, y);
}

function skinName() {
	return activeName;
}

function rayIndex() {
	return lastRay;
}

// stop the old skin, init the new one and re-publish state so nothing is lost on switch
function skinSelect(name) {
	if (!SKINS[name] || name === activeName) return;
	const table = skinTable();
	table[activeName].stop();
	activeName = name;
	activeSkin = table[name];
	activeSkin.init(rootRef);
	activeSkin.setRay(lastRay);
	if (lastView) activeSkin.view(lastView);
	activeSkin.select(lastSelection);
	syncSkinSelect();
}

function raySelect(name) {
	const i = RAY_VALUES.indexOf(name);
	if (i < 0) return;
	lastRay = i;
	active().setRay(i);
	syncRaySelect();
}

function bindSkinSelect() {
	const el = typeof document !== 'undefined' ? document.getElementById('skin') : null;
	if (!el) return;
	el.addEventListener('change', function () { skinSelect(el.value); });
	syncSkinSelect();
}

function bindRaySelect() {
	const el = typeof document !== 'undefined' ? document.getElementById('ray') : null;
	if (!el) return;
	el.addEventListener('change', function () { raySelect(el.value); });
	syncRaySelect();
}

function syncSkinSelect() {
	const el = typeof document !== 'undefined' ? document.getElementById('skin') : null;
	if (el) el.value = activeName;
}

function syncRaySelect() {
	const el = typeof document !== 'undefined' ? document.getElementById('ray') : null;
	if (el) el.value = RAY_VALUES[lastRay];
}

if (typeof module !== 'undefined') module.exports = {
	renderInit,
	renderView,
	renderSetSelection,
	renderPointToCell,
	skinName,
	skinSelect,
	rayIndex,
	raySelect
};
