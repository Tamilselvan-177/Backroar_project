import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson } from "../api/client.js";

export default function Account() {
  const [me, setMe] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    apiJson("/api/auth/me")
      .then(setMe)
      .catch(() => setErr("Not signed in"));
  }, []);

  if (err || (me && !me.user)) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="mb-4">{err || "Please log in."}</p>
        <Link to="/login" className="text-blue-600 font-bold underline">
          Login
        </Link>
      </div>
    );
  }

  if (!me) return <p className="text-center py-16">Loading…</p>;

  return (
    <div className="container mx-auto px-4 py-12 max-w-lg">
      <h1 className="text-3xl font-black mb-4">Account</h1>
      <p className="text-gray-700 mb-2">
        <span className="font-semibold">Name:</span> {me.user.name}
      </p>
      <p className="text-gray-700 mb-8">
        <span className="font-semibold">Email:</span> {me.user.email}
      </p>
      <ul className="space-y-2 text-[var(--brand-accent)] font-semibold">
        <li>
          <Link to="/account/profile" className="underline">
            Edit profile
          </Link>
        </li>
        <li>
          <Link to="/orders" className="underline">
            My orders
          </Link>
        </li>
        <li>
          <Link to="/wishlist" className="underline">
            Wishlist
          </Link>
        </li>
      </ul>
    </div>
  );
}
