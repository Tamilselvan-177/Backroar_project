import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiJson } from "../../../api/client.js";

function defaultRoleId(roles) {
  const staff = roles.find((r) => String(r.name).toLowerCase() === "staff");
  return staff?.id ?? roles[0]?.id ?? "";
}

export default function StaffEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isCreate = !id;
  const [stores, setStores] = useState([]);
  const [roles, setRoles] = useState([]);
  const [catalogShopFilter, setCatalogShopFilter] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    shop_id: "",
    role_id: "",
    is_active: true,
    catalog_extra_shop_ids: [],
  });
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (isCreate) {
      apiJson("/api/admin/staff/form-options")
        .then((d) => {
          setStores(d.stores ?? []);
          const rlist = d.roles ?? [];
          setRoles(rlist);
          setForm((f) => ({ ...f, role_id: String(defaultRoleId(rlist) || "") }));
        })
        .catch((e) => setErr(e.message));
      return;
    }
    apiJson(`/api/admin/staff/${id}`)
      .then((d) => {
        setStores(d.stores ?? []);
        setRoles(d.roles ?? []);
        const u = d.user;
        const rlist = d.roles ?? [];
        const rid =
          u.role_id != null && u.role_id !== ""
            ? String(u.role_id)
            : String(defaultRoleId(rlist) || "");
        const extras = Array.isArray(u.catalog_extra_shop_ids)
          ? [...new Set(u.catalog_extra_shop_ids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))]
          : [];
        setForm({
          name: u.name ?? "",
          email: u.email ?? "",
          phone: u.phone ?? "",
          password: "",
          shop_id: u.shop_id != null ? String(u.shop_id) : "",
          role_id: rid,
          is_active: !!(u.is_active === 1 || u.is_active === true),
          catalog_extra_shop_ids: extras,
        });
      })
      .catch((e) => setErr(e.message));
  }, [id, isCreate]);

  function setAssignedShop(shopIdStr) {
    setForm((f) => {
      const sid = shopIdStr ? Number(shopIdStr) : null;
      let extras = f.catalog_extra_shop_ids.filter((x) => x !== sid);
      if (!sid) extras = [];
      return {
        ...f,
        shop_id: shopIdStr,
        catalog_extra_shop_ids: extras,
      };
    });
  }

  function toggleCatalogShop(storeId, checked) {
    const sid = Number(storeId);
    if (!Number.isFinite(sid)) return;
    setForm((f) => {
      const primary = f.shop_id ? Number(f.shop_id) : null;
      if (sid === primary) return f;
      const next = checked
        ? [...new Set([...f.catalog_extra_shop_ids, sid])]
        : f.catalog_extra_shop_ids.filter((x) => x !== sid);
      return { ...f, catalog_extra_shop_ids: next };
    });
  }

  const primaryShopNum = form.shop_id ? Number(form.shop_id) : null;

  const storesSorted = useMemo(() => {
    const list = [...stores];
    list.sort((a, b) => {
      const ai = Number(a.id);
      const bi = Number(b.id);
      if (primaryShopNum != null) {
        if (ai === primaryShopNum) return -1;
        if (bi === primaryShopNum) return 1;
      }
      return String(a.name ?? "").localeCompare(String(b.name ?? ""), undefined, { sensitivity: "base" });
    });
    return list;
  }, [stores, primaryShopNum]);

  const storesFiltered = useMemo(() => {
    const q = catalogShopFilter.trim().toLowerCase();
    if (!q) return storesSorted;
    return storesSorted.filter((s) => {
      const name = String(s.name ?? "").toLowerCase();
      const code = String(s.code ?? "").toLowerCase();
      return name.includes(q) || code.includes(q) || String(s.id).includes(q);
    });
  }, [storesSorted, catalogShopFilter]);

  const otherStoreIds = useMemo(
    () => stores.map((s) => Number(s.id)).filter((n) => Number.isFinite(n) && n !== primaryShopNum),
    [stores, primaryShopNum]
  );

  function clearOtherCatalogShops() {
    setForm((f) => ({ ...f, catalog_extra_shop_ids: [] }));
  }

  function selectAllOtherCatalogShops() {
    if (primaryShopNum == null) return;
    setForm((f) => ({ ...f, catalog_extra_shop_ids: [...otherStoreIds] }));
  }

  const save = async (e) => {
    e.preventDefault();
    setErr(null);
    try {
      const catalogPayload = {
        catalog_multi_shop_filter: !!(primaryShopNum && form.catalog_extra_shop_ids.length > 0),
        catalog_extra_shop_ids: primaryShopNum ? form.catalog_extra_shop_ids : [],
      };

      if (isCreate) {
        await apiJson("/api/admin/staff", {
          method: "POST",
          body: JSON.stringify({
            name: form.name,
            email: form.email,
            phone: form.phone,
            password: form.password,
            shop_id: form.shop_id ? Number(form.shop_id) : null,
            role_id: Number(form.role_id),
            ...catalogPayload,
          }),
        });
      } else {
        const body = {
          name: form.name,
          phone: form.phone,
          shop_id: form.shop_id ? Number(form.shop_id) : null,
          role_id: Number(form.role_id),
          is_active: form.is_active,
          catalog_multi_shop_filter: catalogPayload.catalog_multi_shop_filter,
          catalog_extra_shop_ids: catalogPayload.catalog_extra_shop_ids,
        };
        if (form.password.trim()) body.password = form.password;
        await apiJson(`/api/admin/staff/${id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }
      navigate("/admin/staff");
    } catch (e) {
      const b = e.body;
      if (b?.error === "email_taken") setErr("That email is already registered.");
      else if (b?.error === "password_short") setErr("Password must be at least 6 characters.");
      else if (b?.error === "invalid_role") setErr("Choose a valid role.");
      else if (b?.error === "invalid_store") setErr("Choose a valid store or leave shop blank.");
      else if (b?.error === "invalid_catalog_shop") setErr("One of the catalog shops is invalid.");
      else if (b?.error === "validation_failed" && b?.field === "catalog_multi_shop_filter") {
        setErr("Assign a shop before selecting catalog stores.");
      } else setErr(e.message);
    }
  };

  const catalogDisabled = !form.shop_id;

  return (
    <div className="max-w-2xl">
      <div className="mb-4">
        <Link to="/admin/staff" className="text-sm text-[var(--brand-accent)] underline">
          ← Staff
        </Link>
      </div>
      <h1 className="text-2xl font-black mb-4">{isCreate ? "Add staff" : "Edit staff"}</h1>
      {err ? <p className="text-red-600 mb-4">{err}</p> : null}

      <form onSubmit={save} className="space-y-5 bg-white border border-gray-200 rounded-xl p-6">
        <label className="block">
          <span className="text-sm font-semibold">Name</span>
          <input
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Email</span>
          <input
            type="email"
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            required
            disabled={!isCreate}
            title={isCreate ? "" : "Email cannot be changed here"}
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Phone</span>
          <input
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">{isCreate ? "Password" : "New password (optional)"}</span>
          <input
            type="password"
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            required={isCreate}
            minLength={isCreate ? 6 : undefined}
            autoComplete="new-password"
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold">Assigned shop</span>
          <select
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            value={form.shop_id}
            onChange={(e) => setAssignedShop(e.target.value)}
          >
            <option value="">— Not assigned —</option>
            {stores.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">Primary store for this account (POS / defaults).</p>
        </label>

        <div
          className={`rounded-xl border border-gray-200 bg-gray-50/80 overflow-hidden ${
            catalogDisabled ? "opacity-60 pointer-events-none" : ""
          }`}
        >
          <div className="px-4 py-3 border-b border-gray-200 bg-white flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Catalog — shops</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Admin → Products filter only shows shops you tick. Assigned shop is always included.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                disabled={catalogDisabled}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40"
                onClick={clearOtherCatalogShops}
              >
                Clear others
              </button>
              <button
                type="button"
                disabled={catalogDisabled || primaryShopNum == null}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40"
                onClick={selectAllOtherCatalogShops}
              >
                Select all others
              </button>
            </div>
          </div>

          <div className="px-4 py-2 border-b border-gray-100 bg-white">
            <input
              type="search"
              disabled={catalogDisabled}
              placeholder="Search shops…"
              value={catalogShopFilter}
              onChange={(e) => setCatalogShopFilter(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
            />
          </div>

          {catalogDisabled ? (
            <p className="text-xs text-gray-500 px-4 py-6 text-center">Assign a shop to configure catalog access.</p>
          ) : stores.length === 0 ? (
            <p className="text-xs text-gray-500 px-4 py-6 text-center">No active stores.</p>
          ) : (
            <ul className="max-h-64 overflow-y-auto divide-y divide-gray-100 bg-white">
              {storesFiltered.length === 0 ? (
                <li className="px-4 py-8 text-xs text-gray-500 text-center">No shops match your search.</li>
              ) : null}
              {storesFiltered.map((s) => {
                const sid = Number(s.id);
                const isPrimary = primaryShopNum != null && sid === primaryShopNum;
                const checked = isPrimary || form.catalog_extra_shop_ids.includes(sid);
                return (
                  <li key={s.id}>
                    <label
                      className={`flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer hover:bg-gray-50 ${
                        isPrimary ? "bg-sky-50/60" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="rounded border-gray-400 shrink-0"
                        checked={checked}
                        disabled={isPrimary}
                        onChange={(e) => toggleCatalogShop(s.id, e.target.checked)}
                      />
                      <span className="flex-1 min-w-0">
                        <span className="font-medium text-gray-900">{s.name}</span>
                        <span className="text-gray-500"> ({s.code})</span>
                        {isPrimary ? (
                          <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-sky-800 bg-sky-100 px-1.5 py-0.5 rounded">
                            Assigned
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="text-[11px] text-gray-500 px-4 py-2.5 border-t border-gray-100 bg-gray-50/90 leading-snug">
            Shared catalog rows (no shop on the product) stay visible for any ticked shop. Role permission{" "}
            <span className="font-medium text-gray-700">Products — all shops (catalog)</span> overrides this list.
          </p>
        </div>

        <label className="block">
          <span className="text-sm font-semibold">Role</span>
          <select
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            value={form.role_id}
            onChange={(e) => setForm((f) => ({ ...f, role_id: e.target.value }))}
            required
          >
            <option value="" disabled>
              Select role
            </option>
            {roles.map((r) => (
              <option key={r.id} value={String(r.id)}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        {!isCreate ? (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            />
            <span className="text-sm font-semibold">Active</span>
          </label>
        ) : null}

        <div className="flex gap-3 pt-2">
          <button type="submit" className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold">
            Save
          </button>
          <Link to="/admin/staff" className="px-4 py-2 rounded-lg border border-gray-300 text-sm">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
