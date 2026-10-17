'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { assessSolidContrast } = require('./helpers/contrast-solid.cjs');
const fs = require('node:fs');
const path = require('node:path');

test('Documents reading backgrounds preserve legacy owners and apply only to V3', () => {
  const css = fs.readFileSync(path.join(__dirname, '../assets/document-vault.css'), 'utf8');
  const headers = [...css.matchAll(/body\[data-trip-kind="custom"\]\.tm-new-design\[data-trip-view="documents"\] #documents>\.section-head\{([^}]+)\}/g)];
  const intros = [...css.matchAll(/body\[data-trip-kind="custom"\]\.tm-new-design\[data-trip-view="documents"\] #documents \.vault-intro\{([^}]+)\}/g)];
  assert.ok(headers.length); assert.ok(intros.length);
  for (const rule of [...headers, ...intros]) {
    const background = /background\s*:\s*([^;\n]+)/.exec(rule[1]);
    if (background) assert.equal(background[1].trim(), 'transparent', 'Every legacy owner must keep its transparent/default background');
  }
  for (const intro of intros) assert.match(intro[1], /background:transparent;/, 'Legacy intro must remain transparent');
  const scoped = css.match(/\/\* V3 reading backgrounds[^]*?\*\/\s*([^{}]+)\{([^}]+)\}/);
  assert.ok(scoped, 'Reading surfaces must be owned by a V3-only rule');
  const selectors = scoped[1].trim().split(/,\s*/);
  assert.equal(selectors.length, 2);
  assert.deepEqual(selectors, [
    'body[data-trip-kind="custom"].tm-new-design[data-design="v3"][data-trip-view="documents"] #documents>.section-head',
    'body[data-trip-kind="custom"].tm-new-design[data-design="v3"][data-trip-view="documents"] #documents .vault-intro'
  ]);
  assert.equal(scoped[2].trim(), 'background:var(--tm-documents-shell)');
});
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

const rect = (left = 0, top = 0, right = 200, bottom = 100) => ({ left, top, right, bottom });
const geometry = () => ({
  borderBox: rect(), paddingBox: rect(1, 1, 199, 99), radii: [[18, 18], [18, 18], [18, 18], [18, 18]],
  fragments: 1, transform: 'none', translate: 'none', rotate: 'none', scale: 'none', perspective: 'none',
  zoom: '1', clip: 'auto', contain: 'none', overflowX: 'visible', overflowY: 'visible'
});
function occluded() {
  return {
    foreground: [255, 255, 255, 1],
    geometry: { textRects: [rect(20, 20, 180, 40)], issues: [] },
    layers: [
      solid('canvas', { geometry: geometry(), backgroundImage: 'url(synthetic-photo)' }),
      solid('card', { geometry: geometry(), backgroundClip: 'border-box' }),
      solid('text', { geometry: geometry(), background: [0, 0, 0, 0] })
    ]
  };
}
test('proven opaque rounded card hides lower photo paint over every actual text fragment', () => {
  const data = occluded(), before = JSON.stringify(data);
  data.geometry.textRects.push(rect(30, 50, 170, 70));
  const result = assessSolidContrast(data);
  assert.equal(result.status, 'VERIFIED'); assert.equal(result.minimumContrast, 21);
  assert.equal(result.occlusion.barrierIndex, 1);
  assert.ok(result.occlusion.hiddenBackgrounds[0].reason.includes('gradient/image paint'));
  data.geometry.textRects.pop(); assert.equal(JSON.stringify(data), before, 'Full evidence must not be mutated');
});
test('opaque occlusion does not turn low contrast into a pass', () => {
  const data = occluded(); data.foreground = [30, 30, 30, 1];
  const result = assessSolidContrast(data);
  assert.equal(result.status, 'VERIFIED'); assert.equal(result.passes, false); assert.ok(result.minimumContrast < 4.5);
});
test('only the captured proven negative-z body canvas can precede an opaque card', () => {
  const data = occluded();
  Object.assign(data.layers[0], { label: 'BODY::after', pseudo: true, mobileCanvasProven: true });
  const result = assessSolidContrast(data);
  assert.equal(result.status, 'VERIFIED'); assert.equal(result.minimumContrast, 21);
});
for (const [name, mutate] of [
  ['near-opaque surface', s => { s.layers[1].background[3] = .999; }],
  ['missing text geometry', s => { delete s.geometry; }],
  ['empty text fragments', s => { s.geometry.textRects = []; }],
  ['one uncovered fragment', s => { s.geometry.textRects.push(rect(190, 90, 210, 110)); }],
  ['rounded corner outside paint', s => { s.geometry.textRects = [rect(1, 1, 5, 5)]; }],
  ['padding-box clip unsupported', s => { s.layers[1].backgroundClip = 'padding-box'; }],
  ['text background clip', s => { s.layers[1].backgroundClip = 'text'; }],
  ['missing ancestor geometry', s => { delete s.layers[0].geometry; }],
  ['missing radius', s => { delete s.layers[1].geometry.radii; }],
  ['fragmented background', s => { s.layers[1].geometry.fragments = 2; }],
  ['ancestor overflow clips text', s => { s.layers[0].geometry.overflowX = 'hidden'; s.layers[0].geometry.paddingBox = rect(0, 0, 30, 100); }],
  ['rounded ancestor overflow corner', s => { s.layers[0].geometry.overflowX = 'hidden'; s.layers[0].geometry.radii = [[90, 45], [90, 45], [90, 45], [90, 45]]; }],
  ['invalid text coordinates', s => { s.geometry.textRects[0].left = NaN; }],
  ['ancestor transform', s => { s.layers[0].geometry.transform = 'scale(.5)'; }],
  ['ancestor legacy clip', s => { s.layers[0].geometry.clip = 'rect(0, 20px, 20px, 0)'; }],
  ['ancestor opacity', s => { s.layers[0].opacity = .9; }],
  ['ancestor filter', s => { s.layers[0].filter = 'blur(1px)'; }],
  ['ancestor backdrop filter', s => { s.layers[0].backdropFilter = 'blur(2px)'; }],
  ['ancestor blend', s => { s.layers[0].mixBlendMode = 'screen'; }],
  ['ancestor background blend', s => { s.layers[0].backgroundBlendMode = 'multiply'; }],
  ['ancestor mask', s => { s.layers[0].maskImage = 'url(mask)'; }],
  ['ancestor clip path', s => { s.layers[0].clipPath = 'circle(20%)'; }],
  ['ancestor inset shadow', s => { s.layers[0].boxShadow = 'inset 0 0 30px white'; }],
  ['unknown background', s => { s.layers[0].background = null; }],
  ['gradient above barrier', s => { s.layers[2].backgroundImage = 'linear-gradient(white, black)'; }],
  ['gradient on barrier', s => { s.layers[1].backgroundImage = 'linear-gradient(white, black)'; }],
  ['pseudo can overlay descendants regardless of array position', s => { s.layers.splice(1, 0, solid('ancestor::after', { pseudo: true, geometry: geometry() })); }],
  ['unrelated pseudo cannot claim the body canvas proof', s => { Object.assign(s.layers[0], { label: 'card::after', pseudo: true, mobileCanvasProven: true }); }],
  ['captured descendant paint uncertainty', s => { s.geometry.issues.push('descendant pseudo may paint over text'); }]
]) {
  test('opaque occlusion rejects ' + name, () => {
    const data = occluded(); mutate(data);
    const result = assessSolidContrast(data);
    assert.equal(result.status, 'NOT VERIFIED'); assert.equal(result.minimumContrast, null); assert.equal(result.passes, false);
  });
}

for (const [theme, background, primary, secondary] of [
  ['light', [255, 255, 255, 1], [16, 42, 77, 1], [88, 113, 142, 1]],
  ['dark', [24, 50, 73, 1], [241, 248, 255, 1], [185, 207, 220, 1]]
]) {
  test('C1 ' + theme + ' primary and secondary on opaque local surface meet 4.5', () => {
    for (const foreground of [primary, secondary]) {
      const data = occluded(); data.layers[1].background = background; data.foreground = foreground;
      const result = assessSolidContrast(data);
      assert.equal(result.status, 'VERIFIED'); assert.ok(result.minimumContrast >= 4.5); assert.equal(result.passes, true);
    }
  });
}
