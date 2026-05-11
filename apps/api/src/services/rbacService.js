import { getDb } from "../db/mongo.js";
import { ALL_ADMIN_PERMISSION_KEY_STRINGS, PERM } from "../lib/adminPermissionCatalog.js";

export class RbacService {
  async getUserRoles(userId) {
    try {
      const db = getDb();
      const uid = Number(userId);
      const ur = await db.collection("user_roles").find({ user_id: uid }).toArray();
      if (!ur.length) return [];
      const roleIds = [...new Set(ur.map((r) => r.role_id))];
      const roles = await db.collection("roles").find({ id: { $in: roleIds } }).toArray();
      return ur.map((row) => {
        const r = roles.find((x) => x.id === row.role_id);
        return {
          ...row,
          role_name: r?.name,
          role_description: r?.description,
        };
      });
    } catch {
      return [];
    }
  }

  async isAdmin(sessionRole, userId) {
    if (sessionRole === "admin") return true;
    if (!userId) return false;
    try {
      const u = await getDb().collection("users").findOne({ id: Number(userId) });
      const r = String(u?.role ?? "").trim().toLowerCase();
      if (r === "admin" || r === "administrator" || r === "super admin" || r === "superadmin") return true;
    } catch {
      /* ignore */
    }
    try {
      const roles = await this.getUserRoles(userId);
      for (const row of roles) {
        const name = String(row.role_name ?? "").trim().toLowerCase();
        if (name === "admin" || name === "administrator" || name === "super admin" || name === "superadmin") {
          return true;
        }
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  async isAdminOrStaff(sessionRole, userId) {
    if (!userId) return false;
    if (sessionRole === "admin" || sessionRole === "staff") return true;
    try {
      const u = await getDb().collection("users").findOne({ id: Number(userId) });
      const r = String(u?.role ?? "").toLowerCase();
      if (r === "admin" || r === "staff") return true;
    } catch {
      /* ignore */
    }
    try {
      const roles = await this.getUserRoles(userId);
      return roles.length > 0;
    } catch {
      return false;
    }
  }

  async _hasExactPermission(userId, permissionKey) {
    const db = getDb();
    const uid = Number(userId);
    const cnt = await db
      .collection("user_roles")
      .aggregate([
        { $match: { user_id: uid } },
        {
          $lookup: {
            from: "role_permissions",
            localField: "role_id",
            foreignField: "role_id",
            as: "rp",
          },
        },
        { $unwind: "$rp" },
        {
          $lookup: {
            from: "permissions",
            localField: "rp.permission_id",
            foreignField: "id",
            as: "p",
          },
        },
        { $unwind: "$p" },
        { $match: { "p.key_name": permissionKey } },
        { $count: "n" },
      ])
      .toArray();
    return Number(cnt[0]?.n ?? 0) > 0;
  }

  /**
   * Exact DB grant only (no `admin.catalog` umbrella expansion). Use for capabilities that must be explicitly toggled.
   */
  async hasExactPermission(userId, permissionKey) {
    const key = String(permissionKey ?? "").trim();
    if (!key) return false;
    try {
      return await this._hasExactPermission(userId, key);
    } catch {
      return false;
    }
  }

  /**
   * Staff permission check. Admins bypass. Legacy `admin.catalog` grants granular `admin.catalog.*` keys except
   * `admin.catalog.products.all_shops`, which must always be assigned explicitly (assigned-shop staff stay scoped).
   */
  async hasPermission(userId, permissionKey, isUserAdmin) {
    if (isUserAdmin) return true;
    const key = String(permissionKey ?? "").trim();
    if (!key) return false;
    try {
      if (await this._hasExactPermission(userId, key)) return true;
      if (
        key.startsWith("admin.catalog.") &&
        key !== PERM.CATALOG_PRODUCTS_ALL_SHOPS &&
        (await this._hasExactPermission(userId, "admin.catalog"))
      ) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /** Distinct `permissions.key_name` granted to this user via roles (excludes admin bypass). */
  async listGrantedPermissionKeysForUser(userId) {
    try {
      const db = getDb();
      const uid = Number(userId);
      const rows = await db
        .collection("user_roles")
        .aggregate([
          { $match: { user_id: uid } },
          {
            $lookup: {
              from: "role_permissions",
              localField: "role_id",
              foreignField: "role_id",
              as: "rp",
            },
          },
          { $unwind: { path: "$rp", preserveNullAndEmptyArrays: false } },
          {
            $lookup: {
              from: "permissions",
              localField: "rp.permission_id",
              foreignField: "id",
              as: "p",
            },
          },
          { $unwind: { path: "$p", preserveNullAndEmptyArrays: false } },
          { $group: { _id: null, keys: { $addToSet: "$p.key_name" } } },
        ])
        .toArray();
      return rows[0]?.keys ?? [];
    } catch {
      return [];
    }
  }

  /** Keys the admin shell may use for UI gating (`/api/admin/ping`, `/api/auth/me`). Admins get the full catalog. */
  async listAdminPanelPermissionKeys(sessionRole, userId) {
    if (!userId) return [];
    if (await this.isAdmin(sessionRole, userId)) {
      return [...ALL_ADMIN_PERMISSION_KEY_STRINGS];
    }
    return this.listGrantedPermissionKeysForUser(userId);
  }
}
