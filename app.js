// owns: root, $ and boot wiring; implements nothing

const aRender = typeof module !== 'undefined' && module.exports ? require('./skins.js') : null;
const aSound = typeof module !== 'undefined' && module.exports ? require('./soundpanel.js') : null;
const aGame = typeof module !== 'undefined' && module.exports ? require('./game.js') : null;
const aInput = typeof module !== 'undefined' && module.exports ? require('./input.js') : null;

const fRenderInit = aRender ? aRender.renderInit : renderInit;
const fSoundInit = aSound ? aSound.soundPanelInit : soundPanelInit;
const fGameInit = aGame ? aGame.gameInit : gameInit;
const fInputInit = aInput ? aInput.inputInit : inputInit;

const $ = id => document.getElementById(id);
const root = $('canv');
fRenderInit(root);
fSoundInit();
fGameInit();
fInputInit(root);
