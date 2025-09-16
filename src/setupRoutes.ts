import { FastifyInstance } from "fastify";
import { usersRoutes } from "./users/routes";
import { jobsRoutes } from "./jobs/routes";
import { schedulesRoutes } from "./schedules/routes";
import { authRoutes } from "./auth/routes";
import { aiRoutes } from "./ai/routes"; 

export function registerRoutes(app: FastifyInstance): void {
    app.register(usersRoutes, { prefix: "/users" });
    app.register(jobsRoutes, { prefix: "/jobs" });
    app.register(schedulesRoutes, { prefix: "/schedules" });
    app.register(authRoutes, { prefix: "/auth" });
    app.register(aiRoutes, { prefix: "/ai" }); 
}
