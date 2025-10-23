"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jobsRoutes = jobsRoutes;
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
async function jobsRoutes(app) {
    app.post("/", {
        schema: {
            body: {
                type: "object",
                required: ["cargo", "descricao_cargo", "duracao_entrevista", "tipo_de_entrevista", "user_id"],
                properties: {
                    cargo: { type: "string", minLength: 1 },
                    descricao_cargo: { type: "string", minLength: 1 },
                    duracao_entrevista: { type: "integer", minimum: 1 },
                    tipo_de_entrevista: { type: "string", enum: ["TEXT", "VOICE", "AVATAR"] },
                    user_id: { type: "string", minLength: 1 },
                },
            },
        },
        handler: async (request, reply) => {
            const bodySchema = zod_1.z.object({
                cargo: zod_1.z.string().min(1),
                descricao_cargo: zod_1.z.string().min(1),
                duracao_entrevista: zod_1.z.number().int().min(1),
                tipo_de_entrevista: zod_1.z.enum(["TEXT", "VOICE", "AVATAR"]),
                user_id: zod_1.z.string().uuid(),
            });
            const { cargo, descricao_cargo, duracao_entrevista, tipo_de_entrevista, user_id } = bodySchema.parse(request.body);
            const job = await prisma_1.prisma.job.create({
                data: {
                    title: cargo,
                    description: descricao_cargo,
                    durationMinutes: duracao_entrevista,
                    interviewType: tipo_de_entrevista,
                    userId: user_id,
                },
            });
            return reply.code(201).send(job);
        },
    });
    // Rota GET para listar Jobs (com filtro por user_id)
    app.get("/", {
        schema: {
            querystring: {
                type: "object",
                properties: {
                    user_id: { type: "string", format: "uuid" },
                },
            },
        },
        handler: async (request) => {
            const querySchema = zod_1.z.object({
                user_id: zod_1.z.string().uuid().optional(),
            });
            const { user_id } = querySchema.parse(request.query);
            const where = {};
            if (user_id) {
                where.userId = user_id;
            }
            const jobs = await prisma_1.prisma.job.findMany({
                where,
                orderBy: { createdAt: "desc" },
            });
            return jobs;
        },
    });
    // Rota GET para buscar um Job específico pelo ID
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
            const job = await prisma_1.prisma.job.findUnique({
                where: { id },
            });
            if (!job) {
                return reply.code(404).send({ message: "Vaga não encontrada." });
            }
            return job;
        },
    });
    app.patch("/:id/feedback", {
        handler: async (request, reply) => {
            const paramsSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
            const bodySchema = zod_1.z.object({
                summary: zod_1.z.string(),
                strengths: zod_1.z.string(),
                weaknesses: zod_1.z.string(),
                score: zod_1.z.number().int().min(0).max(10),
            });
            try {
                const { id } = paramsSchema.parse(request.params);
                const { summary, strengths, weaknesses, score } = bodySchema.parse(request.body);
                const updatedJob = await prisma_1.prisma.job.update({
                    where: { id },
                    data: {
                        feedbackSummary: summary,
                        feedbackStrengths: strengths,
                        feedbackWeaknesses: weaknesses,
                        feedbackScore: score,
                    },
                });
                return updatedJob;
            }
            catch (error) {
                console.error("Erro ao guardar feedback:", error);
                return reply.code(400).send({ message: "Dados de feedback inválidos." });
            }
        },
    });
}
//# sourceMappingURL=routes.js.map