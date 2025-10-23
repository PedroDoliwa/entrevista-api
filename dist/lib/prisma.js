"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const prisma_1 = require("../../generated/prisma");
exports.prisma = globalThis.__prismaClient ?? new prisma_1.PrismaClient();
if (process.env.NODE_ENV !== "production") {
    globalThis.__prismaClient = exports.prisma;
}
//# sourceMappingURL=prisma.js.map