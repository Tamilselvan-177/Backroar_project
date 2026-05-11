import { useCallback, useEffect, useMemo, useState } from "react";
import { apiJson } from "../../api/client.js";

function fmtDateTime(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return String(value);
  }
}

function fmtDateOnly(value) {
  if (!value) return "—";
  try {
    return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
      dateStyle: "medium",
    });
  } catch {
    return String(value);
  }
}

function startOfMonth() {
  return `${new Date().toISOString().slice(0, 7)}-01`;
}

function statusPill(status) {
  const text = String(status ?? "unknown").replaceAll("_", " ");
  const key = String(status ?? "").toLowerCase();
  if (key === "present") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (key === "absent") return "bg-rose-50 text-rose-700 border-rose-200";
  if (key === "on_leave") return "bg-amber-50 text-amber-700 border-amber-200";
  if (key === "not_checked_in") return "bg-slate-100 text-slate-600 border-slate-200";
  return "bg-sky-50 text-sky-700 border-sky-200";
}

const cardCls = "rounded-2xl border border-slate-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.08)]";
const inputCls =
  "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10";
const labelCls = "text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500";

export default function AdminAttendancePage() {
  const [tab, setTab] = useState("my");
  const [today, setToday] = useState(null);
  const [board, setBoard] = useState(null);
  const [history, setHistory] = useState([]);
  const [stores, setStores] = useState([]);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [historyFrom, setHistoryFrom] = useState(() => startOfMonth());
  const [historyTo, setHistoryTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [storeId, setStoreId] = useState("");
  const [shiftStoreId, setShiftStoreId] = useState("");
  const [err, setErr] = useState(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const loadMy = useCallback(() => {
    apiJson("/api/admin/attendance/today").then(setToday).catch((e) => setErr(e.message));
  }, []);

  const loadBoard = useCallback(() => {
    const qs = new URLSearchParams({ date });
    if (storeId) qs.set("store_id", storeId);
    apiJson(`/api/admin/attendance/board?${qs}`)
      .then((data) => {
        setBoard(data);
        setStores(data.stores ?? []);
      })
      .catch((e) => setErr(e.message));
  }, [date, storeId]);

  const loadHistory = useCallback(() => {
    const qs = new URLSearchParams({ from: historyFrom, to: historyTo });
    apiJson(`/api/admin/attendance/month?${qs}`)
      .then((data) => setHistory(data.records ?? []))
      .catch((e) => setErr(e.message));
  }, [historyFrom, historyTo]);

  const loadStores = useCallback(() => {
    const qs = new URLSearchParams({ date });
    apiJson(`/api/admin/attendance/board?${qs}`)
      .then((data) => setStores(data.stores ?? []))
      .catch((e) => setErr(e.message));
  }, [date]);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  useEffect(() => {
    setErr(null);
    if (tab === "my") loadMy();
    else if (tab === "history") loadHistory();
    else loadBoard();
  }, [tab, loadMy, loadHistory, loadBoard]);

  const historyStats = useMemo(() => {
    const present = history.filter((r) => r.status === "present").length;
    const absent = history.filter((r) => r.status === "absent").length;
    const open = history.filter((r) => r.check_in && !r.check_out).length;
    return { present, absent, open };
  }, [history]);

  const checkIn = async () => {
    setErr(null);
    setBusy(true);
    try {
      await apiJson("/api/admin/attendance/checkin", {
        method: "POST",
        body: JSON.stringify({ shop_id: shiftStoreId ? Number(shiftStoreId) : undefined, notes }),
      });
      setNotes("");
      loadMy();
      loadBoard();
    } catch (e) {
      setErr(e.body?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const checkOut = async () => {
    setErr(null);
    setBusy(true);
    try {
      await apiJson("/api/admin/attendance/checkout", { method: "POST", body: JSON.stringify({ notes }) });
      setNotes("");
      loadMy();
      loadBoard();
    } catch (e) {
      setErr(e.body?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const markRow = async (userId, status) => {
    setErr(null);
    setBusy(true);
    try {
      await apiJson("/api/admin/attendance/mark", {
        method: "POST",
        body: JSON.stringify({ user_id: userId, date, status }),
      });
      loadBoard();
    } catch (e) {
      setErr(e.body?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div className="rounded-[1.6rem] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_55%,#ecfeff_100%)] p-6 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Operations / Workforce</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Attendance</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Track personal shifts, review monthly history, and manage the team attendance board for the selected day and store.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-4">
        {[
          ["my", "My shift"],
          ["history", "My history"],
          ["team", "Team board"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              tab === value ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {err ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p> : null}

      {tab === "my" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className={`${cardCls} p-5 md:p-6`}>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <p className={labelCls}>Current Status</p>
                <p
                  className={`mt-2 inline-flex rounded-full border px-3 py-1 text-sm font-semibold capitalize ${statusPill(
                    today?.record?.status || (today?.record?.check_in ? "present" : "not_checked_in")
                  )}`}
                >
                  {(today?.record?.status || (today?.record?.check_in ? "present" : "not_checked_in")).replaceAll("_", " ")}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <p className={labelCls}>Checked In</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{fmtDateTime(today?.record?.check_in)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <p className={labelCls}>Checked Out</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{fmtDateTime(today?.record?.check_out)}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="block text-sm">
                <span className={labelCls}>Store for Shift</span>
                <select className={inputCls} value={shiftStoreId} onChange={(e) => setShiftStoreId(e.target.value)}>
                  <option value="">Use default / no store tag</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <p className={labelCls}>Today</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {today?.record?.check_in
                    ? today?.record?.check_out
                      ? "Shift is complete for today."
                      : "You are checked in and still need to check out."
                    : "No check-in recorded yet for today."}
                </p>
              </div>
            </div>

            <label className="mt-5 block text-sm">
              <span className={labelCls}>Shift Notes</span>
              <textarea
                className={`${inputCls} min-h-[120px]`}
                placeholder="Optional notes such as late arrival, outside visit, or shift handover"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={!today?.can_check_in || busy}
                onClick={checkIn}
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                Check in
              </button>
              <button
                type="button"
                disabled={!today?.can_check_out || busy}
                onClick={checkOut}
                className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-40"
              >
                Check out
              </button>
            </div>
          </div>

          <aside className={`${cardCls} p-5`}>
            <p className={labelCls}>Shift Rules</p>
            <h3 className="mt-1 text-lg font-bold text-slate-950">Keep daily records clean</h3>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <li>Use the correct store when you begin the shift if you are covering a branch.</li>
              <li>Enter notes for exceptions such as field visits, handovers, or late starts.</li>
              <li>Finish the day with a checkout so reports do not show open shifts.</li>
            </ul>
          </aside>
        </div>
      ) : null}

      {tab === "history" ? (
        <div className="space-y-4">
          <div className={`${cardCls} p-4 md:p-5`}>
            <div className="grid gap-4 md:grid-cols-[220px_220px_auto] md:items-end">
              <label className="block text-sm">
                <span className={labelCls}>From</span>
                <input type="date" className={inputCls} value={historyFrom} onChange={(e) => setHistoryFrom(e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className={labelCls}>To</span>
                <input type="date" className={inputCls} value={historyTo} onChange={(e) => setHistoryTo(e.target.value)} />
              </label>
              <div className="flex gap-3">
                <button type="button" className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white" onClick={loadHistory}>
                  Refresh history
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className={`${cardCls} p-5`}>
              <p className={labelCls}>Present Days</p>
              <p className="mt-2 text-2xl font-black text-emerald-700">{historyStats.present}</p>
            </div>
            <div className={`${cardCls} p-5`}>
              <p className={labelCls}>Absent Days</p>
              <p className="mt-2 text-2xl font-black text-rose-700">{historyStats.absent}</p>
            </div>
            <div className={`${cardCls} p-5`}>
              <p className={labelCls}>Open Shifts</p>
              <p className="mt-2 text-2xl font-black text-amber-700">{historyStats.open}</p>
            </div>
          </div>

          <div className={`${cardCls} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Check in</th>
                    <th className="px-4 py-3 font-semibold">Check out</th>
                    <th className="px-4 py-3 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={row.id || `${row.user_id}-${row.date}`} className="border-t border-slate-100 align-top">
                      <td className="px-4 py-3 text-slate-700">{fmtDateOnly(row.date)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold capitalize ${statusPill(row.status)}`}>
                          {String(row.status ?? "unknown").replaceAll("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{fmtDateTime(row.check_in)}</td>
                      <td className="px-4 py-3 text-slate-700">{fmtDateTime(row.check_out)}</td>
                      <td className="px-4 py-3 text-slate-500">{row.notes || row.notes_out || "—"}</td>
                    </tr>
                  ))}
                  {!history.length ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                        No attendance history found for the selected range.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "team" ? (
        <div className="space-y-4">
          <div className={`${cardCls} p-4 md:p-5`}>
            <div className="grid gap-4 md:grid-cols-[220px_240px_auto] md:items-end">
              <label className="block text-sm">
                <span className={labelCls}>Date</span>
                <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className={labelCls}>Store</span>
                <select className={inputCls} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                  <option value="">All stores</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-3">
                <button type="button" className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white" onClick={loadBoard}>
                  Refresh board
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className={`${cardCls} p-5`}>
              <p className={labelCls}>Staff on Board</p>
              <p className="mt-2 text-2xl font-black text-slate-950">{board?.today_attendance?.length ?? 0}</p>
            </div>
            <div className={`${cardCls} p-5`}>
              <p className={labelCls}>Present</p>
              <p className="mt-2 text-2xl font-black text-emerald-700">
                {(board?.today_attendance ?? []).filter((row) => row.status === "present").length}
              </p>
            </div>
            <div className={`${cardCls} p-5`}>
              <p className={labelCls}>Not Checked In / Absent</p>
              <p className="mt-2 text-2xl font-black text-rose-700">
                {(board?.today_attendance ?? []).filter((row) => row.status === "absent" || row.status === "not_checked_in").length}
              </p>
            </div>
          </div>

          <div className={`${cardCls} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Staff</th>
                    <th className="px-4 py-3 font-semibold">Store</th>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">In</th>
                    <th className="px-4 py-3 font-semibold">Out</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(board?.today_attendance ?? []).map((row) => (
                    <tr key={row.user_id} className="border-t border-slate-100 align-top">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{row.user_name}</div>
                        <div className="text-xs text-slate-500">{row.user_email}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{row.shop_name || "Shared / unassigned"}</td>
                      <td className="px-4 py-3 text-slate-700">{row.role || "staff"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold capitalize ${statusPill(row.status)}`}>
                          {String(row.status ?? "unknown").replaceAll("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{fmtDateTime(row.check_in)}</td>
                      <td className="px-4 py-3 text-slate-700">{fmtDateTime(row.check_out)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rounded-lg bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                            disabled={busy}
                            onClick={() => markRow(row.user_id, "present")}
                          >
                            Present
                          </button>
                          <button
                            type="button"
                            className="rounded-lg bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700"
                            disabled={busy}
                            onClick={() => markRow(row.user_id, "absent")}
                          >
                            Absent
                          </button>
                          <button
                            type="button"
                            className="rounded-lg bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700"
                            disabled={busy}
                            onClick={() => markRow(row.user_id, "on_leave")}
                          >
                            Leave
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!board?.today_attendance?.length ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                        No staff rows available for the selected date and store.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
