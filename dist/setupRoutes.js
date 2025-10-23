"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRoutes = registerRoutes;
const routes_1 = require("./users/routes");
const routes_2 = require("./jobs/routes");
const routes_3 = require("./schedules/routes");
const routes_4 = require("./auth/routes");
const routes_5 = require("./ai/routes");
const routes_6 = require("./credits/routes");
const routes_7 = require("./payments/routes");
function registerRoutes(app) {
    app.register(routes_1.usersRoutes, { prefix: "/users" });
    app.register(routes_2.jobsRoutes, { prefix: "/jobs" });
    app.register(routes_3.schedulesRoutes, { prefix: "/schedules" });
    app.register(routes_4.authRoutes, { prefix: "/auth" });
    app.register(routes_5.aiRoutes, { prefix: "/ai" });
    app.register(routes_6.creditsRoutes, { prefix: "/credits" });
    app.register(routes_7.paymentsRoutes, { prefix: "/payments" });
}
//# sourceMappingURL=setupRoutes.js.map