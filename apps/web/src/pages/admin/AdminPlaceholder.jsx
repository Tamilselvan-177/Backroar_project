export default function AdminPlaceholder({ title, note }) {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-black mb-2">{title}</h1>
      <p className="text-gray-600 mb-4">
        {note ?? "This admin screen is not implemented yet. Use Feature coverage for backlog tracking."}
      </p>
    </div>
  );
}
