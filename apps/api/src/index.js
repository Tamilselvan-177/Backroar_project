import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { env } from "./config/env.js";
import { connectMongo } from "./db/mongo.js";
import { ensureAllIndexes } from "./db/mongoIndexes.js";
import { connectRedis } from "./lib/redis.js";
import { logger } from "./lib/logger.js";
import sessionContext from "./plugins/sessionContext.js";
import jwtAuthContext from "./plugins/jwtAuthContext.js";
import { createRepositories } from "./repositories/registry.js";
import { AuthService } from "./services/authService.js";
import { RbacService } from "./services/rbacService.js";
import { registerRoutes } from "./routes/registerRoutes.js";
import { registerAdminRoutes } from "./routes/adminRoutes.js";
import { registerAdminPosRoutes } from "./routes/adminPosRoutes.js";

const app = Fastify({
  loggerInstance: logger,
  trustProxy: env.TRUST_PROXY,
  genReqId: () => randomUUID(),
  bodyLimit: 1024 * 1024,
});

await app.register(helmet, {
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
});

await app.register(cors, {
  origin: env.WEB_ORIGIN,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-CSRF-Token", "Authorization"],
});

await app.register(cookie, {
  secret: env.SESSION_SECRET,
  hook: "onRequest",
});

await app.register(rateLimit, {
  global: true,
  max: 400,
  timeWindow: "1 minute",
});

await app.register(multipart, {
  limits: {
    fileSize: 15 * 1024 * 1024,
    files: 24,
  },
});

await app.register(sessionContext);
await app.register(jwtAuthContext);

await app.register(swagger, {
  openapi: {
    info: {
      title: env.APP_NAME || "Backroar API",
      version: "0.0.1",
    },
    servers: [{ url: "/" }],
  },
});

await app.register(swaggerUi, { routePrefix: "/api/docs" });

await connectMongo();
logger.info("mongodb connected");

try {
  await ensureAllIndexes();
  logger.info("mongodb indexes and RBAC permission catalog synced");
} catch (err) {
  logger.warn({ err }, "ensureAllIndexes failed — run `node apps/api/src/scripts/ensureMongoIndexes.js` if RBAC is empty");
}

if (env.USE_REDIS) {
  try {
    await connectRedis();
    logger.info("redis connected");
  } catch (err) {
    logger.fatal(
      { err: err?.message || String(err) },
      "USE_REDIS=true but Redis is not reachable — fix REDIS_URL / start Redis, or set USE_REDIS=false in repo-root .env for local dev."
    );
    process.exit(1);
  }
} else {
  logger.info("redis disabled (USE_REDIS=false); sessions use in-memory store");
}

const repos = createRepositories();
const authService = new AuthService(repos.users);
const rbacService = new RbacService();

await registerRoutes(app, { repos, authService, rbacService });
await registerAdminRoutes(app, { repos, rbacService });
await registerAdminPosRoutes(app, { repos, rbacService });

await app.listen({ host: env.API_HOST, port: env.API_PORT });
logger.info({ port: env.API_PORT }, "api listening");
