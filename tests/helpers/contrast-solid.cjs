'use strict';

// Deliberately limited to solid, source-over color layers. Unsupported paint
// never receives a ratio. This is a QA gate, not a general contrast engine.
// The only occlusion extension is an axis-aligned, solid ancestor background
// proven to contain every captured text fragment. Effects are never occluded.
function opaqueBarrier(snapshot, layers, rgba) {
  const proof = snapshot.geometry;
  const rect = r => r && ['left', 'top', 'right', 'bottom'].every(k => Number.isFinite(r[k])) && r.right > r.left && r.bottom > r.top;
  if (!proof || !Array.isArray(proof.issues) || proof.issues.length || !Array.isArray(proof.textRects) || !proof.textRects.length || !proof.textRects.every(rect)) return -1;
  const inside = (a, b) => a.left >= b.left && a.right <= b.right && a.top >= b.top && a.bottom <= b.bottom;
  for (const layer of layers) {
    if (layer.pseudo) { if (!layer.mobileCanvasProven || String(layer.label).toUpperCase() !== 'BODY::AFTER') return -1; continue; }
    const g = layer.geometry;
    if (!g || !rect(g.borderBox) || !rect(g.paddingBox) || !inside(g.paddingBox, g.borderBox) ||
      !['transform', 'translate', 'rotate', 'scale', 'perspective', 'contain'].every(k => g[k] === 'none') ||
      g.clip !== 'auto' || Number(g.zoom) !== 1) return -1;
    // Overflow remains a clipping constraint even behind a solid child.
    for (const text of proof.textRects) {
      if (g.overflowX !== 'visible' && (text.left < g.paddingBox.left || text.right > g.paddingBox.right)) return -1;
      if (g.overflowY !== 'visible' && (text.top < g.paddingBox.top || text.bottom > g.paddingBox.bottom)) return -1;
    }
    if (!['visible', 'hidden', 'clip', 'auto', 'scroll'].includes(g.overflowX) || !['visible', 'hidden', 'clip', 'auto', 'scroll'].includes(g.overflowY)) return -1;
    if (g.overflowX !== 'visible' || g.overflowY !== 'visible') {
      if (!Array.isArray(g.radii) || g.radii.length !== 4 || !g.radii.every(r => Array.isArray(r) && r.length === 2 && r.every(v => Number.isFinite(v) && v >= 0))) return -1;
      // A conservative central rectangle also excludes rounded overflow
      // corners. Do not assume a clipped ancestor is hidden by the child.
      const insetX = Math.max(...g.radii.map(r => r[0])), insetY = Math.max(...g.radii.map(r => r[1]));
      const safe = { left: g.paddingBox.left + insetX, right: g.paddingBox.right - insetX, top: g.paddingBox.top + insetY, bottom: g.paddingBox.bottom - insetY };
      if (!proof.textRects.every(r => inside(r, safe))) return -1;
    }
  }
  for (let index = layers.length - 1; index >= 0; index--) {
    const layer = layers[index], g = layer.geometry;
    if (layer.pseudo || !rgba(layer.background) || layer.background[3] !== 1 || layer.backgroundImage !== 'none' || layer.backgroundClip !== 'border-box' || g.fragments !== 1) continue;
    if (!Array.isArray(g.radii) || g.radii.length !== 4 || !g.radii.every(r => Array.isArray(r) && r.length === 2 && r.every(v => Number.isFinite(v) && v >= 0))) continue;
    const box = g.borderBox, width = box.right - box.left, height = box.bottom - box.top;
    // CSS scales overlapping corner radii uniformly to fit the border box.
    const [tl, tr, br, bl] = g.radii;
    const factor = Math.min(1, ...[[width, tl[0] + tr[0]], [width, bl[0] + br[0]], [height, tl[1] + bl[1]], [height, tr[1] + br[1]]].filter(([, sum]) => sum > 0).map(([size, sum]) => size / sum));
    const corners = [
      [box.left, box.top, 1, 1, tl], [box.right, box.top, -1, 1, tr],
      [box.right, box.bottom, -1, -1, br], [box.left, box.bottom, 1, -1, bl]
    ];
    const pointInside = (x, y) => corners.every(([edgeX, edgeY, dx, dy, radius]) => {
      const rx = radius[0] * factor, ry = radius[1] * factor;
      const px = (x - edgeX) * dx, py = (y - edgeY) * dy;
      return !rx || !ry || px >= rx || py >= ry || ((px - rx) / rx) ** 2 + ((py - ry) / ry) ** 2 <= 1;
    });
    if (proof.textRects.every(r => inside(r, g.paddingBox) && [[r.left, r.top], [r.right, r.top], [r.right, r.bottom], [r.left, r.bottom]].every(([x, y]) => pointInside(x, y)))) return index;
  }
  return -1;
}

function assessSolidContrast(snapshot) {
  const reasons = [];
  const rgba = value => Array.isArray(value) && value.length === 4 &&
    value.every(Number.isFinite) && value.slice(0, 3).every(v => v >= 0 && v <= 255) && value[3] >= 0 && value[3] <= 1;
  const layers = Array.isArray(snapshot.layers) ? snapshot.layers : [];
  const barrierIndex = opaqueBarrier(snapshot, layers, rgba), hiddenBackgrounds = [];
  if (!rgba(snapshot.foreground)) reasons.push('Text color could not be resolved to RGBA');
  if (!layers.length) reasons.push('No surface stack was captured');
  if (!layers.some(layer => rgba(layer.background) && layer.background[3] === 1)) reasons.push('Canvas color is unknown: no opaque solid base was captured');
  for (const [index, layer] of layers.entries()) {
    const label = layer.label || 'unknown layer';
    if (!rgba(layer.background)) reasons.push(label + ': unresolved background color');
    if (Number(layer.opacity) !== 1) reasons.push(label + ': element/ancestor opacity is unsupported');
    if (layer.backgroundImage && layer.backgroundImage !== 'none') {
      const reason = label + ': gradient/image paint is unsupported: ' + layer.backgroundImage;
      if (index < barrierIndex) hiddenBackgrounds.push({ index, label, reason });
      else reasons.push(reason);
    }
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
  if (snapshot.geometry && snapshot.geometry.issues) reasons.push(...snapshot.geometry.issues);
  const occlusion = { barrierIndex, hiddenBackgrounds };
  if (reasons.length) return { status: 'NOT VERIFIED', minimumContrast: null, passes: false, reasons, occlusion };
  const composite = (base, overlay) => overlay.slice(0, 3).map((v, i) => v * overlay[3] + base[i] * (1 - overlay[3]));
  let background = [255, 255, 255];
  for (const layer of layers.slice(Math.max(0, barrierIndex))) background = composite(background, layer.background);
  const foreground = composite(background, snapshot.foreground);
  const luminance = rgb => rgb.map(v => {
    v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
  const a = luminance(foreground), b = luminance(background);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  return { status: 'VERIFIED', minimumContrast: ratio, passes: ratio >= 4.5, reasons: [], foreground, background, occlusion };
}
module.exports = { assessSolidContrast };
