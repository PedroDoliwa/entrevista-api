import "dotenv/config";
import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { registerRoutes } from "./setupRoutes";

async function buildServer(): Promise<FastifyInstance> {
	const app = Fastify({ logger: true });
	await app.register(cors, { origin: true });
	registerRoutes(app);
	return app;
}

async function main(): Promise<void> {
	const app = await buildServer();
	const port = Number(process.env.PORT ?? 3333);
	const host = process.env.HOST ?? "0.0.0.0";
	await app.listen({ port, host });
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});


