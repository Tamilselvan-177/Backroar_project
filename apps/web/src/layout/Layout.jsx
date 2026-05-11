import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { apiJson, bootstrapCsrf, legacyPublic } from "../api/client.js";
import { DeleteConfirmProvider } from "../context/DeleteConfirmContext.jsx";
import { notifyAuthSessionChanged, subscribeAuthSessionChanged } from "../lib/authCrossTab.js";

function navLinkClass({ isActive }) {
  const base = "nav-link px-1 py-1";
  if (isActive) return `${base} text-black`;
  return `${base} text-[var(--brand-text)]`;
}

export default function Layout({ children }) {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [me, setMe] = useState(null);
  const [cartCount, setCartCount] = useState(null);

  useEffect(() => {
    apiJson("/api/auth/me")
      .then(setMe)
      .catch(() => setMe({ user: null }));
  }, []);

  useEffect(() => {
    return subscribeAuthSessionChanged(async () => {
      await bootstrapCsrf();
      try {
        const m = await apiJson("/api/auth/me");
        setMe(m);
      } catch {
        setMe({ user: null });
      }
    });
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      apiJson("/api/auth/me")
        .then(setMe)
        .catch(() => setMe({ user: null }));
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (!me?.user) {
      setCartCount(null);
      return;
    }
    apiJson("/api/cart/count")
      .then((d) => setCartCount(Number(d.count ?? 0)))
      .catch(() => setCartCount(0));
  }, [me]);

  async function onLogout(e) {
    e.preventDefault();
    try {
      await apiJson("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
    } catch {
      /* ignore */
    }
    notifyAuthSessionChanged();
    setMe({ user: null });
    setUserOpen(false);
    navigate("/");
  }

  function onSearchDesktop(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const q = String(fd.get("q") ?? "").trim();
    setMobileOpen(false);
    navigate(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
  }

  function onSearchMobile(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const q = String(fd.get("q") ?? "").trim();
    setMobileOpen(false);
    navigate(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
  }

  const user = me?.user;
  const logoSrc = legacyPublic("/public/image/br-company-logo.jpeg");

  return (
    <DeleteConfirmProvider>
      <div className="min-h-screen flex flex-col bg-[var(--brand-bg)]">
      <nav className="sticky top-0 w-full z-50 bg-white/95 backdrop-blur border-b border-[var(--card-border)] shadow-sm">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between nav-container">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Menu"
              className="md:hidden p-2 rounded-lg text-[var(--brand-text)] hover:bg-black/5"
              onClick={() => setMobileOpen((o) => !o)}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <Link to="/" className="flex items-center gap-2">
              {logoSrc ? (
                <img src={logoSrc} alt="BackRoar" className="h-10 w-auto object-contain" />
              ) : (
                <span className="text-xl font-black tracking-wide text-[var(--brand-text)]">BackRoar</span>
              )}
            </Link>
            <span className="hidden md:inline-flex nav-chip ml-1">
              <span className="dot" />
              <span>Back&nbsp;Roar</span>
            </span>
          </div>

          <div className="hidden md:flex items-center gap-6">
            <NavLink to="/" className={navLinkClass} end>
              Home
            </NavLink>
            <NavLink to="/categories" className={navLinkClass}>
              Categories
            </NavLink>
            <NavLink to="/products" className={navLinkClass}>
              Shop
            </NavLink>
            <NavLink to="/about" className={navLinkClass}>
              About
            </NavLink>
            <NavLink to="/contact" className={navLinkClass}>
              Contact
            </NavLink>
          </div>

          <div className="flex items-center gap-2">
            <form onSubmit={onSearchDesktop} className="hidden md:flex items-center">
              <input
                type="search"
                name="q"
                placeholder="Search products..."
                className="nav-input px-3 py-2"
              />
              <button type="submit" className="ml-2 p-2 text-gray-600 hover:text-black" aria-label="Search">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </button>
            </form>

            <Link
              to="/cart"
              className="hidden md:inline-flex items-center gap-2 nav-cta px-3 py-2 relative"
              aria-label="Cart"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path
                  d="M6 6h14l-2 8H8L6 6z"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="9" cy="20" r="1" />
                <circle cx="17" cy="20" r="1" />
              </svg>
              <span>Cart</span>
              {user && cartCount != null && cartCount > 0 ? (
                <span className="ml-1 bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5">{cartCount}</span>
              ) : null}
            </Link>

            {user && (user.isStaffPanel || user.role === "admin" || user.role === "staff") ? (
              <Link to="/admin" className="hidden md:inline-flex items-center gap-2 nav-cta px-3 py-2">
                <span>Admin</span>
              </Link>
            ) : null}

            <div className="relative">
              <button
                type="button"
                className="hidden md:inline-flex items-center gap-2 px-3 py-2 nav-user-btn userDropdownToggle"
                onClick={() => setUserOpen((o) => !o)}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <circle cx="12" cy="8" r="3" strokeWidth="2" />
                  <path
                    d="M6 20c0-3.314 2.686-6 6-6s6 2.686 6 6"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="text-xs">{user ? user.name : "Login"}</span>
                <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {userOpen ? (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50 border border-gray-100">
                  {user ? (
                    <>
                      <Link
                        to="/account"
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        onClick={() => setUserOpen(false)}
                      >
                        <i className="fas fa-user w-4 mr-2" />
                        My Profile
                      </Link>
                      <Link
                        to="/orders"
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        onClick={() => setUserOpen(false)}
                      >
                        <i className="fas fa-shopping-bag w-4 mr-2" />
                        Orders
                      </Link>
                      <Link
                        to="/wishlist"
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        onClick={() => setUserOpen(false)}
                      >
                        <i className="fas fa-heart w-4 mr-2" />
                        Wishlist
                      </Link>
                      <div className="border-t border-gray-200 my-1" />
                      <button
                        type="button"
                        className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                        onClick={onLogout}
                      >
                        <i className="fas fa-sign-out-alt w-4 mr-2" />
                        Logout
                      </button>
                    </>
                  ) : (
                    <>
                      <Link
                        to="/login"
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        onClick={() => setUserOpen(false)}
                      >
                        Login
                      </Link>
                      <Link
                        to="/register"
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        onClick={() => setUserOpen(false)}
                      >
                        Register
                      </Link>
                    </>
                  )}
                </div>
              ) : null}
            </div>

            <Link to="/cart" className="relative md:hidden" aria-label="Cart">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              {user && cartCount != null && cartCount > 0 ? (
                <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {cartCount > 9 ? "9+" : cartCount}
                </span>
              ) : null}
            </Link>

            {user ? (
              <Link
                to="/account"
                aria-label="Account"
                className="md:hidden p-2 rounded-lg bg-[var(--brand-navbar)] text-white hover:bg-black"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <circle cx="12" cy="8" r="3" strokeWidth="2" />
                  <path
                    d="M6 20c0-3.314 2.686-6 6-6s6 2.686 6 6"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
            ) : (
              <Link
                to="/login"
                aria-label="Account"
                className="md:hidden p-2 rounded-lg bg-[var(--brand-navbar)] text-white hover:bg-black"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <circle cx="12" cy="8" r="3" strokeWidth="2" />
                  <path
                    d="M6 20c0-3.314 2.686-6 6-6s6 2.686 6 6"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
            )}
          </div>
        </div>

        <div className={`md:hidden border-t border-gray-200 bg-white ${mobileOpen ? "" : "hidden"}`}>
          <div className="px-4 py-3 space-y-3">
            <form onSubmit={onSearchMobile} className="flex gap-2">
              <input
                type="search"
                name="q"
                placeholder="Search products..."
                className="flex-1 px-3 py-2 rounded-lg border border-[var(--card-border)] outline-none"
              />
              <button type="submit" className="px-4 py-2 bg-[var(--brand-primary)] text-white rounded-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </button>
            </form>
            <Link to="/" className="block text-[var(--brand-text)]" onClick={() => setMobileOpen(false)}>
              Home
            </Link>
            <Link to="/categories" className="block text-[var(--brand-text)]" onClick={() => setMobileOpen(false)}>
              Categories
            </Link>
            <Link to="/products" className="block text-[var(--brand-text)]" onClick={() => setMobileOpen(false)}>
              Shop
            </Link>
            <Link to="/about" className="block text-[var(--brand-text)]" onClick={() => setMobileOpen(false)}>
              About
            </Link>
            <Link to="/contact" className="block text-[var(--brand-text)]" onClick={() => setMobileOpen(false)}>
              Contact
            </Link>
            {user && (user.isStaffPanel || user.role === "admin" || user.role === "staff") ? (
              <Link to="/admin" className="block text-[var(--brand-text)]" onClick={() => setMobileOpen(false)}>
                Admin
              </Link>
            ) : null}
            {!user ? (
              <Link to="/login" className="block text-[var(--brand-text)]" onClick={() => setMobileOpen(false)}>
                Login
              </Link>
            ) : null}
          </div>
        </div>
      </nav>

      <main className="flex-1 storefront-main">{children}</main>

      <footer className="bg-[#0a0a0a] text-white pt-16 pb-8 border-t border-gray-900 mt-20">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
            <div>
              <h4 className="text-sm font-bold uppercase tracking-[0.2em] mb-3 text-white">Useful Links</h4>
              <div className="w-10 h-[3px] bg-[#10b981] mb-6" />
              <ul className="space-y-3 text-[13px] text-gray-400 font-medium">
                <li>
                  <span className="text-gray-500">Love from the Customers</span>
                </li>
                <li>
                  <Link to="/about" className="hover:text-white transition-colors">
                    About Us
                  </Link>
                </li>
                <li>
                  <Link to="/contact" className="hover:text-white transition-colors">
                    Contact Us
                  </Link>
                </li>
                <li>
                  <Link to="/refund-policy" className="hover:text-white transition-colors">
                    Refund Policy
                  </Link>
                </li>
                <li>
                  <Link to="/privacy-policy" className="hover:text-white transition-colors">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link to="/shipping-policy" className="hover:text-white transition-colors">
                    Shipping Policy
                  </Link>
                </li>
                <li>
                  <Link to="/terms" className="hover:text-white transition-colors">
                    Terms and Conditions
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-bold uppercase tracking-[0.2em] mb-3 text-white">Account</h4>
              <div className="w-10 h-[3px] bg-[#10b981] mb-6" />
              <ul className="space-y-3 text-[13px] text-gray-400 font-medium">
                <li>
                  <Link to="/orders" className="hover:text-white transition-colors">
                    My Orders
                  </Link>
                </li>
                <li>
                  <Link to="/account" className="hover:text-white transition-colors">
                    My Account
                  </Link>
                </li>
                <li>
                  <Link to="/orders" className="hover:text-white transition-colors">
                    Track Order
                  </Link>
                </li>
                <li>
                  <Link to="/checkout" className="hover:text-white transition-colors">
                    Checkout
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-bold uppercase tracking-[0.2em] mb-3 text-white">Help Center</h4>
              <div className="w-10 h-[3px] bg-[#10b981] mb-6" />
              <div className="text-[13px] text-gray-400 space-y-4 font-medium">
                <p className="leading-relaxed">
                  Support time : 09.30 AM to 06.00 PM
                  <br />
                  (Monday to Saturday)
                </p>
                <p>
                  <a href="mailto:Contact@backroar.in" className="hover:text-white transition-colors">
                    Contact@backroar.in
                  </a>
                </p>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-bold uppercase tracking-[0.2em] mb-3 text-white">Registered Office Address:</h4>
              <div className="w-10 h-[3px] bg-[#10b981] mb-6" />
              <div className="text-[13px] text-gray-400 space-y-1 font-medium leading-relaxed">
                <p className="text-white font-bold">Backroar</p>
                <p>Shop No. 2/1, 1ST FLOOR</p>
                <p>NARASINGAPURAM STREET MOUNT ROAD</p>
                <p>CHINTADRIPET 600002</p>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-900 pt-8 flex flex-col md:flex-row items-center justify-between gap-6">
            <p className="text-[12px] text-gray-500 font-medium uppercase tracking-widest">
              Copyright {new Date().getFullYear()} © Backroar.in
            </p>
          </div>
        </div>
      </footer>
    </div>
    </DeleteConfirmProvider>
  );
}
