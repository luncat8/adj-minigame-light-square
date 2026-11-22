// owns: Sound panel DOM controls, dynamic variant parameter block, mute toggle and localStorage persistence
// edit for: Sound panel defaults, control bindings, labels and storage schema

const SP_STORAGE_KEY = 'lightSquareSound';
const SP_MODES = ['move', 'loop', 'bed', 'off'];
const SP_SCALES = ['majorPent', 'minorPent', 'lydian', 'wholeTone', 'hirajoshi'];
const SP_ROOTS = ['C', 'D', 'Eb', 'F', 'G', 'A', 'Bb'];
const SP_PITCHES = ['position', 'contour'];

let spPatchMod = null;
let spAudioMod = null;

const spCfg = {
	variant: 'glass',
	volume: 0.7,
	speed: 4,
	mode: 'move',
	scale: 'majorPent',
	root: 'C',
	pitchSource: 'position',
	width: 0.85,
	reverb: 0.45,
	bedLevel: 0.5,
	params: {}
};

function spPatches() {
	if (!spPatchMod && typeof module !== 'undefined' && module.exports) spPatchMod = require('./patches.js');
	return spPatchMod ? spPatchMod.PATCH_LIST : PATCH_LIST;
}

function spPatchById(id) {
	if (!spPatchMod && typeof module !== 'undefined' && module.exports) spPatchMod = require('./patches.js');
	return (spPatchMod ? spPatchMod.patchById : patchById)(id);
}

function spAudio() {
	if (!spAudioMod && typeof module !== 'undefined' && module.exports) spAudioMod = require('./audio.js');
	return spAudioMod;
}

function spEl(id) {
	return typeof document !== 'undefined' ? document.getElementById(id) : null;
}

function spClamp(val, min, max, fallback) {
	const num = Number(val);
	return Number.isFinite(num) ? Math.min(max, Math.max(min, num)) : fallback;
}

function spChoice(val, allowed, fallback) {
	return allowed.includes(val) ? val : fallback;
}

function spResetDefaults() {
	spCfg.variant = 'glass';
	spCfg.volume = 0.7;
	spCfg.speed = 4;
	spCfg.mode = 'move';
	spCfg.scale = 'majorPent';
	spCfg.root = 'C';
	spCfg.pitchSource = 'position';
	spCfg.width = 0.85;
	spCfg.reverb = 0.45;
	spCfg.bedLevel = 0.5;
	spCfg.params = {};
	const list = spPatches();
	for (let i = 0; i < list.length; i++) {
		const patch = list[i];
		const map = {};
		for (let j = 0; j < patch.params.length; j++) {
			const d = patch.params[j];
			map[d.key] = d.def;
		}
		spCfg.params[patch.id] = map;
	}
}

function spLoadStorage() {
	spResetDefaults();
	if (typeof localStorage === 'undefined' || !localStorage) return;
	let raw = null;
	try {
		raw = localStorage.getItem(SP_STORAGE_KEY);
	} catch {
		return;
	}
	if (!raw || typeof raw !== 'string') return;
	let data = null;
	try {
		data = JSON.parse(raw);
	} catch {
		return;
	}
	if (!data || typeof data !== 'object' || Array.isArray(data)) return;
	const list = spPatches();
	const ids = list.map(p => p.id);
	spCfg.variant = spChoice(data.variant, ids, 'glass');
	spCfg.volume = spClamp(data.volume, 0, 1, 0.7);
	spCfg.speed = spClamp(data.speed, 1, 16, 4);
	spCfg.mode = spChoice(data.mode, SP_MODES, 'move');
	spCfg.scale = spChoice(data.scale, SP_SCALES, 'majorPent');
	spCfg.root = spChoice(data.root, SP_ROOTS, 'C');
	spCfg.pitchSource = spChoice(data.pitchSource, SP_PITCHES, 'position');
	spCfg.width = spClamp(data.width, 0, 1, 0.85);
	spCfg.reverb = spClamp(data.reverb, 0, 1, 0.45);
	spCfg.bedLevel = spClamp(data.bedLevel, 0, 1, 0.5);
	if (!data.params || typeof data.params !== 'object') return;
	for (let i = 0; i < list.length; i++) {
		const patch = list[i];
		const saved = data.params[patch.id];
		if (!saved || typeof saved !== 'object') continue;
		for (let j = 0; j < patch.params.length; j++) {
			const d = patch.params[j];
			spCfg.params[patch.id][d.key] = spClamp(saved[d.key], d.min, d.max, d.def);
		}
	}
}

function spSaveStorage() {
	if (typeof localStorage === 'undefined' || !localStorage) return;
	try {
		localStorage.setItem(SP_STORAGE_KEY, JSON.stringify(spCfg));
	} catch {}
}

function spSyncLabels() {
	const onBtn = spEl('snd-on');
	const a = spAudio();
	const isOn = a ? a.soundIsOn() : (typeof soundIsOn !== 'undefined' ? soundIsOn() : false);
	if (onBtn) {
		onBtn.textContent = isOn ? 'Sound on · M' : 'Sound off · M';
		if (onBtn.setAttribute) onBtn.setAttribute('aria-pressed', isOn ? 'true' : 'false');
		onBtn.ariaPressed = isOn ? 'true' : 'false';
	}
	const volLbl = spEl('snd-volume-label');
	if (volLbl) volLbl.textContent = 'Vol ' + Math.round(spCfg.volume * 100) + '%';
	const spdLbl = spEl('snd-speed-label');
	if (spdLbl) spdLbl.textContent = 'Speed ' + spCfg.speed + '/s';
}

function spSyncControls() {
	const setVal = (id, v) => { const el = spEl(id); if (el) el.value = String(v); };
	setVal('snd-variant', spCfg.variant);
	setVal('snd-volume', Math.round(spCfg.volume * 100));
	setVal('snd-speed', spCfg.speed);
	setVal('snd-mode', spCfg.mode);
	setVal('snd-scale', spCfg.scale);
	setVal('snd-root', spCfg.root);
	setVal('snd-pitch', spCfg.pitchSource);
	setVal('snd-width', Math.round(spCfg.width * 100));
	setVal('snd-reverb', Math.round(spCfg.reverb * 100));
	setVal('snd-bed', Math.round(spCfg.bedLevel * 100));
	spSyncLabels();
}

function spFormatParam(val, step) {
	return step < 0.01 ? val.toFixed(3) : (step < 1 ? val.toFixed(2) : String(Math.round(val)));
}

// rebuilds only the variant parameter block when switching variants; per-variant values stay in spCfg.params
function spRebuildParams() {
	const host = spEl('snd-params');
	if (!host || typeof document === 'undefined' || !document.createElement) return;
	host.textContent = '';
	if (host.children) host.children.length = 0;
	const patch = spPatchById(spCfg.variant);
	const vals = spCfg.params[patch.id] || (spCfg.params[patch.id] = {});
	for (let i = 0; i < patch.params.length; i++) {
		const d = patch.params[i];
		const cur = spClamp(vals[d.key], d.min, d.max, d.def);
		vals[d.key] = cur;
		const wrap = document.createElement('label');
		const span = document.createElement('span');
		span.id = 'snd-param-label-' + d.key;
		span.textContent = d.label + ' ' + spFormatParam(cur, d.step);
		const input = document.createElement('input');
		input.type = 'range';
		input.id = 'snd-param-' + d.key;
		input.min = String(d.min);
		input.max = String(d.max);
		input.step = String(d.step);
		input.value = String(cur);
		const onInput = () => {
			const v = spClamp(input.value, d.min, d.max, d.def);
			vals[d.key] = v;
			span.textContent = d.label + ' ' + spFormatParam(v, d.step);
			spSaveStorage();
			spNotifyAudio();
		};
		input.addEventListener('input', onInput);
		input.addEventListener('change', onInput);
		if (wrap.appendChild) {
			wrap.appendChild(span);
			wrap.appendChild(input);
		}
		if (host.appendChild) host.appendChild(wrap);
	}
}

function spNotifyAudio() {
	const a = spAudio();
	if (a) a.soundApplySettings();
	else if (typeof soundApplySettings !== 'undefined') soundApplySettings();
}

function soundPanelToggle() {
	const a = spAudio();
	const cur = a ? a.soundIsOn() : soundIsOn();
	if (a) a.soundSetOn(!cur);
	else soundSetOn(!cur);
	spSyncLabels();
}

function soundPanelSettings() {
	return spCfg;
}

function soundPanelInit() {
	spLoadStorage();
	spSyncControls();
	spRebuildParams();

	const onBtn = spEl('snd-on');
	if (onBtn) onBtn.addEventListener('click', soundPanelToggle);

	const replayBtn = spEl('snd-replay');
	if (replayBtn) {
		replayBtn.addEventListener('click', () => {
			const a = spAudio();
			if (a) a.soundReplay();
			else soundReplay();
			spSyncLabels();
		});
	}

	const bindRange = (id, apply) => {
		const el = spEl(id);
		if (!el) return;
		const handler = () => {
			apply(el.value);
			spSyncLabels();
			spSaveStorage();
			spNotifyAudio();
		};
		el.addEventListener('input', handler);
		el.addEventListener('change', handler);
	};

	const bindSelect = (id, apply) => {
		const el = spEl(id);
		if (!el) return;
		el.addEventListener('change', () => {
			apply(el.value);
			spSyncLabels();
			spSaveStorage();
			spNotifyAudio();
		});
	};

	bindSelect('snd-variant', v => {
		const ids = spPatches().map(p => p.id);
		spCfg.variant = spChoice(v, ids, spCfg.variant);
		spRebuildParams();
	});
	bindRange('snd-volume', v => { spCfg.volume = spClamp(Number(v) / 100, 0, 1, spCfg.volume); });
	bindRange('snd-speed', v => { spCfg.speed = spClamp(v, 1, 16, spCfg.speed); });
	bindSelect('snd-mode', v => { spCfg.mode = spChoice(v, SP_MODES, spCfg.mode); });
	bindSelect('snd-scale', v => { spCfg.scale = spChoice(v, SP_SCALES, spCfg.scale); });
	bindSelect('snd-root', v => { spCfg.root = spChoice(v, SP_ROOTS, spCfg.root); });
	bindSelect('snd-pitch', v => { spCfg.pitchSource = spChoice(v, SP_PITCHES, spCfg.pitchSource); });
	bindRange('snd-width', v => { spCfg.width = spClamp(Number(v) / 100, 0, 1, spCfg.width); });
	bindRange('snd-reverb', v => { spCfg.reverb = spClamp(Number(v) / 100, 0, 1, spCfg.reverb); });
	bindRange('snd-bed', v => { spCfg.bedLevel = spClamp(Number(v) / 100, 0, 1, spCfg.bedLevel); });
}

if (typeof module !== 'undefined') module.exports = {
	SP_STORAGE_KEY,
	soundPanelInit,
	soundPanelSettings,
	soundPanelToggle
};
