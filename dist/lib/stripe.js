"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.STRIPE_PUBLISHABLE_KEY = exports.STRIPE_WEBHOOK_SECRET = exports.STRIPE_CURRENCY = exports.stripe = void 0;
const stripe_1 = __importDefault(require("stripe"));
if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY não está definida nas variáveis de ambiente');
}
exports.stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-09-30.clover', // Use a versão mais recente
    typescript: true,
});
exports.STRIPE_CURRENCY = process.env.STRIPE_CURRENCY || 'BRL';
exports.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
exports.STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY;
//# sourceMappingURL=stripe.js.map