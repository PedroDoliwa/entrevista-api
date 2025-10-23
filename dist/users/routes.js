"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.usersRoutes = usersRoutes;
const zod_1 = require("zod");
const bcrypt_1 = __importDefault(require("bcrypt"));
const prisma_1 = require("../../generated/prisma");
const prisma_2 = require("../lib/prisma");
async function usersRoutes(app) {
    app.post("/", {
        schema: {
            body: {
                type: "object",
                required: ["nome_completo", "email", "senha"],
                properties: {
                    nome_completo: { type: "string", minLength: 1 },
                    email: { type: "string", format: "email" },
                    senha: { type: "string", minLength: 6 },
                },
            },
        },
        handler: async (request, reply) => {
            const bodySchema = zod_1.z.object({
                nome_completo: zod_1.z.string().min(1),
                email: zod_1.z.string().email(),
                senha: zod_1.z.string().min(6),
            });
            const { nome_completo, email, senha } = bodySchema.parse(request.body);
            const passwordHash = await bcrypt_1.default.hash(senha, 10);
            const user = await prisma_2.prisma.user.create({
                data: {
                    fullName: nome_completo,
                    email,
                    passwordHash,
                },
                select: { id: true, fullName: true, email: true, createdAt: true },
            });
            return reply.code(201).send(user);
        },
    });
    app.get("/", {
        schema: {
            querystring: {
                type: "object",
                properties: {
                    q: { type: "string" },
                    page: { type: "integer", minimum: 1 },
                    perPage: { type: "integer", minimum: 1, maximum: 100 },
                },
            },
        },
        handler: async (request) => {
            const querySchema = zod_1.z.object({
                q: zod_1.z.string().optional(),
                page: zod_1.z.coerce.number().int().min(1).default(1),
                perPage: zod_1.z.coerce.number().int().min(1).max(100).default(10),
            });
            const { q, page, perPage } = querySchema.parse(request.query);
            const where = q
                ? {
                    OR: [
                        { fullName: { contains: q, mode: "insensitive" } },
                        { email: { contains: q, mode: "insensitive" } },
                    ],
                }
                : {};
            const [total, items] = await Promise.all([
                prisma_2.prisma.user.count({ where }),
                prisma_2.prisma.user.findMany({
                    where,
                    orderBy: { createdAt: "desc" },
                    skip: (page - 1) * perPage,
                    take: perPage,
                    select: { id: true, fullName: true, email: true, createdAt: true, updatedAt: true },
                }),
            ]);
            return {
                page,
                perPage,
                total,
                items,
            };
        },
    });
    app.get("/:id", {
        schema: {
            params: {
                type: "object",
                required: ["id"],
                properties: {
                    id: { type: "string", format: "uuid" },
                },
            },
        },
        handler: async (request, reply) => {
            const paramsSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
            const { id } = paramsSchema.parse(request.params);
            const user = await prisma_2.prisma.user.findUnique({
                where: { id },
                select: { id: true, fullName: true, email: true, createdAt: true, updatedAt: true },
            });
            if (!user)
                return reply.code(404).send({ message: "Usuário não encontrado." });
            return user;
        },
    });
    app.patch("/:id", {
        schema: {
            params: {
                type: "object",
                required: ["id"],
                properties: {
                    id: { type: "string", format: "uuid" },
                },
            },
            body: {
                type: "object",
                properties: {
                    nome_completo: { type: "string" },
                    email: { type: "string", format: "email" },
                    senha: { type: "string", minLength: 6 },
                },
                additionalProperties: false,
            },
        },
        handler: async (request, reply) => {
            const paramsSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
            const bodySchema = zod_1.z
                .object({
                nome_completo: zod_1.z.string().min(1).optional(),
                email: zod_1.z.string().email().optional(),
                senha: zod_1.z.string().min(6).optional(),
            })
                .strict();
            const { id } = paramsSchema.parse(request.params);
            const { nome_completo, email, senha } = bodySchema.parse(request.body ?? {});
            const data = {};
            if (nome_completo)
                data.fullName = nome_completo;
            if (email)
                data.email = email;
            if (senha)
                data.passwordHash = await bcrypt_1.default.hash(senha, 10);
            if (Object.keys(data).length === 0) {
                return reply.code(400).send({ message: "Nada para atualizar." });
            }
            try {
                const updated = await prisma_2.prisma.user.update({
                    where: { id },
                    data,
                    select: { id: true, fullName: true, email: true, createdAt: true, updatedAt: true },
                });
                return reply.send(updated);
            }
            catch (err) {
                if (err instanceof prisma_1.Prisma.PrismaClientKnownRequestError) {
                    if (err.code === "P2002") {
                        return reply.code(409).send({ message: "E-mail já está em uso." });
                    }
                    if (err.code === "P2025") {
                        return reply.code(404).send({ message: "Usuário não encontrado." });
                    }
                }
                request.log.error({ err }, "Erro ao atualizar usuário");
                return reply.code(500).send({ message: "Erro interno ao atualizar usuário." });
            }
        },
    });
    app.delete("/:id", {
        schema: {
            params: {
                type: "object",
                required: ["id"],
                properties: {
                    id: { type: "string", format: "uuid" },
                },
            },
        },
        handler: async (request, reply) => {
            const paramsSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
            const { id } = paramsSchema.parse(request.params);
            // Impede exclusão se houver vínculos (jobs/schedules)
            const [jobsCount, schedulesCount] = await Promise.all([
                prisma_2.prisma.job.count({ where: { userId: id } }),
                prisma_2.prisma.schedule.count({ where: { userId: id } }),
            ]);
            if (jobsCount > 0 || schedulesCount > 0) {
                return reply.code(409).send({
                    message: "Usuário possui registros vinculados (vagas ou agendamentos). Remova-os antes de excluir.",
                    jobsCount,
                    schedulesCount,
                });
            }
            try {
                await prisma_2.prisma.user.delete({ where: { id } });
                return reply.code(204).send();
            }
            catch (err) {
                if (err instanceof prisma_1.Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
                    return reply.code(404).send({ message: "Usuário não encontrado." });
                }
                request.log.error({ err }, "Erro ao excluir usuário");
                return reply.code(500).send({ message: "Erro interno ao excluir usuário." });
            }
        },
    });
}
//# sourceMappingURL=routes.js.map