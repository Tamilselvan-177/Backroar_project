import { createContext, useContext, useMemo } from "react";
import { P } from "./adminPermKeys.js";

const AdminPermContext = createContext({
  ready: false,
  isAdmin: false,
  catalogScope: null,
  has: () => false,
});

export function AdminPermProvider({ children, ready, isAdmin, keys, catalogScope }) {
  const value = useMemo(() => {
    const set = new Set(keys ?? []);
    return {
      ready: !!ready,
      isAdmin: !!isAdmin,
      catalogScope: catalogScope ?? null,
      has: (permKey) => {
        if (!permKey) return true;
        if (isAdmin) return true;
        if (set.has(permKey)) return true;
        if (
          typeof permKey === "string" &&
          permKey.startsWith("admin.catalog.") &&
          set.has(P.ADMIN_CATALOG)
        ) {
          if (permKey === P.CATALOG_PRODUCTS_ALL_SHOPS) return set.has(P.CATALOG_PRODUCTS_ALL_SHOPS);
          return true;
        }
        return false;
      },
    };
  }, [ready, isAdmin, keys, catalogScope]);
  return <AdminPermContext.Provider value={value}>{children}</AdminPermContext.Provider>;
}

export function useAdminPerm() {
  return useContext(AdminPermContext);
}
