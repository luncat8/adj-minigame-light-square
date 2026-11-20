// owns: hint checkbox state and renderer-facing overlay selection
// edit for: independent hint visibility and preview suppression

function readHintControls() {
	return {
		current: document.getElementById('hint-current').checked,
		discoveries: document.getElementById('hint-discoveries').checked,
		targets: document.getElementById('hint-targets').checked
	};
}

function hintOverlay(progress, controls, preview) {
	return {
		current: !preview && controls.current && progress.result ? progress.result.status : null,
		discoveries: !preview && controls.discoveries ? progress.discoveries : null,
		targets: !preview && controls.targets ? progress.contract.requirements : null
	};
}

if (typeof module !== 'undefined') module.exports = { readHintControls, hintOverlay };
