import { Link } from "react-router-dom";

export default function AccountProfile() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-lg">
      <h1 className="text-2xl font-black mb-4">Profile</h1>
      <p className="text-gray-600 mb-6">Profile editing (name, phone, password) will be added here.</p>
      <Link to="/account" className="text-[var(--brand-accent)] underline">
        ← Account
      </Link>
    </div>
  );
}
