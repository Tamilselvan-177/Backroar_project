export default function PolicyPage({ title, children }) {
  const body =
    children ??
    (
      <p className="text-gray-600">
        Placeholder — replace with your final legal copy before production.
      </p>
    );
  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <h1 className="text-3xl md:text-4xl font-black mb-8 uppercase tracking-wide">{title}</h1>
      <div className="max-w-none text-gray-700 leading-relaxed space-y-4">{body}</div>
    </div>
  );
}
