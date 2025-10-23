"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.schedulesRoutes = schedulesRoutes;
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
async function schedulesRoutes(app) {
    app.post("/", {
        schema: {
            body: {
                type: "object",
                required: ["titulo_vaga_agendamento", "data_entrevista_agendamento", "user_id", "job_id"],
                properties: {
                    titulo_vaga_agendamento: { type: "string", minLength: 1 },
                    data_entrevista_agendamento: { type: "string" },
                    user_id: { type: "string" },
                    job_id: { type: "string" },
                },
            },
        },
        handler: async (request, reply) => {
            const bodySchema = zod_1.z.object({
                titulo_vaga_agendamento: zod_1.z.string().min(1),
                data_entrevista_agendamento: zod_1.z.coerce.date(),
                user_id: zod_1.z.string().uuid(),
                job_id: zod_1.z.string().uuid(),
            });
            const { titulo_vaga_agendamento, data_entrevista_agendamento, user_id, job_id } = bodySchema.parse(request.body);
            const schedule = await prisma_1.prisma.schedule.create({
                data: {
                    title: titulo_vaga_agendamento,
                    scheduledAt: data_entrevista_agendamento,
                    userId: user_id,
                    jobId: job_id,
                },
            });
            return reply.code(201).send(schedule);
        },
    });
    app.get("/", {
        schema: {
            querystring: {
                type: "object",
                properties: {
                    titulo_vaga_agendamento: { type: "string" },
                    data_entrevista_agendamento: { type: "string" },
                    user_id: { type: "string" },
                    job_id: { type: "string" },
                },
            },
        },
        handler: async (request) => {
            const querySchema = zod_1.z.object({
                titulo_vaga_agendamento: zod_1.z.string().optional(),
                data_entrevista_agendamento: zod_1.z.coerce.date().optional(),
                user_id: zod_1.z.string().uuid().optional(),
                job_id: zod_1.z.string().uuid().optional(),
            });
            const { titulo_vaga_agendamento, data_entrevista_agendamento, user_id, job_id } = querySchema.parse(request.query);
            const where = {};
            if (titulo_vaga_agendamento)
                where.title = { contains: titulo_vaga_agendamento, mode: "insensitive" };
            if (data_entrevista_agendamento)
                where.scheduledAt = data_entrevista_agendamento;
            if (user_id)
                where.userId = user_id;
            if (job_id)
                where.jobId = job_id;
            const schedules = await prisma_1.prisma.schedule.findMany({ where, orderBy: { scheduledAt: "asc" } });
            return schedules;
        },
    });
}
//# sourceMappingURL=routes.js.map