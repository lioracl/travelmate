'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { assessSolidContrast } = require('./helpers/contrast-solid.cjs');
const solid = (label = 'surface', overrides = {}) => ({
  label, background: [0, 0, 0, 1], opacity: 1, backgroundImage: 'none',
  filter: 'none', backdropFilter: 'none', mixBlendMode: 'normal',
  maskImage: 'none', clipPath: 'none', textShadow: 'none', boxShadow: 'none', ...overrides
});
const snapshot = layers => ({ foreground: [255, 255, 255, 1], layers });
function unverified(result, reason) {
  assert.equal(result.status, 'NOT VERIFIED');
  assert.equal(result.minimumContrast, null);
  assert.equal(result.passes, false);
  assert.ok(result.reasons.some(text => text.includes(reason)), JSON.stringify(result));
}
test('opaque solid source-over stack has the exact black/white contrast', () => {
  const result = assessSolidContrast(snapshot([solid()]));
  assert.equal(result.status, 'VERIFIED'); assert.equal(result.minimumContrast, 21); assert.equal(result.passes, true);
});
test('low foreground alpha is composited and cannot falsely pass', () => {
  const result = assessSolidContrast({ ...snapshot([solid()]), foreground: [255, 255, 255, 0.05] });
  assert.equal(result.status, 'VERIFIED'); assert.ok(result.minimumContrast < 1.2); assert.equal(result.passes, false);
});
test('low text-element opacity never returns a passing ratio', () => {
  unverified(assessSolidContrast(snapshot([solid('text', { opacity: 0.05 })])), 'text: element/ancestor opacity');
});
test('low ancestor opacity never returns a passing ratio', () => {
  unverified(assessSolidContrast(snapshot([solid('ancestor', { opacity: 0.1 }), solid('text')])), 'ancestor: element/ancestor opacity');
});
for (const [property, value] of [['filter', 'blur(2px)'], ['backdropFilter', 'blur(8px)'], ['maskImage', 'linear-gradient(black, transparent)'], ['clipPath', 'circle(20%)']]) {
  test('unsupported ' + property + ' is NOT VERIFIED without a ratio', () => {
    unverified(assessSolidContrast(snapshot([solid('ancestor', { [property]: value })])), 'unsupported ' + property);
  });
}
test('gradients receive no endpoint-only passing estimate', () => {
  unverified(assessSolidContrast(snapshot([solid('gradient', { backgroundImage: 'linear-gradient(in oklab, black, white)' })])), 'gradient/image paint');
});
test('unknown pseudo-element paint/order cannot pass', () => {
  unverified(assessSolidContrast(snapshot([solid('body::after', { pseudo: true, mobileCanvasProven: false })])), 'pseudo-element paint/order');
});
test('proven solid mobile canvas participates in the actual surface stack', () => {
  const result = assessSolidContrast(snapshot([
    solid('body', { background: [255, 255, 255, 1] }),
    solid('body::after', { pseudo: true, mobileCanvasProven: true })
  ]));
  assert.equal(result.status, 'VERIFIED'); assert.deepEqual(result.background, [0, 0, 0]); assert.equal(result.minimumContrast, 21);
});
test('mobile canvas gradients remain NOT VERIFIED even when its paint order is proven', () => {
  unverified(assessSolidContrast(snapshot([solid('body::after', {
    pseudo: true, mobileCanvasProven: true, backgroundImage: 'linear-gradient(90deg, rgba(0,0,0,.1), rgba(0,0,0,.2))'
  })])), 'body::after: gradient/image paint');
});
test('all ancestor layers are inspected with no silent 32-candidate limit', () => {
  const layers = Array.from({ length: 40 }, (_, i) => solid('layer-' + i));
  layers[39].filter = 'contrast(0)';
  unverified(assessSolidContrast(snapshot(layers)), 'layer-39: unsupported filter');
});
test('unresolved color data cannot issue a ratio', () => {
  unverified(assessSolidContrast({ foreground: null, layers: [solid()] }), 'Text color');
});
test('an unknown transparent canvas cannot be treated as white and falsely pass', () => {
  unverified(assessSolidContrast({ foreground: [0, 0, 0, 1], layers: [solid('transparent canvas', { background: [0, 0, 0, 0] })] }), 'Canvas color is unknown');
});
test('unsupported blending cannot issue a passing ratio', () => {
  unverified(assessSolidContrast(snapshot([solid('ancestor', { mixBlendMode: 'screen' })])), 'mix-blend-mode');
});
test('unsupported inset paint cannot issue a passing ratio', () => {
  unverified(assessSolidContrast(snapshot([solid('ancestor', { boxShadow: 'inset 0 0 50px white' })])), 'inset shadow');
});
