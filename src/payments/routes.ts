import { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "../../generated/prisma";
import { prisma } from "../lib/prisma";
import { stripe, STRIPE_CURRENCY, STRIPE_WEBHOOK_SECRET } from "../lib/stripe";
import Stripe from "stripe";

export async function paymentsRoutes(app: FastifyInstance): Promise<void> {
  
  // POST /payments/create-intent - Criar Payment Intent do Stripe usando produtos
  app.post<{ Body: unknown }>("/create-intent", {
    schema: {
      body: {
        type: "object",
        required: ["userId", "priceId"],
        properties: {
          userId: { type: "string", format: "uuid" },
          priceId: { type: "string" }, // ID do preço do Stripe
        },
      },
    },
    handler: async (request, reply) => {
      const bodySchema = z.object({
        userId: z.string().uuid(),
        priceId: z.string(),
      });
      
      const { userId, priceId } = bodySchema.parse(request.body);
      
      try {
        // Verificar se o usuário existe
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, fullName: true, email: true },
        });
        
        if (!user) {
          return reply.code(404).send({ message: "Usuário não encontrado." });
        }
        
        // Buscar informações do preço no Stripe
        const stripePrice = await stripe.prices.retrieve(priceId);
        
        if (!stripePrice.active) {
          return reply.code(400).send({ message: "Preço não está ativo." });
        }
        
        // Buscar informações do produto no Stripe
        const stripeProduct = await stripe.products.retrieve(stripePrice.product as string);
        
        if (!stripeProduct.active) {
          return reply.code(400).send({ message: "Produto não está ativo." });
        }
        
        // Determinar quantidade de créditos baseado no produto/preço
        // Você pode mapear isso de diferentes formas:
        // 1. Usar metadata do produto Stripe
        // 2. Usar um mapeamento fixo baseado no priceId
        // 3. Usar o nome/descrição do produto
        
        let creditsAmount = 0;
        
        // Método 1: Usar metadata do produto Stripe
        if (stripeProduct.metadata.credits) {
          creditsAmount = parseInt(stripeProduct.metadata.credits);
        }
        // Método 2: Mapeamento baseado no priceId (fallback)
        else {
          // Mapeamento de preços - ajuste conforme seus preços
          const priceMapping: Record<string, number> = {
            // Preços reais do Stripe
            'price_1SLDj8HVh8rgC6cSrwxsHLhw': 10,  // R$ 10,00 = 10 créditos
            // Adicione outros preços conforme necessário
            'price_1234567890': 10,  // Exemplo: R$ 10,00 = 10 créditos
            'price_0987654321': 50,  // Exemplo: R$ 50,00 = 50 créditos
            'price_1122334455': 100, // Exemplo: R$ 100,00 = 100 créditos
          };
          
          creditsAmount = priceMapping[priceId] || 0;
        }
        
        if (creditsAmount === 0) {
          return reply.code(400).send({ 
            message: "Não foi possível determinar a quantidade de créditos para este preço.",
            suggestion: "Configure metadata.credits no produto Stripe ou ajuste o mapeamento de preços."
          });
        }
        
        // Criar transação pendente no banco
        const transaction = await prisma.creditTransaction.create({
          data: {
            type: "PURCHASE",
            status: "PENDING",
            amount: creditsAmount,
            price: stripePrice.unit_amount! / 100, // Converter de centavos para reais
            userId,
            metadata: {
              stripeProductId: stripeProduct.id,
              stripePriceId: priceId,
              productName: stripeProduct.name,
              createdAt: new Date().toISOString(),
            },
          },
        });
        
        // Criar Payment Intent no Stripe
        const paymentIntent = await stripe.paymentIntents.create({
          amount: stripePrice.unit_amount!,
          currency: stripePrice.currency,
          payment_method_types: ['card'], // Especificar métodos de pagamento
          metadata: {
            transactionId: transaction.id,
            userId: userId,
            stripeProductId: stripeProduct.id,
            stripePriceId: priceId,
            credits: creditsAmount.toString(),
          },
          description: `Compra de ${creditsAmount} créditos - ${stripeProduct.name}`,
          receipt_email: user.email,
        });
        
        // Atualizar transação com o ID do Stripe
        await prisma.creditTransaction.update({
          where: { id: transaction.id },
          data: {
            paymentId: paymentIntent.id,
            metadata: {
              ...(transaction.metadata as any),
              stripePaymentIntentId: paymentIntent.id,
              stripeClientSecret: paymentIntent.client_secret,
            },
          },
        });
        
        return reply.code(201).send({
          id: transaction.id,
          status: paymentIntent.status,
          amount: stripePrice.unit_amount! / 100,
          currency: stripePrice.currency.toUpperCase(),
          clientSecret: paymentIntent.client_secret,
          product: {
            id: stripeProduct.id,
            name: stripeProduct.name,
            description: stripeProduct.description,
            credits: creditsAmount,
            price: stripePrice.unit_amount! / 100,
          },
          user: {
            id: user.id,
            fullName: user.fullName,
            email: user.email,
          },
        });
        
      } catch (error: unknown) {
        console.error("Erro ao criar Payment Intent:", error);
        
        // Log mais detalhado do erro
        if (error instanceof Error) {
          console.error("Erro detalhado:", {
            message: error.message,
            stack: error.stack,
            name: error.name
          });
        }
        
        return reply.code(500).send({
          message: "Erro interno ao criar intenção de pagamento.",
          error: error instanceof Error ? error.message : 'Erro desconhecido'
        });
      }
    },
  });

  // POST /payments/confirm - Confirmar pagamento (agora usando Stripe)
  app.post<{ Body: unknown }>("/confirm", {
    schema: {
      body: {
        type: "object",
        required: ["paymentIntentId"],
        properties: {
          paymentIntentId: { type: "string" },
        },
      },
    },
    handler: async (request, reply) => {
      const bodySchema = z.object({
        paymentIntentId: z.string(),
      });
      
      const { paymentIntentId } = bodySchema.parse(request.body);
      
      try {
        // Buscar Payment Intent no Stripe
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        
        if (!paymentIntent.metadata.transactionId) {
          return reply.code(400).send({ message: "Transação não encontrada no Stripe." });
        }
        
        // Buscar transação no banco
        const transaction = await prisma.creditTransaction.findUnique({
          where: { id: paymentIntent.metadata.transactionId },
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
        
        // Verificar status do pagamento no Stripe
        if (paymentIntent.status === "succeeded") {
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
              where: { id: transaction.id },
              data: {
                status: "COMPLETED",
                metadata: {
                  ...(transaction.metadata as any),
                  completedAt: new Date().toISOString(),
                  stripePaymentIntentId: paymentIntent.id,
                  stripeStatus: paymentIntent.status,
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
        } else if (paymentIntent.status === "requires_payment_method" || 
                   paymentIntent.status === "requires_confirmation") {
          return reply.code(400).send({
            message: "Pagamento ainda não foi processado.",
            status: paymentIntent.status,
            clientSecret: paymentIntent.client_secret,
          });
        } else {
          // Pagamento falhou
          const updatedTransaction = await prisma.creditTransaction.update({
            where: { id: transaction.id },
            data: { 
              status: "FAILED",
              metadata: {
                ...(transaction.metadata as any),
                failedAt: new Date().toISOString(),
                stripePaymentIntentId: paymentIntent.id,
                stripeStatus: paymentIntent.status,
                failureReason: paymentIntent.last_payment_error?.message || "Payment failed",
              },
            },
          });
          
          return reply.code(400).send({
            message: "Pagamento falhou.",
            transactionId: updatedTransaction.id,
            status: updatedTransaction.status,
            stripeStatus: paymentIntent.status,
          });
        }
        
      } catch (error: unknown) {
        console.error("Erro ao confirmar pagamento:", error);
        return reply.code(500).send({
          message: "Erro interno ao confirmar pagamento.",
        });
      }
    },
  });

  // GET /payments/test - Teste simples de configuração
  app.get<{ Querystring: unknown }>("/test", {
    handler: async (request, reply) => {
      try {
        return {
          stripeConfigured: !!process.env.STRIPE_SECRET_KEY,
          stripeSecretKey: process.env.STRIPE_SECRET_KEY ? 'Configurado' : 'Não configurado',
          stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY ? 'Configurado' : 'Não configurado',
          stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ? 'Configurado' : 'Não configurado',
          stripeCurrency: process.env.STRIPE_CURRENCY || 'BRL',
        };
      } catch (error: unknown) {
        console.error("Erro no teste:", error);
        return reply.code(500).send({
          message: "Erro interno no teste.",
        });
      }
    },
  });

  // GET /payments/products - Listar produtos e preços disponíveis
  app.get<{ Querystring: unknown }>("/products", {
    schema: {
      querystring: {
        type: "object",
        properties: {
          productId: { type: "string" },
        },
      },
    },
    handler: async (request, reply) => {
      const querySchema = z.object({
        productId: z.string().optional(),
      });
      
      const { productId } = querySchema.parse(request.query);
      
      try {
        let products: Stripe.Product[] = [];
        
        if (productId) {
          // Buscar produto específico
          const product = await stripe.products.retrieve(productId);
          products = [product];
        } else {
          // Listar todos os produtos ativos
          const productsList = await stripe.products.list({
            active: true,
            limit: 100,
          });
          products = productsList.data;
        }
        
        const productsWithPrices = await Promise.all(
          products.map(async (product) => {
            // Buscar preços do produto
            const prices = await stripe.prices.list({
              product: product.id,
              active: true,
            });
            
            return {
              id: product.id,
              name: product.name,
              description: product.description,
              active: product.active,
              metadata: product.metadata,
              prices: prices.data.map(price => ({
                id: price.id,
                amount: price.unit_amount! / 100,
                currency: price.currency.toUpperCase(),
                type: price.type,
                recurring: price.recurring ? {
                  interval: price.recurring.interval,
                  intervalCount: price.recurring.interval_count,
                } : null,
                nickname: price.nickname,
                active: price.active,
              })),
            };
          })
        );
        
        return {
          products: productsWithPrices,
          total: productsWithPrices.length,
        };
        
      } catch (error: unknown) {
        console.error("Erro ao listar produtos:", error);
        return reply.code(500).send({
          message: "Erro interno ao listar produtos.",
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

  // POST /payments/webhook - Webhook do Stripe
  app.post<{ Body: unknown }>("/webhook", {
    config: {
      rawBody: true, // Necessário para verificar a assinatura do webhook
    },
    handler: async (request, reply) => {
      const sig = request.headers['stripe-signature'] as string;
      
      if (!STRIPE_WEBHOOK_SECRET) {
        console.error("STRIPE_WEBHOOK_SECRET não está definida");
        return reply.code(500).send({ message: "Webhook secret não configurado" });
      }
      
      let event: Stripe.Event;
      
      try {
        // Verificar a assinatura do webhook
        event = stripe.webhooks.constructEvent(
          request.body as Buffer,
          sig,
          STRIPE_WEBHOOK_SECRET
        );
      } catch (err) {
        console.error("Erro na verificação do webhook:", err);
        return reply.code(400).send({ message: "Webhook signature verification failed" });
      }
      
      try {
        // Processar diferentes tipos de eventos
        switch (event.type) {
          case 'payment_intent.succeeded':
            await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
            break;
            
          case 'payment_intent.payment_failed':
            await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
            break;
            
          default:
            console.log(`Evento não tratado: ${event.type}`);
        }
        
        return reply.send({ received: true });
        
      } catch (error) {
        console.error("Erro ao processar webhook:", error);
        return reply.code(500).send({ message: "Erro ao processar webhook" });
      }
    },
  });

  // Função para processar pagamento bem-sucedido
  async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
    const transactionId = paymentIntent.metadata.transactionId;
    
    if (!transactionId) {
      console.error("TransactionId não encontrado no PaymentIntent:", paymentIntent.id);
      return;
    }
    
    const transaction = await prisma.creditTransaction.findUnique({
      where: { id: transactionId },
      include: { user: true },
    });
    
    if (!transaction) {
      console.error("Transação não encontrada:", transactionId);
      return;
    }
    
    if (transaction.status !== "PENDING") {
      console.log("Transação já processada:", transactionId);
      return;
    }
    
    // Executar transação para adicionar créditos
    await prisma.$transaction(async (tx) => {
      // Atualizar saldo de créditos
      await tx.user.update({
        where: { id: transaction.userId },
        data: { credits: { increment: transaction.amount } },
      });
      
      // Atualizar status da transação
      await tx.creditTransaction.update({
        where: { id: transactionId },
        data: {
          status: "COMPLETED",
          metadata: {
            ...(transaction.metadata as any),
            webhookProcessedAt: new Date().toISOString(),
            stripePaymentIntentId: paymentIntent.id,
            stripeStatus: paymentIntent.status,
          },
        },
      });
    });
    
    console.log(`Pagamento processado com sucesso para transação: ${transactionId}`);
  }
  
  // Função para processar pagamento falhado
  async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
    const transactionId = paymentIntent.metadata.transactionId;
    
    if (!transactionId) {
      console.error("TransactionId não encontrado no PaymentIntent:", paymentIntent.id);
      return;
    }
    
    await prisma.creditTransaction.update({
      where: { id: transactionId },
      data: {
        status: "FAILED",
        metadata: {
          webhookProcessedAt: new Date().toISOString(),
          stripePaymentIntentId: paymentIntent.id,
          stripeStatus: paymentIntent.status,
          failureReason: paymentIntent.last_payment_error?.message || "Payment failed",
        },
      },
    });
    
    console.log(`Pagamento falhou para transação: ${transactionId}`);
  }
}
