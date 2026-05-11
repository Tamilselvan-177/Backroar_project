import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiJson } from "../../../api/client.js";
import { useDeleteConfirm } from "../../../context/DeleteConfirmContext.jsx";

export default function SubcategoriesPage() {
  const askDelete = useDeleteConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState({ subcategories: [], categories: [], total_pages: 1 });
  const [err, setErr] = useState(null);

  const qs = searchParams.toString();
  useEffect(() => {
    apiJson(`/api/admin/subcategories${qs ? `?${qs}` : ""}`)
      .then(setData)
      .catch((e) => setErr(e.message));
  }, [qs]);

  const setFilter = (key, value) => {
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev);
      if (value === "" || value == null) n.delete(key);
      else n.set(key, String(value));
      n.delete("page");
      return n;
    });
  };

  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const toggle = async (id) => {
    try {
      await apiJson(`/api/admin/subcategories/${id}/toggle-active`, { method: "POST", body: "{}" });
      apiJson(`/api/admin/subcategories${qs ? `?${qs}` : ""}`).then(setData);
    } catch (e) {
      alert(e.message);
    }
  };

  const onDelete = async (row) => {
    const label = String(row?.name ?? "").trim() || `#${row.id}`;
    const ok = await askDelete({
      title: "Delete this subcategory?",
      description: `Permanently remove “${label}”.\n\nThis cannot be undone.`,
    });
    if (!ok) return;
    try {
      await apiJson(`/api/admin/subcategories/${row.id}`, { method: "DELETE", body: "{}" });
      apiJson(`/api/admin/subcategories${qs ? `?${qs}` : ""}`).then(setData);
    } catch (e) {
      alert(e.body?.error === "subcategory_has_products" ? `Has ${e.body.count} products` : e.message);
    }
  };

  if (err) return <p className="text-red-600">{err}</p>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-black">Subcategories</h1>
        <Link to="/admin/subcategories/create" className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold">
          Add subcategory
        </Link>
      </div>
      <div className="flex flex-wrap gap-3 mb-4 text-sm">
        <input
          placeholder="Search name/slug"
          className="border rounded px-3 py-2"
          defaultValue={searchParams.get("q") ?? ""}
          onBlur={(e) => setFilter("q", e.target.value.trim())}
        />
        <select
          className="border rounded px-3 py-2"
          value={searchParams.get("category_id") ?? ""}
          onChange={(e) => setFilter("category_id", e.target.value)}
        >
          <option value="">All categories</option>
          {data.categories?.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className="border rounded px-3 py-2"
          value={searchParams.get("active") ?? ""}
          onChange={(e) => setFilter("active", e.target.value)}
        >
          <option value="">Any active</option>
          <option value="1">Active</option>
          <option value="0">Inactive</option>
        </select>
      </div>
      <div className="overflow-x-auto border rounded-lg bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 text-left">
            <tr>
              <th className="p-3">ID</th>
              <th className="p-3">Name</th>
              <th className="p-3">Category</th>
              <th className="p-3">Active</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {data.subcategories?.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-3">{r.id}</td>
                <td className="p-3 font-medium">{r.name}</td>
                <td className="p-3 text-gray-600">{r.category_name ?? "—"}</td>
                <td className="p-3">{r.is_active ? "Yes" : "No"}</td>
                <td className="p-3 space-x-2 whitespace-nowrap">
                  <Link to={`/admin/subcategories/${r.id}/edit`} className="text-blue-600 underline">
                    Edit
                  </Link>
                  <button type="button" className="text-gray-700 underline" onClick={() => toggle(r.id)}>
                    Toggle
                  </button>
                  <button type="button" className="text-red-600 underline" onClick={() => onDelete(r)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.total_pages > 1 ? (
        <div className="flex gap-2 mt-4 flex-wrap">
          {Array.from({ length: data.total_pages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              type="button"
              className={`px-3 py-1 rounded border ${p === page ? "bg-gray-900 text-white" : ""}`}
              onClick={() => setSearchParams((prev) => { const n = new URLSearchParams(prev); n.set("page", String(p)); return n; })}
            >
              {p}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
