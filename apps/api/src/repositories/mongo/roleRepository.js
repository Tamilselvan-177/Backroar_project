import { getDb } from "../../db/mongo.js";
import { nextSeq } from "./counter.js";

function strip(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return rest;
}

export class MongoRoleRepository {
  async listPermissions() {
    const rows = await getDb().collection("permissions").find({}).sort({ key_name: 1 }).toArray();
    return rows.map(strip);
  }

  async listAll() {
    const db = getDb();
    const rows = await db.collection("roles").find({}).sort({ name: 1 }).toArray();
    const out = [];
    for (const r of rows) {
      const users_count = await db.collection("user_roles").countDocuments({ role_id: r.id });
      out.push({ ...strip(r), users_count });
    }
    return out;
  }

  async findById(id) {
    const r = await getDb().collection("roles").findOne({ id: Number(id) });
    return strip(r);
  }

  /** Role row + `users_count` for admin editor sidebar (parity with list view). */
  async findByIdWithUsersCount(id) {
    const r = await this.findById(id);
    if (!r) return null;
    const users_count = await getDb().collection("user_roles").countDocuments({ role_id: Number(id) });
    return { ...r, users_count };
  }

  async getPermissionIdsForRole(roleId) {
    const rows = await getDb()
      .collection("role_permissions")
      .find({ role_id: Number(roleId) })
      .project({ permission_id: 1, _id: 0 })
      .toArray();
    return rows.map((x) => x.permission_id);
  }

  async createRole({ name, description }) {
    const nameT = String(name ?? "").trim();
    if (!nameT) return { ok: false, error: "validation_failed", field: "name" };
    const id = await nextSeq("roles");
    const now = new Date();
    await getDb().collection("roles").insertOne({
      id,
      name: nameT,
      description: String(description ?? "").trim(),
      is_system_role: 0,
      created_at: now,
      updated_at: now,
    });
    return { ok: true, id };
  }

  async updateRole(id, { name, description }) {
    const rid = Number(id);
    const row = await getDb().collection("roles").findOne({ id: rid });
    if (!row) return { ok: false, error: "not_found" };
    const nameT = String(name ?? "").trim();
    if (!nameT) return { ok: false, error: "validation_failed", field: "name" };
    await getDb()
      .collection("roles")
      .updateOne(
        { id: rid },
        {
          $set: {
            name: nameT,
            description: String(description ?? "").trim(),
            updated_at: new Date(),
          },
        }
      );
    return { ok: true };
  }

  /**
   * Replace role_permissions for this role. All permission ids must exist in `permissions`.
   */
  async setRolePermissions(roleId, permissionIds) {
    const rid = Number(roleId);
    const row = await getDb().collection("roles").findOne({ id: rid });
    if (!row) return { ok: false, error: "not_found" };
    const ids = [...new Set(permissionIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))];
    if (ids.length === 0) {
      await getDb().collection("role_permissions").deleteMany({ role_id: rid });
      return { ok: true };
    }
    const valid = await getDb().collection("permissions").countDocuments({ id: { $in: ids } });
    if (valid !== ids.length) return { ok: false, error: "invalid_permission" };
    const db = getDb();
    await db.collection("role_permissions").deleteMany({ role_id: rid });
    await db.collection("role_permissions").insertMany(ids.map((permission_id) => ({ role_id: rid, permission_id })));
    return { ok: true };
  }

  async deleteById(id) {
    const rid = Number(id);
    const row = await getDb().collection("roles").findOne({ id: rid });
    if (!row) return { ok: false, error: "not_found" };
    if (row.is_system_role === 1 || row.is_system_role === true) {
      return { ok: false, error: "system_role" };
    }
    const users_count = await getDb().collection("user_roles").countDocuments({ role_id: rid });
    if (users_count > 0) return { ok: false, error: "role_in_use", users_count };
    const db = getDb();
    await db.collection("role_permissions").deleteMany({ role_id: rid });
    await db.collection("roles").deleteOne({ id: rid });
    return { ok: true };
  }
}
