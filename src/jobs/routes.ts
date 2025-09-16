import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";

export async function jobsRoutes(app: FastifyInstance): Promise<void> {
    app.post<{ Body: unknown }>("/", {
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
            const bodySchema = z.object({
                cargo: z.string().min(1),
                descricao_cargo: z.string().min(1),
                duracao_entrevista: z.number().int().min(1),
                tipo_de_entrevista: z.enum(["TEXT", "VOICE", "AVATAR"]),
                user_id: z.string().uuid(),
            });
            const { cargo, descricao_cargo, duracao_entrevista, tipo_de_entrevista, user_id } = bodySchema.parse(request.body);
            const job = await prisma.job.create({
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
            const querySchema = z.object({
                user_id: z.string().uuid().optional(),
            });
            const { user_id } = querySchema.parse(request.query);

            const where: any = {};
            if (user_id) {
                where.userId = user_id;
            }

            const jobs = await prisma.job.findMany({
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
            const paramsSchema = z.object({ id: z.string().uuid() });
            const { id } = paramsSchema.parse(request.params);
            const job = await prisma.job.findUnique({
                where: { id },
            });
            if (!job) {
                return reply.code(404).send({ message: "Vaga não encontrada." });
            }
            return job;
        },
    });

     app.patch<{ Params: { id: string }; Body: unknown }>("/:id/feedback", {
        handler: async (request, reply) => {
            const paramsSchema = z.object({ id: z.string().uuid() });
            const bodySchema = z.object({
                summary: z.string(),
                strengths: z.string(),
                weaknesses: z.string(),
                score: z.number().int().min(0).max(10),
            });

            try {
                const { id } = paramsSchema.parse(request.params);
                const { summary, strengths, weaknesses, score } = bodySchema.parse(request.body);

                const updatedJob = await prisma.job.update({
                    where: { id },
                    data: {
                        feedbackSummary: summary,
                        feedbackStrengths: strengths,
                        feedbackWeaknesses: weaknesses,
                        feedbackScore: score,
                    },
                });

                return updatedJob;
            } catch (error) {
                console.error("Erro ao guardar feedback:", error);
                return reply.code(400).send({ message: "Dados de feedback inválidos." });
            }
        },
    });
}


