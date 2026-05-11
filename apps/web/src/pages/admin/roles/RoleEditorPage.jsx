import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { apiJson } from "../../../api/client.js";

function permNumericId(p) {
  const n = Number(p?.id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Stable module bucket for grouped checkboxes (uses DB `module` when set, else `key_name`). */
function permissionModuleKey(p) {
  const raw = String(p?.module ?? "").trim().toLowerCase();
  if (raw) return raw.replace(/\s+/g, "_");
  const k = String(p?.key_name ?? "");
  if (k === "access_pos") return "pos";
  if (k.startsWith("admin.finance")) return "finance";
  if (k.startsWith("admin.catalog")) return "catalog";
  if (k.startsWith("admin.orders")) return "orders";
  if (k.startsWith("admin.stock")) return "stock";
  if (k.startsWith("admin.counters")) return "counters";
  if (k.startsWith("admin.reviews")) return "reviews";
  if (k.startsWith("admin.returns")) return "returns";
  if (k.startsWith("admin.attendance")) return "attendance";
  return "other";
}

function moduleTitle(key) {
  const titles = {
    pos: "POS",
    catalog: "Catalog & products",
    orders: "Orders",
    stock: "Stock & transfers",
    counters: "Counters",
    reviews: "Reviews",
    returns: "Returns",
    attendance: "Attendance",
    finance: "Finance & reporting",
    other: "Other",
  };
  return titles[key] || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const MODULE_ORDER = [
  "pos",
  "catalog",
  "orders",
  "stock",
  "counters",
  "reviews",
  "returns",
  "attendance",
  "finance",
  "other",
];

export default function RoleEditorPage() {
  const { id: roleId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isCreate = /\/roles\/create\/?$/.test(location.pathname);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [systemRole, setSystemRole] = useState(false);
  const [usersCount, setUsersCount] = useState(null);
  const [createdAt, setCreatedAt] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [permReloadKey, setPermReloadKey] = useState(0);

  const moduleCheckboxRefs = useRef({});

  const invalidIdCount = useMemo(
    () => permissions.reduce((n, p) => n + (permNumericId(p) == null ? 1 : 0), 0),
    [permissions]
  );

  const permissionsUsable = useMemo(() => permissions.filter((p) => permNumericId(p) != null), [permissions]);

  const groupedMap = useMemo(() => {
    const m = new Map();
    for (const p of permissionsUsable) {
      const mk = permissionModuleKey(p);
      if (!m.has(mk)) m.set(mk, []);
      m.get(mk).push(p);
    }
    for (const [, list] of m) {
      list.sort((a, b) => String(a.key_name).localeCompare(String(b.key_name)));
    }
    return m;
  }, [permissionsUsable]);

  const moduleKeys = useMemo(() => {
    const keys = [...groupedMap.keys()];
    keys.sort((a, b) => {
      const ia = MODULE_ORDER.indexOf(a);
      const ib = MODULE_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    return keys;
  }, [groupedMap]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);

    if (isCreate) {
      apiJson("/api/admin/permissions")
        .then((d) => {
          if (cancelled) return;
          setPermissions(d.permissions ?? []);
          setSelected(new Set());
          setSystemRole(false);
          setUsersCount(null);
          setCreatedAt(null);
          setUpdatedAt(null);
        })
        .catch((e) => {
          if (!cancelled) setErr(e.body?.error || e.message);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }

    const rid = Number(roleId);
    if (!Number.isFinite(rid) || rid <= 0) {
      setErr("Invalid role id.");
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    apiJson(`/api/admin/roles/${rid}`)
      .then((d) => {
        if (cancelled) return;
        const r = d.role;
        setName(r.name ?? "");
        setDescription(r.description ?? "");
        setSystemRole(!!(r.is_system_role === 1 || r.is_system_role === true));
        setUsersCount(r.users_count ?? null);
        setCreatedAt(r.created_at ?? null);
        setUpdatedAt(r.updated_at ?? null);
        setPermissions(d.permissions ?? []);
        setSelected(new Set((d.permission_ids ?? []).map(Number).filter((n) => Number.isFinite(n) && n > 0)));
      })
      .catch((e) => {
        if (!cancelled) setErr(e.body?.error || e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isCreate, roleId, permReloadKey]);

  useLayoutEffect(() => {
    for (const mod of moduleKeys) {
      const el = moduleCheckboxRefs.current[mod];
      if (!el) continue;
      const items = groupedMap.get(mod) ?? [];
      const pids = items.map(permNumericId).filter((x) => x != null);
      const n = pids.filter((pid) => selected.has(pid)).length;
      el.checked = pids.length > 0 && n === pids.length;
      el.indeterminate = n > 0 && n < pids.length;
    }
  }, [selected, moduleKeys, groupedMap]);

  function togglePerm(pid) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  }

  function setModuleAll(mod, checked) {
    const items = groupedMap.get(mod) ?? [];
    const pids = items.map(permNumericId).filter((x) => x != null);
    setSelected((prev) => {
      const next = new Set(prev);
      for (const pid of pids) {
        if (checked) next.add(pid);
        else next.delete(pid);
      }
      return next;
    });
  }

  function selectAllPermissions() {
    const next = new Set();
    for (const p of permissionsUsable) {
      next.add(permNumericId(p));
    }
    setSelected(next);
  }

  function clearAllPermissions() {
    setSelected(new Set());
  }

  const save = async (e) => {
    e.preventDefault();
    setErr(null);
    const permission_ids = [...selected];
    try {
      if (isCreate) {
        await apiJson("/api/admin/roles", {
          method: "POST",
          body: JSON.stringify({ name, description, permission_ids }),
        });
      } else {
        const rid = Number(roleId);
        await apiJson(`/api/admin/roles/${rid}`, {
          method: "PATCH",
          body: JSON.stringify({ name, description, permission_ids }),
        });
      }
      navigate("/admin/roles");
    } catch (e) {
      const b = e.body;
      if (b?.error === "invalid_permission") {
        setErr("One or more permission ids are invalid. Reload and try again.");
      } else if (b?.error === "csrf_failed") {
        setErr("Session expired — refresh the page and sign in again.");
      } else {
        setErr(b?.message || b?.error || e.message);
      }
    }
  };

  const fmtDate = (v) => {
    if (v == null) return "—";
    try {
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch {
      return "—";
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <p className="text-gray-600 text-sm">Loading role editor…</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{isCreate ? "Create role" : "Edit role"}</h1>
          {!isCreate && systemRole ? (
            <span className="mt-2 inline-flex px-3 py-1 text-xs font-semibold text-amber-800 bg-amber-100 rounded-full border border-amber-200">
              System role
            </span>
          ) : null}
        </div>
        <Link
          to="/admin/roles"
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 shadow-sm text-sm font-medium"
        >
          ← Back to roles
        </Link>
      </div>

      {err ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">{err}</div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Role information</h2>
            </div>
            <form onSubmit={save} className="p-6 space-y-6">
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-2">
                  Role name <span className="text-red-500">*</span>
                </span>
                <input
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-gray-900 text-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder='e.g. Sales Manager, Store Clerk'
                  required
                />
              </label>

              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-2">Description</span>
                <textarea
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-gray-900 text-sm resize-none min-h-[88px]"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional — what this role is for"
                />
              </label>

              <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">Permissions</h3>
                    <p className="text-xs text-gray-600 mt-1 max-w-xl leading-relaxed">
                      Check each capability this role should have. Staff users only get what you tick here for roles assigned to them.
                      Creating a new role starts with nothing checked until you choose. Store billing/checkout for shoppers is not affected.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-100"
                      onClick={selectAllPermissions}
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-100"
                      onClick={clearAllPermissions}
                    >
                      Clear all
                    </button>
                  </div>
                </div>

                {invalidIdCount > 0 ? (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                    {invalidIdCount} permission row(s) are missing a numeric id and were skipped. Restart the API or run the index sync
                    script so the catalog loads correctly.
                  </p>
                ) : null}

                {permissionsUsable.length === 0 ? (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-700 space-y-3">
                    <p>No permission checklist loaded yet. The server syncs the catalog when it starts.</p>
                    <ul className="list-disc list-inside text-xs text-gray-600 space-y-1">
                      <li>Restart the API process, then click Reload below.</li>
                      <li>
                        Or run:{" "}
                        <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px]">node apps/api/src/scripts/ensureMongoIndexes.js</code>
                      </li>
                    </ul>
                    <button
                      type="button"
                      className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white hover:bg-black"
                      onClick={() => setPermReloadKey((k) => k + 1)}
                    >
                      Reload permissions
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {moduleKeys.map((mod) => {
                      const items = groupedMap.get(mod) ?? [];
                      if (items.length === 0) return null;
                      return (
                        <div key={mod} className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
                          <div className="flex items-center gap-3 mb-4">
                            <input
                              ref={(el) => {
                                moduleCheckboxRefs.current[mod] = el;
                              }}
                              type="checkbox"
                              id={`module-${mod}`}
                              className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900 shrink-0"
                              onChange={(e) => setModuleAll(mod, e.target.checked)}
                            />
                            <label htmlFor={`module-${mod}`} className="text-sm font-semibold text-gray-900 uppercase tracking-wide cursor-pointer select-none">
                              {moduleTitle(mod)}
                            </label>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 pl-7">
                            {items.map((p) => {
                              const pid = permNumericId(p);
                              const label = p.name || p.label || p.key_name;
                              return (
                                <div key={pid} className="flex flex-col gap-0.5">
                                  <div className="flex items-start gap-2">
                                    <input
                                      id={`perm-${pid}`}
                                      type="checkbox"
                                      checked={selected.has(pid)}
                                      onChange={() => togglePerm(pid)}
                                      className="mt-0.5 w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900 shrink-0"
                                    />
                                    <label htmlFor={`perm-${pid}`} className="text-sm text-gray-800 cursor-pointer leading-snug">
                                      {label}
                                    </label>
                                  </div>
                                  <span className="ml-6 text-[11px] text-gray-400 font-mono break-all">{p.key_name}</span>
                                  {p.description ? <p className="ml-6 text-xs text-gray-500 leading-snug">{p.description}</p> : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-black shadow-sm text-sm font-semibold"
                >
                  {isCreate ? "Create role" : "Update role"}
                </button>
                <Link to="/admin/roles" className="inline-flex items-center px-6 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium">
                  Cancel
                </Link>
              </div>
            </form>
          </div>
        </div>

        <div className="space-y-6">
          {!isCreate ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-base font-semibold text-gray-900">Role statistics</h3>
              </div>
              <div className="p-6">
                <dl className="space-y-4">
                  <div className="flex justify-between gap-2">
                    <dt className="text-sm text-gray-600">Users assigned</dt>
                    <dd className="text-sm font-semibold text-gray-900">{usersCount ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-sm text-gray-600">Permissions checked</dt>
                    <dd className="text-sm font-semibold text-gray-900">{selected.size}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-sm text-gray-600">Created</dt>
                    <dd className="text-sm font-semibold text-gray-900">{fmtDate(createdAt)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-sm text-gray-600">Updated</dt>
                    <dd className="text-sm font-semibold text-gray-900">{fmtDate(updatedAt)}</dd>
                  </div>
                </dl>
              </div>
            </div>
          ) : null}

          <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl border border-slate-200 shadow-sm">
            <div className="px-6 py-4 border-b border-slate-200">
              <h3 className="text-base font-semibold text-gray-900">Quick tips</h3>
            </div>
            <ul className="p-6 space-y-4 text-sm text-gray-700">
              <li>
                <strong className="text-gray-900">Section header checkbox</strong> — selects or clears every item in that section at once.
              </li>
              <li>
                <strong className="text-gray-900">New role</strong> — leave boxes unchecked for capabilities you do not want; only checked items apply after you save.
              </li>
              <li>
                <strong className="text-gray-900">Finance-related items</strong> — leave off unless this role should see POS sales, GST, or returns reports.
              </li>
              <li>
                <strong className="text-gray-900">Administrator-type accounts</strong> — still reach all admin areas; this grid mainly limits staff who are not full admins.
              </li>
              <li>
                <strong className="text-gray-900">System roles</strong> — cannot be deleted; you can still edit their permissions.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
