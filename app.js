// owns: root, $ and boot wiring; implements nothing

const aRender = typeof module !== 'undefined' && module.exports ? require('./skins.js') : null;
const aGame = typeof module !== 'undefined' && module.exports ? require('./game.js') : null;
const aInput = typeof module !== 'undefined' && module.exports ? require('./input.js') : null;

const fRenderInit = aRender ? aRender.renderInit : renderInit;
const fGameInit = aGame ? aGame.gameInit : gameInit;
const fInputInit = aInput ? aInput.inputInit : inputInit;

const $ = id => document.getElementById(id);
const root = $('canv');
fRenderInit(root);
fGameInit();
fInputInit(root);
