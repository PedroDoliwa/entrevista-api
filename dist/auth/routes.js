"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = authRoutes;
const zod_1 = require("zod");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = require("../lib/prisma");
function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error("JWT_SECRET não definido no .env");
    }
    return secret;
}
async function authRoutes(app) {
    app.post("/login", {
        schema: {
            body: {
                type: "object",
                required: ["email", "senha"],
                properties: {
                    email: { type: "string", format: "email" },
                    senha: { type: "string", minLength: 6 },
                },
            },
        },
        handler: async (request, reply) => {
            const bodySchema = zod_1.z.object({ email: zod_1.z.string().email(), senha: zod_1.z.string().min(6) });
            const { email, senha } = bodySchema.parse(request.body);
            const user = await prisma_1.prisma.user.findUnique({ where: { email } });
            if (!user)
                return reply.code(401).send({ message: "Credenciais inválidas" });
            const ok = await bcrypt_1.default.compare(senha, user.passwordHash);
            if (!ok)
                return reply.code(401).send({ message: "Credenciais inválidas" });
            const token = jsonwebtoken_1.default.sign({ sub: user.id }, getJwtSecret(), { expiresIn: "7d" });
            return { token };
        },
    });
    app.get("/me", {
        handler: async (request, reply) => {
            const auth = request.headers.authorization;
            if (!auth?.startsWith("Bearer "))
                return reply.code(401).send({ message: "Token ausente" });
            const token = auth.slice("Bearer ".length);
            try {
                const payload = jsonwebtoken_1.default.verify(token, getJwtSecret());
                const userId = typeof payload === "object" && payload.sub ? String(payload.sub) : undefined;
                if (!userId)
                    return reply.code(401).send({ message: "Token inválido" });
                const user = await prisma_1.prisma.user.findUnique({
                    where: { id: userId },
                    select: { id: true, fullName: true, email: true, createdAt: true, updatedAt: true },
                });
                if (!user)
                    return reply.code(404).send({ message: "Usuário não encontrado" });
                return user;
            }
            catch {
                return reply.code(401).send({ message: "Token inválido" });
            }
        },
    });
}
//# sourceMappingURL=routes.js.map