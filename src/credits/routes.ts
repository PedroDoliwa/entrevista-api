import { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "../../generated/prisma";
import { prisma } from "../lib/prisma";

// Função para calcular o custo de créditos baseado no tipo de entrevista
function getCreditsCost(interviewType: string, durationMinutes: number): number {
  const baseCosts = {
    TEXT: 1,
    VOICE: 2,
    AVATAR: 3
  };
  
  const baseCost = baseCosts[interviewType as keyof typeof baseCosts] || 1;
  
  // Adiciona custo extra para entrevistas mais longas
  if (durationMinutes > 30) {
    return baseCost * 2;
  }
  
  return baseCost;
}

export async function creditsRoutes(app: FastifyInstance): Promise<void> {
  
  // GET /credits - Obter saldo de créditos do usuário
  app.get<{ Params: { userId: string } }>("/:userId", {
    schema: {
      params: {
        type: "object",
        required: ["userId"],
        properties: {
          userId: { type: "string", format: "uuid" },
        },
      },
    },
    handler: async (request, reply) => {
      const paramsSchema = z.object({ userId: z.string().uuid() });
      const { userId } = paramsSchema.parse(request.params);
      
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { 
          id: true, 
          fullName: true, 
          email: true, 
          credits: true,
          createdAt: true
        },
      });
      
      if (!user) {
        return reply.code(404).send({ message: "Usuário não encontrado." });
      }
      
      return {
        userId: user.id,
        fullName: user.fullName,
        email: user.email,
        credits: user.credits,
        memberSince: user.createdAt
      };
    },
  });

  // GET /credits/packages - Listar pacotes de créditos disponíveis
  app.get("/packages", {
    handler: async (request) => {
      const packages = await prisma.creditPackage.findMany({
        where: { isActive: true },
        orderBy: { price: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          credits: true,
          price: true,
        },
      });
      
      return { packages };
    },
  });

  // POST /credits/packages - Criar novo pacote de créditos (admin)
  app.post<{ Body: unknown }>("/packages", {
    schema: {
      body: {
        type: "object",
        required: ["name", "credits", "price"],
        properties: {
          name: { type: "string", minLength: 1 },
          description: { type: "string" },
          credits: { type: "integer", minimum: 1 },
          price: { type: "number", minimum: 0 },
        },
      },
    },
    handler: async (request, reply) => {
      const bodySchema = z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        credits: z.number().int().min(1),
        price: z.number().min(0),
      });
      
      const { name, description, credits, price } = bodySchema.parse(request.body);
      
      const creditPackage = await prisma.creditPackage.create({
        data: {
          name,
          description: description || null,
          credits,
          price: new Prisma.Decimal(price),
        },
      });
      
      return reply.code(201).send(creditPackage);
    },
  });

  // POST /credits/calculate-cost - Calcular custo de uma entrevista
  app.post<{ Body: unknown }>("/calculate-cost", {
    schema: {
      body: {
        type: "object",
        required: ["interviewType", "durationMinutes"],
        properties: {
          interviewType: { type: "string", enum: ["TEXT", "VOICE", "AVATAR"] },
          durationMinutes: { type: "integer", minimum: 1 },
        },
      },
    },
    handler: async (request) => {
      const bodySchema = z.object({
        interviewType: z.enum(["TEXT", "VOICE", "AVATAR"]),
        durationMinutes: z.number().int().min(1),
      });
      
      const { interviewType, durationMinutes } = bodySchema.parse(request.body);
      const cost = getCreditsCost(interviewType, durationMinutes);
      
      return {
        interviewType,
        durationMinutes,
        creditsCost: cost,
      };
    },
  });

  // POST /credits/consume - Consumir créditos para uma entrevista
  app.post<{ Body: unknown }>("/consume", {
    schema: {
      body: {
        type: "object",
        required: ["userId", "jobId", "interviewType", "durationMinutes"],
        properties: {
          userId: { type: "string", format: "uuid" },
          jobId: { type: "string", format: "uuid" },
          interviewType: { type: "string", enum: ["TEXT", "VOICE", "AVATAR"] },
          durationMinutes: { type: "integer", minimum: 1 },
        },
      },
    },
    handler: async (request, reply) => {
      const bodySchema = z.object({
        userId: z.string().uuid(),
        jobId: z.string().uuid(),
        interviewType: z.enum(["TEXT", "VOICE", "AVATAR"]),
        durationMinutes: z.number().int().min(1),
      });
      
      const { userId, jobId, interviewType, durationMinutes } = bodySchema.parse(request.body);
      const creditsCost = getCreditsCost(interviewType, durationMinutes);
      
      try {
        // Verificar se o usuário tem créditos suficientes
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { credits: true },
        });
        
        if (!user) {
          return reply.code(404).send({ message: "Usuário não encontrado." });
        }
        
        if (user.credits < creditsCost) {
          return reply.code(400).send({
            message: "Créditos insuficientes.",
            required: creditsCost,
            available: user.credits,
          });
        }
        
        // Executar transação para consumir créditos
        const result = await prisma.$transaction(async (tx) => {
          // Atualizar saldo de créditos do usuário
          const updatedUser = await tx.user.update({
            where: { id: userId },
            data: { credits: { decrement: creditsCost } },
            select: { credits: true },
          });
          
          // Criar transação de consumo
          const transaction = await tx.creditTransaction.create({
            data: {
              type: "CONSUMPTION",
              status: "COMPLETED",
              amount: -creditsCost, // Negativo para consumo
              userId,
              jobId,
            },
          });
          
          return { updatedUser, transaction };
        });
        
        return {
          message: "Créditos consumidos com sucesso.",
          transactionId: result.transaction.id,
          creditsUsed: creditsCost,
          remainingCredits: result.updatedUser.credits,
        };
        
      } catch (error: unknown) {
        console.error("Erro ao consumir créditos:", error);
        return reply.code(500).send({
          message: "Erro interno ao consumir créditos.",
        });
      }
    },
  });

  // GET /credits/:userId/transactions - Histórico de transações do usuário
  app.get<{ Params: { userId: string }; Querystring: unknown }>("/:userId/transactions", {
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
          type: { type: "string", enum: ["PURCHASE", "CONSUMPTION", "REFUND", "BONUS"] },
        },
      },
    },
    handler: async (request) => {
      const paramsSchema = z.object({ userId: z.string().uuid() });
      const querySchema = z.object({
        page: z.coerce.number().int().min(1).default(1),
        perPage: z.coerce.number().int().min(1).max(100).default(20),
        type: z.enum(["PURCHASE", "CONSUMPTION", "REFUND", "BONUS"]).optional(),
      });
      
      const { userId } = paramsSchema.parse(request.params);
      const { page, perPage, type } = querySchema.parse(request.query);
      
      const where = {
        userId,
        ...(type && { type }),
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
            type: true,
            status: true,
            amount: true,
            price: true,
            createdAt: true,
            package: {
              select: { name: true, credits: true },
            },
            job: {
              select: { title: true, interviewType: true },
            },
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

  // POST /credits/:userId/add-bonus - Adicionar créditos bônus (admin)
  app.post<{ Params: { userId: string }; Body: unknown }>("/:userId/add-bonus", {
    schema: {
      params: {
        type: "object",
        required: ["userId"],
        properties: {
          userId: { type: "string", format: "uuid" },
        },
      },
      body: {
        type: "object",
        required: ["credits", "reason"],
        properties: {
          credits: { type: "integer", minimum: 1 },
          reason: { type: "string", minLength: 1 },
        },
      },
    },
    handler: async (request, reply) => {
      const paramsSchema = z.object({ userId: z.string().uuid() });
      const bodySchema = z.object({
        credits: z.number().int().min(1),
        reason: z.string().min(1),
      });
      
      const { userId } = paramsSchema.parse(request.params);
      const { credits, reason } = bodySchema.parse(request.body);
      
      try {
        const result = await prisma.$transaction(async (tx) => {
          // Atualizar saldo de créditos do usuário
          const updatedUser = await tx.user.update({
            where: { id: userId },
            data: { credits: { increment: credits } },
            select: { credits: true },
          });
          
          // Criar transação de bônus
          const transaction = await tx.creditTransaction.create({
            data: {
              type: "BONUS",
              status: "COMPLETED",
              amount: credits,
              userId,
              metadata: { reason },
            },
          });
          
          return { updatedUser, transaction };
        });
        
        return reply.code(201).send({
          message: "Créditos bônus adicionados com sucesso.",
          transactionId: result.transaction.id,
          creditsAdded: credits,
          newBalance: result.updatedUser.credits,
        });
        
      } catch (error: unknown) {
        console.error("Erro ao adicionar créditos bônus:", error);
        return reply.code(500).send({
          message: "Erro interno ao adicionar créditos bônus.",
        });
      }
    },
  });
}
