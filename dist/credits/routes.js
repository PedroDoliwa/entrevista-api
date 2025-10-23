"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.creditsRoutes = creditsRoutes;
const zod_1 = require("zod");
const prisma_1 = require("../../generated/prisma");
const prisma_2 = require("../lib/prisma");
// Função para calcular o custo de créditos baseado no tipo de entrevista
function getCreditsCost(interviewType, durationMinutes) {
    const baseCosts = {
        TEXT: 1,
        VOICE: 2,
        AVATAR: 3
    };
    const baseCost = baseCosts[interviewType] || 1;
    // Adiciona custo extra para entrevistas mais longas
    if (durationMinutes > 30) {
        return baseCost * 2;
    }
    return baseCost;
}
async function creditsRoutes(app) {
    // GET /credits - Obter saldo de créditos do usuário
    app.get("/:userId", {
        schema: {
            params: {
                type: "object",
                required: ["userId"],
                properties: {
                    userId: { type: "string", format: "uuid" },
                },
            },
        },
        handler: async (request, reply) => {
            const paramsSchema = zod_1.z.object({ userId: zod_1.z.string().uuid() });
            const { userId } = paramsSchema.parse(request.params);
            const user = await prisma_2.prisma.user.findUnique({
                where: { id: userId },
                select: {
                    id: true,
                    fullName: true,
                    email: true,
                    credits: true,
                    createdAt: true
                },
            });
            if (!user) {
                return reply.code(404).send({ message: "Usuário não encontrado." });
            }
            return {
                userId: user.id,
                fullName: user.fullName,
                email: user.email,
                credits: user.credits,
                memberSince: user.createdAt
            };
        },
    });
    // GET /credits/packages - Listar pacotes de créditos disponíveis
    app.get("/packages", {
        handler: async (request) => {
            const packages = await prisma_2.prisma.creditPackage.findMany({
                where: { isActive: true },
                orderBy: { price: "asc" },
                select: {
                    id: true,
                    name: true,
                    description: true,
                    credits: true,
                    price: true,
                },
            });
            return { packages };
        },
    });
    // POST /credits/packages - Criar novo pacote de créditos (admin)
    app.post("/packages", {
        schema: {
            body: {
                type: "object",
                required: ["name", "credits", "price"],
                properties: {
                    name: { type: "string", minLength: 1 },
                    description: { type: "string" },
                    credits: { type: "integer", minimum: 1 },
                    price: { type: "number", minimum: 0 },
                },
            },
        },
        handler: async (request, reply) => {
            const bodySchema = zod_1.z.object({
                name: zod_1.z.string().min(1),
                description: zod_1.z.string().optional(),
                credits: zod_1.z.number().int().min(1),
                price: zod_1.z.number().min(0),
            });
            const { name, description, credits, price } = bodySchema.parse(request.body);
            const creditPackage = await prisma_2.prisma.creditPackage.create({
                data: {
                    name,
                    description: description || null,
                    credits,
                    price: new prisma_1.Prisma.Decimal(price),
                },
            });
            return reply.code(201).send(creditPackage);
        },
    });
    // POST /credits/calculate-cost - Calcular custo de uma entrevista
    app.post("/calculate-cost", {
        schema: {
            body: {
                type: "object",
                required: ["interviewType", "durationMinutes"],
                properties: {
                    interviewType: { type: "string", enum: ["TEXT", "VOICE", "AVATAR"] },
                    durationMinutes: { type: "integer", minimum: 1 },
                },
            },
        },
        handler: async (request) => {
            const bodySchema = zod_1.z.object({
                interviewType: zod_1.z.enum(["TEXT", "VOICE", "AVATAR"]),
                durationMinutes: zod_1.z.number().int().min(1),
            });
            const { interviewType, durationMinutes } = bodySchema.parse(request.body);
            const cost = getCreditsCost(interviewType, durationMinutes);
            return {
                interviewType,
                durationMinutes,
                creditsCost: cost,
            };
        },
    });
    // POST /credits/consume - Consumir créditos para uma entrevista
    app.post("/consume", {
        schema: {
            body: {
                type: "object",
                required: ["userId", "jobId", "interviewType", "durationMinutes"],
                properties: {
                    userId: { type: "string", format: "uuid" },
                    jobId: { type: "string", format: "uuid" },
                    interviewType: { type: "string", enum: ["TEXT", "VOICE", "AVATAR"] },
                    durationMinutes: { type: "integer", minimum: 1 },
                },
            },
        },
        handler: async (request, reply) => {
            const bodySchema = zod_1.z.object({
                userId: zod_1.z.string().uuid(),
                jobId: zod_1.z.string().uuid(),
                interviewType: zod_1.z.enum(["TEXT", "VOICE", "AVATAR"]),
                durationMinutes: zod_1.z.number().int().min(1),
            });
            const { userId, jobId, interviewType, durationMinutes } = bodySchema.parse(request.body);
            const creditsCost = getCreditsCost(interviewType, durationMinutes);
            try {
                // Verificar se o usuário tem créditos suficientes
                const user = await prisma_2.prisma.user.findUnique({
                    where: { id: userId },
                    select: { credits: true },
                });
                if (!user) {
                    return reply.code(404).send({ message: "Usuário não encontrado." });
                }
                if (user.credits < creditsCost) {
                    return reply.code(400).send({
                        message: "Créditos insuficientes.",
                        required: creditsCost,
                        available: user.credits,
                    });
                }
                // Executar transação para consumir créditos
                const result = await prisma_2.prisma.$transaction(async (tx) => {
                    // Atualizar saldo de créditos do usuário
                    const updatedUser = await tx.user.update({
                        where: { id: userId },
                        data: { credits: { decrement: creditsCost } },
                        select: { credits: true },
                    });
                    // Criar transação de consumo
                    const transaction = await tx.creditTransaction.create({
                        data: {
                            type: "CONSUMPTION",
                            status: "COMPLETED",
                            amount: -creditsCost, // Negativo para consumo
                            userId,
                            jobId,
                        },
                    });
                    return { updatedUser, transaction };
                });
                return {
                    message: "Créditos consumidos com sucesso.",
                    transactionId: result.transaction.id,
                    creditsUsed: creditsCost,
                    remainingCredits: result.updatedUser.credits,
                };
            }
            catch (error) {
                console.error("Erro ao consumir créditos:", error);
                return reply.code(500).send({
                    message: "Erro interno ao consumir créditos.",
                });
            }
        },
    });
    // GET /credits/:userId/transactions - Histórico de transações do usuário
    app.get("/:userId/transactions", {
        schema: {
            params: {
                type: "object",
                required: ["userId"],
                properties: {
                    userId: { type: "string", format: "uuid" },
                },
            },
            querystring: {
                type: "object",
                properties: {
                    page: { type: "integer", minimum: 1 },
                    perPage: { type: "integer", minimum: 1, maximum: 100 },
                    type: { type: "string", enum: ["PURCHASE", "CONSUMPTION", "REFUND", "BONUS"] },
                },
            },
        },
        handler: async (request) => {
            const paramsSchema = zod_1.z.object({ userId: zod_1.z.string().uuid() });
            const querySchema = zod_1.z.object({
                page: zod_1.z.coerce.number().int().min(1).default(1),
                perPage: zod_1.z.coerce.number().int().min(1).max(100).default(20),
                type: zod_1.z.enum(["PURCHASE", "CONSUMPTION", "REFUND", "BONUS"]).optional(),
            });
            const { userId } = paramsSchema.parse(request.params);
            const { page, perPage, type } = querySchema.parse(request.query);
            const where = {
                userId,
                ...(type && { type }),
            };
            const [total, transactions] = await Promise.all([
                prisma_2.prisma.creditTransaction.count({ where }),
                prisma_2.prisma.creditTransaction.findMany({
                    where,
                    orderBy: { createdAt: "desc" },
                    skip: (page - 1) * perPage,
                    take: perPage,
                    select: {
                        id: true,
                        type: true,
                        status: true,
                        amount: true,
                        price: true,
                        createdAt: true,
                        package: {
                            select: { name: true, credits: true },
                        },
                        job: {
                            select: { title: true, interviewType: true },
                        },
                    },
                }),
            ]);
            return {
                page,
                perPage,
                total,
                transactions,
            };
        },
    });
    // POST /credits/:userId/add-bonus - Adicionar créditos bônus (admin)
    app.post("/:userId/add-bonus", {
        schema: {
            params: {
                type: "object",
                required: ["userId"],
                properties: {
                    userId: { type: "string", format: "uuid" },
                },
            },
            body: {
                type: "object",
                required: ["credits", "reason"],
                properties: {
                    credits: { type: "integer", minimum: 1 },
                    reason: { type: "string", minLength: 1 },
                },
            },
        },
        handler: async (request, reply) => {
            const paramsSchema = zod_1.z.object({ userId: zod_1.z.string().uuid() });
            const bodySchema = zod_1.z.object({
                credits: zod_1.z.number().int().min(1),
                reason: zod_1.z.string().min(1),
            });
            const { userId } = paramsSchema.parse(request.params);
            const { credits, reason } = bodySchema.parse(request.body);
            try {
                const result = await prisma_2.prisma.$transaction(async (tx) => {
                    // Atualizar saldo de créditos do usuário
                    const updatedUser = await tx.user.update({
                        where: { id: userId },
                        data: { credits: { increment: credits } },
                        select: { credits: true },
                    });
                    // Criar transação de bônus
                    const transaction = await tx.creditTransaction.create({
                        data: {
                            type: "BONUS",
                            status: "COMPLETED",
                            amount: credits,
                            userId,
                            metadata: { reason },
                        },
                    });
                    return { updatedUser, transaction };
                });
                return reply.code(201).send({
                    message: "Créditos bônus adicionados com sucesso.",
                    transactionId: result.transaction.id,
                    creditsAdded: credits,
                    newBalance: result.updatedUser.credits,
                });
            }
            catch (error) {
                console.error("Erro ao adicionar créditos bônus:", error);
                return reply.code(500).send({
                    message: "Erro interno ao adicionar créditos bônus.",
                });
            }
        },
    });
}
//# sourceMappingURL=routes.js.map