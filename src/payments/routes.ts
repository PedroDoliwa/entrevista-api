import { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "../../generated/prisma";
import { prisma } from "../lib/prisma";

export async function paymentsRoutes(app: FastifyInstance): Promise<void> {
  
  // POST /payments/create-intent - Criar intenção de pagamento
  app.post<{ Body: unknown }>("/create-intent", {
    schema: {
      body: {
        type: "object",
        required: ["userId", "packageId"],
        properties: {
          userId: { type: "string", format: "uuid" },
          packageId: { type: "string", format: "uuid" },
          paymentMethod: { type: "string", enum: ["credit_card", "pix", "boleto"] },
        },
      },
    },
    handler: async (request, reply) => {
      const bodySchema = z.object({
        userId: z.string().uuid(),
        packageId: z.string().uuid(),
        paymentMethod: z.enum(["credit_card", "pix", "boleto"]).default("credit_card"),
      });
      
      const { userId, packageId, paymentMethod } = bodySchema.parse(request.body);
      
      try {
        // Verificar se o usuário existe
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, fullName: true, email: true },
        });
        
        if (!user) {
          return reply.code(404).send({ message: "Usuário não encontrado." });
        }
        
        // Verificar se o pacote existe e está ativo
        const creditPackage = await prisma.creditPackage.findFirst({
          where: { id: packageId, isActive: true },
          select: { id: true, name: true, credits: true, price: true },
        });
        
        if (!creditPackage) {
          return reply.code(404).send({ message: "Pacote de créditos não encontrado ou inativo." });
        }
        
        // Criar transação pendente
        const transaction = await prisma.creditTransaction.create({
          data: {
            type: "PURCHASE",
            status: "PENDING",
            amount: creditPackage.credits,
            price: creditPackage.price,
            userId,
            packageId,
            paymentId: `temp_${Date.now()}`, // ID temporário
            metadata: {
              paymentMethod,
              packageName: creditPackage.name,
              createdAt: new Date().toISOString(),
            },
          },
        });
        
        // Simular resposta de gateway de pagamento
        const paymentIntent = {
          id: transaction.id,
          status: "requires_payment_method",
          amount: creditPackage.price.toNumber(),
          currency: "BRL",
          clientSecret: `pi_${transaction.id}_secret_${Date.now()}`,
          paymentMethod,
          package: {
            id: creditPackage.id,
            name: creditPackage.name,
            credits: creditPackage.credits,
            price: creditPackage.price.toNumber(),
          },
          user: {
            id: user.id,
            fullName: user.fullName,
            email: user.email,
          },
        };
        
        return reply.code(201).send(paymentIntent);
        
      } catch (error: unknown) {
        console.error("Erro ao criar intenção de pagamento:", error);
        return reply.code(500).send({
          message: "Erro interno ao criar intenção de pagamento.",
        });
      }
    },
  });

  // POST /payments/confirm - Confirmar pagamento (simulado)
  app.post<{ Body: unknown }>("/confirm", {
    schema: {
      body: {
        type: "object",
        required: ["transactionId"],
        properties: {
          transactionId: { type: "string", format: "uuid" },
          paymentMethodId: { type: "string" },
        },
      },
    },
    handler: async (request, reply) => {
      const bodySchema = z.object({
        transactionId: z.string().uuid(),
        paymentMethodId: z.string().optional(),
      });
      
      const { transactionId, paymentMethodId } = bodySchema.parse(request.body);
      
      try {
        // Buscar transação
        const transaction = await prisma.creditTransaction.findUnique({
          where: { id: transactionId },
          include: {
            user: { select: { id: true, credits: true } },
            package: { select: { id: true, name: true, credits: true, price: true } },
          },
        });
        
        if (!transaction) {
          return reply.code(404).send({ message: "Transação não encontrada." });
        }
        
        if (transaction.status !== "PENDING") {
          return reply.code(400).send({ 
            message: "Transação já foi processada.",
            currentStatus: transaction.status,
          });
        }
        
        if (transaction.type !== "PURCHASE") {
          return reply.code(400).send({ message: "Tipo de transação inválido." });
        }
        
        // Simular processamento de pagamento (sempre bem-sucedido para demo)
        const paymentSuccess = Math.random() > 0.1; // 90% de chance de sucesso
        
        if (!paymentSuccess) {
          // Pagamento falhou
          const updatedTransaction = await prisma.creditTransaction.update({
            where: { id: transactionId },
            data: { 
              status: "FAILED",
              metadata: {
                ...(transaction.metadata as any),
                paymentMethodId,
                failedAt: new Date().toISOString(),
                failureReason: "Payment method declined",
              },
            },
          });
          
          return reply.code(400).send({
            message: "Pagamento recusado.",
            transactionId: updatedTransaction.id,
            status: updatedTransaction.status,
          });
        }
        
        // Pagamento bem-sucedido - executar transação
        const result = await prisma.$transaction(async (tx) => {
          // Atualizar saldo de créditos do usuário
          const updatedUser = await tx.user.update({
            where: { id: transaction.userId },
            data: { credits: { increment: transaction.amount } },
            select: { credits: true },
          });
          
          // Atualizar status da transação
          const updatedTransaction = await tx.creditTransaction.update({
            where: { id: transactionId },
            data: {
              status: "COMPLETED",
              paymentId: `pm_${transactionId}_${Date.now()}`,
              metadata: {
                ...(transaction.metadata as any),
                paymentMethodId,
                completedAt: new Date().toISOString(),
                gatewayResponse: {
                  status: "succeeded",
                  transactionId: `txn_${Date.now()}`,
                },
              },
            },
          });
          
          return { updatedUser, updatedTransaction };
        });
        
        return {
          message: "Pagamento confirmado com sucesso!",
          transactionId: result.updatedTransaction.id,
          status: result.updatedTransaction.status,
          creditsPurchased: transaction.amount,
          newBalance: result.updatedUser.credits,
          package: {
            name: transaction.package?.name,
            credits: transaction.package?.credits,
            price: transaction.package?.price.toNumber(),
          },
        };
        
      } catch (error: unknown) {
        console.error("Erro ao confirmar pagamento:", error);
        return reply.code(500).send({
          message: "Erro interno ao confirmar pagamento.",
        });
      }
    },
  });

  // POST /payments/cancel - Cancelar pagamento
  app.post<{ Body: unknown }>("/cancel", {
    schema: {
      body: {
        type: "object",
        required: ["transactionId"],
        properties: {
          transactionId: { type: "string", format: "uuid" },
          reason: { type: "string" },
        },
      },
    },
    handler: async (request, reply) => {
      const bodySchema = z.object({
        transactionId: z.string().uuid(),
        reason: z.string().optional(),
      });
      
      const { transactionId, reason } = bodySchema.parse(request.body);
      
      try {
        const transaction = await prisma.creditTransaction.findUnique({
          where: { id: transactionId },
        });
        
        if (!transaction) {
          return reply.code(404).send({ message: "Transação não encontrada." });
        }
        
        if (transaction.status !== "PENDING") {
          return reply.code(400).send({ 
            message: "Apenas transações pendentes podem ser canceladas.",
            currentStatus: transaction.status,
          });
        }
        
        const updatedTransaction = await prisma.creditTransaction.update({
          where: { id: transactionId },
          data: {
            status: "CANCELLED",
            metadata: {
              ...(transaction.metadata as any),
              cancelledAt: new Date().toISOString(),
              cancellationReason: reason || "User cancelled",
            },
          },
        });
        
        return {
          message: "Pagamento cancelado com sucesso.",
          transactionId: updatedTransaction.id,
          status: updatedTransaction.status,
        };
        
      } catch (error: unknown) {
        console.error("Erro ao cancelar pagamento:", error);
        return reply.code(500).send({
          message: "Erro interno ao cancelar pagamento.",
        });
      }
    },
  });

  // GET /payments/:userId/history - Histórico de pagamentos do usuário
  app.get<{ Params: { userId: string }; Querystring: unknown }>("/:userId/history", {
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
        },
      },
    },
    handler: async (request) => {
      const paramsSchema = z.object({ userId: z.string().uuid() });
      const querySchema = z.object({
        page: z.coerce.number().int().min(1).default(1),
        perPage: z.coerce.number().int().min(1).max(100).default(20),
      });
      
      const { userId } = paramsSchema.parse(request.params);
      const { page, perPage } = querySchema.parse(request.query);
      
      const where = {
        userId,
        type: "PURCHASE" as const,
      };
      
      const [total, transactions] = await Promise.all([
        prisma.creditTransaction.count({ where }),
        prisma.creditTransaction.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * perPage,
          take: perPage,
          select: {
            id: true,
            status: true,
            amount: true,
            price: true,
            createdAt: true,
            updatedAt: true,
            package: {
              select: { name: true, credits: true },
            },
            metadata: true,
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

  // POST /payments/webhook - Webhook para receber notificações de pagamento (simulado)
  app.post<{ Body: unknown }>("/webhook", {
    handler: async (request, reply) => {
      const bodySchema = z.object({
        type: z.string(),
        data: z.object({
          id: z.string(),
          status: z.string(),
          metadata: z.object({
            transactionId: z.string().uuid(),
          }).optional(),
        }),
      });
      
      try {
        const { type, data } = bodySchema.parse(request.body);
        
        // Simular processamento de webhook
        console.log(`Webhook recebido: ${type}`, data);
        
        if (type === "payment_intent.succeeded" && data.metadata?.transactionId) {
          // Aqui você processaria o pagamento real
          // Por enquanto, apenas log
          console.log(`Pagamento confirmado para transação: ${data.metadata.transactionId}`);
        }
        
        return reply.send({ received: true });
        
      } catch (error: unknown) {
        console.error("Erro ao processar webhook:", error);
        return reply.code(400).send({ message: "Webhook inválido." });
      }
    },
  });
}
