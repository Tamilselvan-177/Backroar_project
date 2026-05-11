import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson } from "../api/client.js";
import { legacyPublic } from "../lib/images.js";

function categoryImageUrl(path) {
  if (!path) return "";
  const s = String(path);
  if (s.startsWith("http")) return s;
  return legacyPublic(s.startsWith("/") ? s : `/${s}`);
}

export default function Categories() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    apiJson("/api/categories")
      .then(setData)
      .catch((e) => setErr(e.message));
  }, []);

  if (err) return <p className="text-center text-red-600 py-12">{err}</p>;
  if (!data) return <p className="text-center py-12 text-gray-600">Loading…</p>;

  const list = data.categories ?? [];

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-3xl md:text-5xl font-black text-center mb-12 uppercase tracking-wide">Categories</h1>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
        {list.map((c) => (
          <Link
            key={c.id}
            to={`/category/${encodeURIComponent(c.slug)}`}
            className="category-card block overflow-hidden rounded-2xl shadow-xl flex flex-col border-2 border-gray-200 hover:-translate-y-2 transition-transform bg-white"
          >
            <div className="aspect-square bg-gradient-to-b from-blue-50 to-white flex items-center justify-center overflow-hidden">
              {categoryImageUrl(c.image_path) ? (
                <img
                  src={categoryImageUrl(c.image_path)}
                  alt={c.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <span className="text-gray-400 text-lg font-bold px-4 text-center">{c.name}</span>
              )}
            </div>
            <div className="bg-[#1a1a1a] text-white text-center font-black uppercase py-4 text-lg tracking-wider">
              {c.name}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
