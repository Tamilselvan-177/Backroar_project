import bcrypt from "bcryptjs";

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

}
