"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const setupRoutes_1 = require("./setupRoutes");
async function buildServer() {
    const app = (0, fastify_1.default)({ logger: true });
    await app.register(cors_1.default, {
        origin: true
    });
    (0, setupRoutes_1.registerRoutes)(app);
    return app;
}
async function main() {
    const app = await buildServer();
    const port = Number(process.env.PORT ?? 3333);
    const host = process.env.HOST ?? "0.0.0.0";
    await app.listen({ port, host });
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=server.js.map