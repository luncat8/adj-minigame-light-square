// owns: hint checkbox state and renderer-facing overlay selection
// edit for: independent hint visibility and preview suppression

function readHintControls() {
	return {
		current: document.getElementById('hint-current').checked,
		discoveries: document.getElementById('hint-discoveries').checked,
		targets: document.getElementById('hint-targets').checked
	};
}

// one scratch object: consumers read the fields immediately and never retain overlays
const overlayScratch = { current: null, discoveries: null, targets: null };

function hintOverlay(progress, controls, preview) {
	overlayScratch.current = !preview && controls.current && progress.result ? progress.result.status : null;
	overlayScratch.discoveries = !preview && controls.discoveries ? progress.discoveries : null;
	overlayScratch.targets = !preview && controls.targets ? progress.contract.requirements : null;
	return overlayScratch;
}

if (typeof module !== 'undefined') module.exports = { readHintControls, hintOverlay };
