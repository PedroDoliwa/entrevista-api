import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function callGeminiAPI(prompt: string, retries = 3) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY não está definida.");
  }

  // Usar gemini-2.0-flash (disponível na sua conta)
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

  for (let i = 0; i < retries; i++) {
    try {
      console.log(`🔄 Tentativa ${i + 1} de ${retries}`);
      
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json();
        console.error("❌ Erro da API:", JSON.stringify(errorBody, null, 2));
        
        if (response.status >= 500 && i < retries - 1) {
          await new Promise(res => setTimeout(res, 1000 * (i + 1)));
          continue;
        }
        
        throw new Error(`API retornou ${response.status}: ${JSON.stringify(errorBody)}`);
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!text) {
        throw new Error("Resposta vazia.");
      }

      console.log("✅ Sucesso");
      return text;
    } catch (error: unknown) {
      const err = error as Error;
      console.error(`❌ Tentativa ${i + 1}:`, err.message);
      
      if (i === retries - 1) {
        throw new Error(`Falha após ${retries} tentativas: ${err.message}`);
      }

      await new Promise(res => setTimeout(res, 1000 * (i + 1)));
    }
  }

  throw new Error("Falha ao comunicar com a IA.");
}

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: unknown }>("/conversation", {
    handler: async (request, reply) => {
      const bodySchema = z.object({
        jobDetails: z.object({ title: z.string(), description: z.string() }),
        history: z.array(
          z.object({
            role: z.enum(["user", "model"]),
            parts: z.array(z.object({ text: z.string() })),
          })
        ),
      });

      try {
        const { jobDetails, history } = bodySchema.parse(request.body);
        const historyText = history
          .map((h) => `${h.role === "model" ? "Recrutador" : "Candidato"}: ${h.parts[0]?.text ?? ""}`)
          .join("\n");

        const prompt = `
Você é um recrutador de IA a conduzir uma entrevista para a vaga de "${jobDetails.title}".
A descrição da vaga é: "${jobDetails.description}".
O histórico da conversa até agora é:
${historyText}
Com base na última resposta do candidato, faça a próxima pergunta relevante para a vaga. Seja conciso e direto.
Se o histórico estiver vazio, faça a primeira pergunta.
        `;

        const nextQuestion = await callGeminiAPI(prompt);
        return { nextQuestion };
      } catch (error: unknown) {
        const err = error as Error;
        console.error("Erro na rota /conversation:", err);
        return reply.code(500).send({ 
          message: "Erro de comunicação com o serviço de IA.",
          details: err.message 
        });
      }
    },
  });

  app.post<{ Body: unknown }>("/feedback", {
    handler: async (request, reply) => {
      const bodySchema = z.object({
        jobDetails: z.object({
          title: z.string(),
          description: z.string(),
          user_id: z.string().uuid(),
          duracao_entrevista: z.number().int().min(1),
          tipo_de_entrevista: z.enum(["TEXT", "VOICE", "AVATAR"]),
        }),
        history: z.array(
          z.object({
            role: z.enum(["user", "model"]),
            parts: z.array(z.object({ text: z.string() })),
          })
        ),
      });

      try {
        const { jobDetails, history } = bodySchema.parse(request.body);
        const conversationText = history
          .map((h) => `${h.role === "model" ? "Recrutador" : "Candidato"}: ${h.parts[0]?.text ?? ""}`)
          .join("\n");

        const prompt = `
Analise a seguinte transcrição de entrevista para a vaga de "${jobDetails.title}".
Transcrição:
${conversationText}

Com base na conversa, forneça uma avaliação do candidato em formato JSON. O JSON deve ter as seguintes chaves:
- "summary": (string) Um resumo geral do desempenho do candidato em uma frase.
- "strengths": (string) Uma lista de 2 a 3 pontos fortes, separados por ponto e vírgula.
- "weaknesses": (string) Uma lista de 2 a 3 pontos a melhorar, separados por ponto e vírgula.
- "score": (number) Uma nota de 0 a 10 para o desempenho geral.
Seja objetivo e construtivo.
        `;

        const feedbackJsonString = await callGeminiAPI(prompt);
        const feedback = JSON.parse(feedbackJsonString.replace(/```json|```/g, "").trim());

        const strengthsAsString = Array.isArray(feedback.strengths)
          ? feedback.strengths.join("; ")
          : feedback.strengths;
        const weaknessesAsString = Array.isArray(feedback.weaknesses)
          ? feedback.weaknesses.join("; ")
          : feedback.weaknesses;
        const scoreAsNumber = Math.max(0, Math.min(10, parseInt(feedback.score, 10) || 0));

        const newJob = await prisma.job.create({
          data: {
            title: jobDetails.title,
            description: jobDetails.description,
            durationMinutes: jobDetails.duracao_entrevista,
            interviewType: jobDetails.tipo_de_entrevista,
            userId: jobDetails.user_id,
            feedbackSummary: feedback.summary,
            feedbackStrengths: strengthsAsString,
            feedbackWeaknesses: weaknessesAsString,
            feedbackScore: scoreAsNumber,
          },
        });

        return newJob;
      } catch (error: unknown) {
        const err = error as Error;
        console.error("Erro ao gerar feedback:", err);
        return reply.code(500).send({ 
          message: "Erro ao processar feedback com a IA.",
          details: err.message 
        });
      }
    },
  });
}
