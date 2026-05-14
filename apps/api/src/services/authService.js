import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "../config/env.js";

const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export class AuthService {
  constructor(userRepository) {
    this.users = userRepository;
  }

  async verifyCredentials(email, password) {
    const user = await this.users.findByEmail(email);
    if (!user || !user.is_active) return null;
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return null;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
  }

  async register(input) {
    const hash = await bcrypt.hash(input.password, 10);
    return this.users.createUser({
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash: hash,
      role: "customer",
    });
  }

  makePasswordResetToken() {
    const raw = randomBytes(32).toString("hex");
    const hash = createHash("sha256").update(raw).digest("hex");
    return { raw, hash };
  }

  hashPasswordResetToken(rawToken) {
    return createHash("sha256").update(String(rawToken ?? "")).digest("hex");
  }

  async setPassword(userId, password) {
    const hash = await bcrypt.hash(String(password), 10);
    await this.users.updatePasswordHash(userId, hash);
  }

  async verifyGoogleIdToken(idToken) {
    if (!env.GOOGLE_CLIENT_ID) {
      throw new Error("google_not_configured");
    }
    const { payload } = await jwtVerify(String(idToken), GOOGLE_JWKS, {
      issuer: [...GOOGLE_ISSUERS],
      audience: env.GOOGLE_CLIENT_ID,
    });
    if (!payload?.sub || !payload?.email || payload.email_verified !== true) {
      throw new Error("google_email_not_verified");
    }
    return {
      sub: String(payload.sub),
      email: String(payload.email).toLowerCase().trim(),
      name: String(payload.name || payload.given_name || "Google User").trim(),
    };
  }

  async loginOrRegisterWithGoogle(idToken) {
    const google = await this.verifyGoogleIdToken(idToken);
    let user = await this.users.findByGoogleSub(google.sub);
    if (!user) {
      user = await this.users.findByEmail(google.email);
      if (user) {
        await this.users.linkGoogleIdentity(user.id, google.sub);
        user = await this.users.findById(user.id);
      }
    }
    if (!user) {
      const randomPwd = randomBytes(24).toString("base64url");
      const hash = await bcrypt.hash(randomPwd, 10);
      const id = await this.users.createUser({
        name: google.name || "Google User",
        email: google.email,
        phone: null,
        passwordHash: hash,
        role: "customer",
        googleSub: google.sub,
      });
      user = await this.users.findById(id);
    }
    if (!user || !user.is_active) return null;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
  }

}
