// owns: render skin selection and the four page-facing render entry points
// edit for: adding or switching a skin; the active skin owns its own painting
// render.js (glass) and renderAlt.js (prototype) are skins behind this dispatcher

const sGlass = typeof module !== 'undefined' && module.exports ? require('./render.js') : null;
const sProto = typeof module !== 'undefined' && module.exports ? require('./renderAlt.js') : null;

const SKINS = { glass: true, prototype: true };
let activeName = 'glass';
let activeSkin = null;
let rootRef = null;
let lastView = null;
let lastSelection = -1;

// read the skin table at call time: classic scripts share globals, node uses exports
function skinTable() {
	return {
		glass: sGlass
			? { init: sGlass.glassInit, view: sGlass.glassView, select: sGlass.glassSelect, point: sGlass.glassPoint, stop: sGlass.glassStop }
			: { init: glassInit, view: glassView, select: glassSelect, point: glassPoint, stop: glassStop },
		prototype: sProto
			? { init: sProto.renderAltInit, view: sProto.renderAltView, select: sProto.renderAltSetSelection, point: sProto.renderAltPointToCell, stop: sProto.renderAltStop }
			: { init: renderAltInit, view: renderAltView, select: renderAltSetSelection, point: renderAltPointToCell, stop: renderAltStop }
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

// stop the old skin, init the new one and re-publish the live view so nothing is lost on switch
function skinSelect(name) {
	if (!SKINS[name] || name === activeName) return;
	const table = skinTable();
	table[activeName].stop();
	activeName = name;
	activeSkin = table[name];
	activeSkin.init(rootRef);
	if (lastView) activeSkin.view(lastView);
	activeSkin.select(lastSelection);
	syncSkinSelect();
}

function bindSkinSelect() {
	const el = typeof document !== 'undefined' ? document.getElementById('skin') : null;
	if (!el) return;
	el.addEventListener('change', function () { skinSelect(el.value); });
	syncSkinSelect();
}

function syncSkinSelect() {
	const el = typeof document !== 'undefined' ? document.getElementById('skin') : null;
	if (el) el.value = activeName;
}

if (typeof module !== 'undefined') module.exports = {
	renderInit,
	renderView,
	renderSetSelection,
	renderPointToCell,
	skinName,
	skinSelect
};
