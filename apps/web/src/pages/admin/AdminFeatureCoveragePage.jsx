import { Link } from "react-router-dom";
import { FEATURE_COVERAGE } from "./featureCoverageData.js";

const badge = (status) => {
  const cls =
    status === "done"
      ? "bg-green-100 text-green-900"
      : status === "partial"
        ? "bg-amber-100 text-amber-950"
        : "bg-red-100 text-red-900";
  return <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${cls}`}>{status}</span>;
};

export default function AdminFeatureCoveragePage() {
  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-black">Feature coverage</h1>
        <p className="text-gray-600 text-sm mt-2 max-w-3xl">
          Internal checklist for storefront, API, and admin modules. Status is a guide for QA and backlog — not a formal
          compliance matrix. Rows are edited in{" "}
          <code className="bg-gray-100 px-1 rounded text-xs">featureCoverageData.js</code>.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="p-3 font-bold">Area</th>
              <th className="p-3 font-bold">Reference</th>
              <th className="p-3 font-bold w-24">Status</th>
              <th className="p-3 font-bold">Notes</th>
            </tr>
          </thead>
          <tbody>
            {FEATURE_COVERAGE.map((row) => (
              <tr key={row.area} className="border-t border-gray-100 align-top">
                <td className="p-3 font-medium text-gray-900">{row.area}</td>
                <td className="p-3 text-gray-600 font-mono text-xs">{row.reference}</td>
                <td className="p-3">{badge(row.status)}</td>
                <td className="p-3 text-gray-600">{row.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-gray-500">
        <Link to="/admin" className="text-[var(--brand-accent)] underline">
          ← Dashboard
        </Link>
      </p>
    </div>
  );
}
