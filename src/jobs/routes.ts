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
}


