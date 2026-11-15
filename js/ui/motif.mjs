/**
 * The cover drawing: South Australia's council boundaries as fine lines,
 * made from the same boundary file as the map (ABS ASGS Edition 3, LGA 2023).
 * Decorative only, so it is hidden from assistive technology.
 */
export function motifSVG(topo, size = 620) {
  const d3 = window.d3, tj = window.topojson;
  if (!d3 || !tj || !topo) return '';
  const obj = topo.objects.lga;
  const coast = tj.mesh(topo, obj, (a, b) => a === b), inner = tj.mesh(topo, obj, (a, b) => a !== b);
  const proj = d3.geoConicConformal().parallels([-28, -36]).rotate([-135, 0]).fitSize([size, size], coast);
  const path = d3.geoPath(proj);
  return `<svg viewBox="0 0 ${size} ${size}" focusable="false"><path class="motif-in" d="${path(inner)}"/><path class="motif-out" d="${path(coast)}"/></svg>`;
}
