import { FastifyInstance } from "fastify";
import { z } from "zod";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";

function getJwtSecret(): string {
	const secret = process.env.JWT_SECRET;
	if (!secret) {
		throw new Error("JWT_SECRET não definido no .env");
	}
	return secret;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
	app.post<{ Body: unknown }>("/login", {
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
			const bodySchema = z.object({ email: z.string().email(), senha: z.string().min(6) });
			const { email, senha } = bodySchema.parse(request.body);
			const user = await prisma.user.findUnique({ where: { email } });
			if (!user) return reply.code(401).send({ message: "Credenciais inválidas" });
			const ok = await bcrypt.compare(senha, user.passwordHash);
			if (!ok) return reply.code(401).send({ message: "Credenciais inválidas" });
			const token = jwt.sign({ sub: user.id }, getJwtSecret(), { expiresIn: "7d" });
			return { token };
		},
	});

	app.get("/me", {
		handler: async (request, reply) => {
			const auth = request.headers.authorization;
			if (!auth?.startsWith("Bearer ")) return reply.code(401).send({ message: "Token ausente" });
			const token = auth.slice("Bearer ".length);
			try {
				const payload = jwt.verify(token, getJwtSecret());
				const userId = typeof payload === "object" && payload.sub ? String(payload.sub) : undefined;
				if (!userId) return reply.code(401).send({ message: "Token inválido" });
				const user = await prisma.user.findUnique({
					where: { id: userId },
					select: { id: true, fullName: true, email: true, createdAt: true, updatedAt: true },
				});
				if (!user) return reply.code(404).send({ message: "Usuário não encontrado" });
				return user;
			} catch {
				return reply.code(401).send({ message: "Token inválido" });
			}
		},
	});
}


