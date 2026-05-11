import { useCallback, useEffect, useState } from "react";
import { apiJson } from "../../api/client.js";

function fmt(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

export default function AdminAttendancePage() {
  const [tab, setTab] = useState("my");
  const [today, setToday] = useState(null);
  const [board, setBoard] = useState(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [storeId, setStoreId] = useState("");
  const [err, setErr] = useState(null);
  const [notes, setNotes] = useState("");

  const loadMy = useCallback(() => {
    apiJson("/api/admin/attendance/today").then(setToday).catch((e) => setErr(e.message));
  }, []);

  const loadBoard = useCallback(() => {
    const qs = new URLSearchParams({ date });
    if (storeId) qs.set("store_id", storeId);
    apiJson(`/api/admin/attendance/board?${qs}`)
      .then(setBoard)
      .catch((e) => setErr(e.message));
  }, [date, storeId]);

  useEffect(() => {
    setErr(null);
    if (tab === "my") loadMy();
    else loadBoard();
  }, [tab, loadMy, loadBoard]);

  const checkIn = async () => {
    setErr(null);
    try {
      await apiJson("/api/admin/attendance/checkin", {
        method: "POST",
        body: JSON.stringify({ shop_id: storeId ? Number(storeId) : undefined, notes }),
      });
      setNotes("");
      loadMy();
    } catch (e) {
      setErr(e.body?.error || e.message);
    }
  };

  const checkOut = async () => {
    setErr(null);
    try {
      await apiJson("/api/admin/attendance/checkout", { method: "POST", body: JSON.stringify({ notes }) });
      setNotes("");
      loadMy();
    } catch (e) {
      setErr(e.body?.error || e.message);
    }
  };

  const markRow = async (userId, status) => {
    setErr(null);
    try {
      await apiJson("/api/admin/attendance/mark", {
        method: "POST",
        body: JSON.stringify({ user_id: userId, date, status }),
      });
      loadBoard();
    } catch (e) {
      setErr(e.body?.error || e.message);
    }
  };

  return (
    <div className="max-w-5xl space-y-4">
      <h1 className="text-2xl font-black">Attendance</h1>
      <p className="text-gray-600 text-sm">Check in/out for yourself; team board for staff status.</p>

      <div className="flex gap-2 border-b border-gray-200 pb-2">
        <button
          type="button"
          onClick={() => setTab("my")}
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${tab === "my" ? "bg-gray-900 text-white" : "bg-gray-100"}`}
        >
          My attendance
        </button>
        <button
          type="button"
          onClick={() => setTab("team")}
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${tab === "team" ? "bg-gray-900 text-white" : "bg-gray-100"}`}
        >
          Team board
        </button>
      </div>

      {err ? <p className="text-red-600 text-sm">{err}</p> : null}

      {tab === "my" ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3 max-w-md">
          <p className="text-sm">
            Today: {today?.record?.check_in ? <span className="font-semibold text-green-700">Checked in {fmt(today.record.check_in)}</span> : "Not checked in"}
          </p>
          {today?.record?.check_out ? (
            <p className="text-sm">Checked out {fmt(today.record.check_out)}</p>
          ) : today?.record?.check_in ? (
            <p className="text-sm text-amber-700">Awaiting checkout</p>
          ) : null}
          <textarea
            className="w-full border rounded-lg p-2 text-sm"
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!today?.can_check_in}
              onClick={checkIn}
              className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm disabled:opacity-40"
            >
              Check in
            </button>
            <button
              type="button"
              disabled={!today?.can_check_out}
              onClick={checkOut}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm disabled:opacity-40"
            >
              Check out
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <label className="text-sm">
              Date
              <input type="date" className="ml-1 border rounded px-2 py-1" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="text-sm">
              Store filter
              <input
                type="number"
                placeholder="All"
                className="ml-1 border rounded px-2 py-1 w-24"
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
              />
            </label>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="p-2">Staff</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">In</th>
                  <th className="p-2">Out</th>
                  <th className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(board?.today_attendance ?? []).map((row) => (
                  <tr key={row.user_id} className="border-t border-gray-100">
                    <td className="p-2">
                      {row.user_name}
                      <div className="text-xs text-gray-500">{row.user_email}</div>
                    </td>
                    <td className="p-2">{row.status}</td>
                    <td className="p-2">{fmt(row.check_in)}</td>
                    <td className="p-2">{fmt(row.check_out)}</td>
                    <td className="p-2 space-x-1">
                      <button type="button" className="text-xs underline" onClick={() => markRow(row.user_id, "present")}>
                        Present
                      </button>
                      <button type="button" className="text-xs underline" onClick={() => markRow(row.user_id, "absent")}>
                        Absent
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
