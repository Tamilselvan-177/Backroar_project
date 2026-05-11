/**
 * Staff must hold `permissionKey` via roles; admins always pass.
 */
export async function requireStaffWithPermission(req, reply, rbacService, permissionKey) {
  const uid = req.authUser?.id;
  if (!uid) {
    reply.code(401).send({ error: "auth_required" });
    return null;
  }
  const staffOk = await rbacService.isAdminOrStaff(req.authUser.role, uid);
  if (!staffOk) {
    reply.code(403).send({ error: "admin_required" });
    return null;
  }
  const isAdmin = await rbacService.isAdmin(req.authUser.role, uid);
  if (isAdmin) return uid;
  const ok = await rbacService.hasPermission(uid, permissionKey, false);
  if (!ok) {
    reply.code(403).send({ error: "forbidden", required_permission: permissionKey });
    return null;
  }
  return uid;
}

/** Pass if staff holds any listed permission (admins always pass). */
export async function requireStaffWithAnyPermission(req, reply, rbacService, permissionKeys) {
  const uid = req.authUser?.id;
  if (!uid) {
    reply.code(401).send({ error: "auth_required" });
    return null;
  }
  const staffOk = await rbacService.isAdminOrStaff(req.authUser.role, uid);
  if (!staffOk) {
    reply.code(403).send({ error: "admin_required" });
    return null;
  }
  const isAdmin = await rbacService.isAdmin(req.authUser.role, uid);
  if (isAdmin) return uid;
  const keys = Array.isArray(permissionKeys) ? permissionKeys : [];
  for (const k of keys) {
    if (await rbacService.hasPermission(uid, k, false)) return uid;
  }
  reply.code(403).send({ error: "forbidden", required_permissions: keys });
  return null;
}
