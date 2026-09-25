/**
 * Renders the small markdown subset used by knowledge articles: "## " headings, "- "
 * bullets, "1. " steps, **bold**, *italic*, "| a | b |" tables and "> " callouts.
 * Mirrors the server's document renderer so an article looks the same on screen and paper.
 */
function inline(text, key) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0, m, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    out.push(t.startsWith("**") ? <b key={`${key}-${i++}`}>{t.slice(2, -2)}</b> : <i key={`${key}-${i++}`}>{t.slice(1, -1)}</i>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function parse(md = "") {
  const lines = String(md).replace(/\r/g, "").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if (/^##\s+/.test(l)) { blocks.push({ type: "h2", text: l.replace(/^##\s+/, "") }); i++; continue; }
    const take = (re, strip) => { const buf = []; while (i < lines.length && re.test(lines[i])) buf.push(lines[i++].replace(strip, "")); return buf; };
    if (/^>\s?/.test(l)) { blocks.push({ type: "quote", text: take(/^>\s?/, /^>\s?/).join(" ") }); continue; }
    if (/^\|/.test(l)) {
      const rows = take(/^\|/, /^$/).map((r) => r.replace(/^\||\|\s*$/g, "").split("|").map((c) => c.trim())).filter((r) => !r.every((c) => /^-+$/.test(c)));
      blocks.push({ type: "table", rows }); continue;
    }
    if (/^-\s+/.test(l)) { blocks.push({ type: "ul", items: take(/^-\s+/, /^-\s+/) }); continue; }
    if (/^\d+\.\s+/.test(l)) { blocks.push({ type: "ol", items: take(/^\d+\.\s+/, /^\d+\.\s+/) }); continue; }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(##\s|>|\||-\s|\d+\.\s)/.test(lines[i])) buf.push(lines[i++]);
    blocks.push({ type: "p", text: buf.join(" ") });
  }
  return blocks;
}

export default function Markdown({ text, accent = "var(--brand,#0E7C7B)" }) {
  return (
    <div style={{ fontSize: 13.5, lineHeight: 1.65 }}>
      {parse(text).map((b, k) => {
        if (b.type === "h2") return <h3 key={k} style={{ fontSize: 15, margin: "16px 0 6px" }}>{inline(b.text, k)}</h3>;
        if (b.type === "p") return <p key={k} style={{ margin: "0 0 10px" }}>{inline(b.text, k)}</p>;
        if (b.type === "quote") return <div key={k} style={{ borderLeft: `4px solid ${accent}`, background: "#f0f9ff", padding: "10px 14px", borderRadius: 8, margin: "10px 0" }}>{inline(b.text, k)}</div>;
        if (b.type === "ul") return <ul key={k} style={{ margin: "0 0 10px", paddingLeft: 20 }}>{b.items.map((x, j) => <li key={j} style={{ marginBottom: 3 }}>{inline(x, `${k}-${j}`)}</li>)}</ul>;
        if (b.type === "ol") return <ol key={k} style={{ margin: "0 0 10px", paddingLeft: 20 }}>{b.items.map((x, j) => <li key={j} style={{ marginBottom: 5 }}>{inline(x, `${k}-${j}`)}</li>)}</ol>;
        if (b.type === "table") return (
          <div key={k} style={{ overflowX: "auto", margin: "8px 0 12px" }}>
            <table className="tbl" style={{ fontSize: 12.5 }}>
              <thead><tr>{b.rows[0].map((c, j) => <th key={j}>{inline(c, `${k}h${j}`)}</th>)}</tr></thead>
              <tbody>{b.rows.slice(1).map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j} style={{ whiteSpace: "normal" }}>{inline(c, `${k}-${ri}-${j}`)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        );
        return null;
      })}
    </div>
  );
}
