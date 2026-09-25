/** Dependency-free SVG charts for self-contained HTML documents (they must open offline). */
import { esc } from "./common.js";

const niceMax = (v) => {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * p).find((m) => m >= v);
};
const fmt = (v, dp = 0) => Number(v).toLocaleString("en-GB", { maximumFractionDigits: dp, minimumFractionDigits: dp });

/** Grouped vertical bars. series: [{ name, color, values }] */
export function groupedBars(labels, series, { height = 260, unitPrefix = "", unitSuffix = "", dp = 0 } = {}) {
  const W = 760, H = height, L = 48, R = 10, T = 14, B = 54;
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values.filter((v) => v != null))));
  const cw = (W - L - R) / Math.max(1, labels.length);
  const bw = Math.min(22, (cw * 0.8) / series.length);
  const y = (v) => T + (H - T - B) * (1 - v / max);
  let g = "";
  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i;
    g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#e5e7eb"/><text x="${L - 6}" y="${y(v) + 3}" text-anchor="end" font-size="10" fill="#64748b">${unitPrefix}${fmt(v, max < 10 || v % 1 ? 1 : 0)}${unitSuffix}</text>`;
  }
  labels.forEach((lab, i) => {
    const x0 = L + i * cw + (cw - bw * series.length) / 2;
    series.forEach((s, j) => {
      const v = s.values[i];
      if (v == null) return;
      g += `<rect x="${x0 + j * bw}" y="${y(v)}" width="${bw - 2}" height="${Math.max(0, H - B - y(v))}" rx="2" fill="${s.color}"><title>${esc(lab)} — ${esc(s.name)}: ${unitPrefix}${fmt(v, dp)}${unitSuffix}</title></rect>`;
    });
    g += `<text x="${L + i * cw + cw / 2}" y="${H - B + 14}" font-size="10" fill="#334155" text-anchor="end" transform="rotate(-30 ${L + i * cw + cw / 2} ${H - B + 14})">${esc(lab)}</text>`;
  });
  const legend = series.map((s, i) => `<g transform="translate(${L + i * 220},${H - 12})"><rect width="10" height="10" y="-9" rx="2" fill="${s.color}"/><text x="15" font-size="11" fill="#334155">${esc(s.name)}</text></g>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" preserveAspectRatio="xMidYMid meet">${g}${legend}</svg>`;
}

/** Horizontal percentage bars (0..1). */
export function percentBars(labels, values, { colorFor } = {}) {
  const W = 760, rowH = 22, L = 110, R = 50, H = labels.length * rowH + 10;
  const col = colorFor || ((v) => (v >= 0.9 ? "#184f95" : v >= 0.7 ? "#2a78d6" : v >= 0.4 ? "#5598e7" : v >= 0.15 ? "#9ec5f4" : "#cde2fb"));
  let g = "";
  labels.forEach((lab, i) => {
    const v = values[i] ?? 0, yy = 5 + i * rowH;
    g += `<text x="${L - 8}" y="${yy + 14}" font-size="11" text-anchor="end" fill="#334155">${esc(lab)}</text>`;
    g += `<rect x="${L}" y="${yy + 3}" width="${W - L - R}" height="${rowH - 8}" rx="3" fill="#f1f5f9"/>`;
    g += `<rect x="${L}" y="${yy + 3}" width="${(W - L - R) * Math.min(1, v)}" height="${rowH - 8}" rx="3" fill="${col(v)}"/>`;
    g += `<text x="${L + (W - L - R) * Math.min(1, v) + 6}" y="${yy + 14}" font-size="10.5" fill="#0f172a">${Math.round(v * 100)}%</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img">${g}</svg>`;
}

/** Line chart. series: [{ name, color, values }] */
export function lineChart(labels, series, { height = 220, unitPrefix = "", unitSuffix = "" } = {}) {
  const W = 760, H = height, L = 48, R = 10, T = 12, B = 40;
  const all = series.flatMap((s) => s.values.filter((v) => v != null));
  const max = niceMax(Math.max(0, ...all));
  const x = (i) => L + ((W - L - R) * i) / Math.max(1, labels.length - 1);
  const y = (v) => T + (H - T - B) * (1 - v / max);
  let g = "";
  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i;
    g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#e5e7eb"/><text x="${L - 6}" y="${y(v) + 3}" text-anchor="end" font-size="10" fill="#64748b">${unitPrefix}${fmt(v, v % 1 ? 1 : 0)}${unitSuffix}</text>`;
  }
  const every = Math.max(1, Math.ceil(labels.length / 14));
  labels.forEach((lab, i) => { if (i % every === 0) g += `<text x="${x(i)}" y="${H - B + 14}" font-size="9.5" text-anchor="middle" fill="#475569">${esc(lab)}</text>`; });
  series.forEach((s) => {
    let d = "", pen = false;
    s.values.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `; pen = true; });
    g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.2"/>`;
  });
  const legend = series.map((s, i) => `<g transform="translate(${L + i * 240},${H - 6})"><rect width="14" height="3" y="-6" fill="${s.color}"/><text x="19" font-size="11" fill="#334155">${esc(s.name)}</text></g>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img">${g}${legend}</svg>`;
}
