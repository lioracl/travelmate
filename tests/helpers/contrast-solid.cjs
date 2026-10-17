'use strict';

// Deliberately limited to solid, source-over color layers. Unsupported paint
// never receives a ratio. This is a QA gate, not a general contrast engine.
function assessSolidContrast(snapshot) {
  const reasons = [];
  const rgba = value => Array.isArray(value) && value.length === 4 &&
    value.every(Number.isFinite) && value.slice(0, 3).every(v => v >= 0 && v <= 255) && value[3] >= 0 && value[3] <= 1;
  const layers = Array.isArray(snapshot.layers) ? snapshot.layers : [];
  if (!rgba(snapshot.foreground)) reasons.push('Text color could not be resolved to RGBA');
  if (!layers.length) reasons.push('No surface stack was captured');
  if (!layers.some(layer => rgba(layer.background) && layer.background[3] === 1)) reasons.push('Canvas color is unknown: no opaque solid base was captured');
  for (const layer of layers) {
    const label = layer.label || 'unknown layer';
    if (!rgba(layer.background)) reasons.push(label + ': unresolved background color');
    if (Number(layer.opacity) !== 1) reasons.push(label + ': element/ancestor opacity is unsupported');
    if (layer.backgroundImage && layer.backgroundImage !== 'none') reasons.push(label + ': gradient/image paint is unsupported: ' + layer.backgroundImage);
    for (const property of ['filter', 'backdropFilter', 'maskImage', 'clipPath']) {
      if (layer[property] && layer[property] !== 'none') reasons.push(label + ': unsupported ' + property + ' ' + layer[property]);
    }
    if (layer.mixBlendMode && layer.mixBlendMode !== 'normal') reasons.push(label + ': unsupported mix-blend-mode');
    if (layer.backgroundBlendMode && layer.backgroundBlendMode.split(',').some(v => v.trim() !== 'normal')) reasons.push(label + ': unsupported background-blend-mode');
    if (layer.backgroundClip && layer.backgroundClip.includes('text')) reasons.push(label + ': unsupported background-clip:text');
    if (layer.textShadow && layer.textShadow !== 'none') reasons.push(label + ': unsupported text-shadow');
    if (layer.boxShadow && /inset/.test(layer.boxShadow)) reasons.push(label + ': unsupported inset shadow');
    if (layer.pseudo && !layer.mobileCanvasProven) reasons.push(label + ': pseudo-element paint/order is not proven');
    if (layer.issue) reasons.push(label + ': ' + layer.issue);
  }
  if (reasons.length) return { status: 'NOT VERIFIED', minimumContrast: null, passes: false, reasons };
  const composite = (base, overlay) => overlay.slice(0, 3).map((v, i) => v * overlay[3] + base[i] * (1 - overlay[3]));
  let background = [255, 255, 255];
  for (const layer of layers) background = composite(background, layer.background);
  const foreground = composite(background, snapshot.foreground);
  const luminance = rgb => rgb.map(v => {
    v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
  const a = luminance(foreground), b = luminance(background);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  return { status: 'VERIFIED', minimumContrast: ratio, passes: ratio >= 4.5, reasons: [], foreground, background };
}
module.exports = { assessSolidContrast };

