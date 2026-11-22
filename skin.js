// owns: skin registry, active selection and the neutral render adapters
// edit for: skin entry-point names, optional fallbacks
//
// a skin implements { init(root), view(v), setSelection(ring), pointToCell(x, y) }
// the engine calls the global render* adapters below; they delegate to Skin.active
// and are safe no-ops when no skin is registered, so render is optional.

const Skin = { registry: {}, active: null };

function skinRegister(name, impl) {
	Skin.registry[name] = impl;
	if (!Skin.active) Skin.active = impl;
}

function skinSelect(name) {
	const s = Skin.registry[name];
	if (s) Skin.active = s;
}

function renderInit(root) {
	if (Skin.active && Skin.active.init) Skin.active.init(root);
}

function renderView(v) {
	if (Skin.active && Skin.active.view) Skin.active.view(v);
}

function renderSetSelection(ring) {
	if (Skin.active && Skin.active.setSelection) Skin.active.setSelection(ring);
}

function renderPointToCell(x, y) {
	return Skin.active && Skin.active.pointToCell ? Skin.active.pointToCell(x, y) : null;
}

if (typeof module !== 'undefined' && module.exports) {
	module.exports = { Skin, skinRegister, skinSelect, renderInit, renderView, renderSetSelection, renderPointToCell };
}
