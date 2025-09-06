import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";

export async function schedulesRoutes(app: FastifyInstance): Promise<void> {
	app.post<{ Body: unknown }>("/", {
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
			const bodySchema = z.object({
				titulo_vaga_agendamento: z.string().min(1),
				data_entrevista_agendamento: z.coerce.date(),
				user_id: z.string().uuid(),
				job_id: z.string().uuid(),
			});
			const { titulo_vaga_agendamento, data_entrevista_agendamento, user_id, job_id } = bodySchema.parse(request.body);
			const schedule = await prisma.schedule.create({
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
			const querySchema = z.object({
				titulo_vaga_agendamento: z.string().optional(),
				data_entrevista_agendamento: z.coerce.date().optional(),
				user_id: z.string().uuid().optional(),
				job_id: z.string().uuid().optional(),
			});
			const { titulo_vaga_agendamento, data_entrevista_agendamento, user_id, job_id } = querySchema.parse(request.query);
			const where: any = {};
			if (titulo_vaga_agendamento) where.title = { contains: titulo_vaga_agendamento, mode: "insensitive" };
			if (data_entrevista_agendamento) where.scheduledAt = data_entrevista_agendamento;
			if (user_id) where.userId = user_id;
			if (job_id) where.jobId = job_id;
			const schedules = await prisma.schedule.findMany({ where, orderBy: { scheduledAt: "asc" } });
			return schedules;
		},
	});
}


