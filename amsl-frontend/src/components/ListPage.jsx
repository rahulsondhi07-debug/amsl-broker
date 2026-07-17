import { useList, Card, Spinner, ErrorBanner, Pager } from "./ui.jsx";

/**
 * columns: [{ key, label, render?(row), className? }]
 * toolbar: optional JSX (e.g. an Add button)
 */
export default function ListPage({ title, desc, resource, columns, searchable = true, toolbar, limit = 10, reloadKey }) {
  const { data, meta, loading, error, page, setPage, q, setQ, reload } = useList(resource, { limit, deps: [reloadKey] });

  return (
    <>
      <div className="page-head">
        <div>
          <h2>{title}</h2>
          {desc && <div className="desc">{desc}</div>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {searchable && (
            <div className="search" style={{ maxWidth: 220 }}>
              <input placeholder="Search…" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} style={{ paddingLeft: 12 }} />
            </div>
          )}
          {toolbar}
        </div>
      </div>

      <Card>
        {loading ? <Spinner /> : error ? <ErrorBanner error={error} onRetry={reload} /> : (
          <>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
                <tbody>
                  {data.map((row) => (
                    <tr key={row.id}>
                      {columns.map((c) => (
                        <td key={c.key} className={c.className}>{c.render ? c.render(row) : (row[c.key] ?? "—")}</td>
                      ))}
                    </tr>
                  ))}
                  {!data.length && <tr><td colSpan={columns.length} className="state">No records found.</td></tr>}
                </tbody>
              </table>
            </div>
            <Pager meta={meta} page={page} setPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
