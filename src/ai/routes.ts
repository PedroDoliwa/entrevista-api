// src/ai/routes.ts
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Inicializa o cliente do Google AI com a chave da API
if (!process.env.GEMINI_API_KEY) {
  throw new Error("A chave da API do Gemini (GEMINI_API_KEY) não está definida.");
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Função refatorada para usar a biblioteca oficial
async function callGeminiAPI(prompt: string) {
  try {
    // Seleciona o modelo
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    
    // Gera o conteúdo
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();
    
    if (!text) {
      throw new Error("Resposta da IA inválida ou vazia.");
    }
    
    return text;
  } catch (error) {
    console.error("Erro ao chamar a biblioteca do Gemini:", error);
    // Re-lança o erro para ser capturado pelo handler da rota
    throw new Error("Falha na comunicação com o serviço de IA do Google.");
  }
}

export async function aiRoutes(app: FastifyInstance): Promise<void> {
    app.post<{ Body: unknown }>("/conversation", {
        handler: async (request, reply) => {
            const bodySchema = z.object({
                jobDetails: z.object({ title: z.string(), description: z.string() }),
                history: z.array(z.object({
                    role: z.enum(['user', 'model']),
                    parts: z.array(z.object({ text: z.string() }))
                }))
            });

            try {
                const { jobDetails, history } = bodySchema.parse(request.body);
                const historyText = history.map(h => `${h.role === 'model' ? 'Recrutador' : 'Candidato'}: ${h.parts[0]?.text ?? ''}`).join('\n');

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
            } catch (error: any) {
                console.error("Erro na rota /ai/conversation:", error);
                return reply.code(500).send({ message: error.message || "Erro de comunicação com o serviço de IA." });
            }
        }
    });

    // As outras rotas permanecem iguais...
    app.post<{ Body: unknown }>("/feedback", {
      handler: async (request, reply) => {
          // (O código desta rota permanece o mesmo que já corrigimos antes)
          const bodySchema = z.object({
              jobDetails: z.object({
                  title: z.string(),
                  description: z.string(),
                  user_id: z.string().uuid(),
                  duracao_entrevista: z.number().int().min(1),
                  tipo_de_entrevista: z.enum(["TEXT", "VOICE", "AVATAR"]),
              }),
              history: z.array(z.object({
                  role: z.enum(['user', 'model']),
                  parts: z.array(z.object({ text: z.string() }))
              }))
          });

          try {
              const { jobDetails, history } = bodySchema.parse(request.body);
              const conversationText = history.map(h => `${h.role === 'model' ? 'Recrutador' : 'Candidato'}: ${h.parts[0]?.text ?? ''}`).join('\n');

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
              const feedback = JSON.parse(feedbackJsonString.replace(/```json|```/g, '').trim());

              const strengthsAsString = Array.isArray(feedback.strengths) ? feedback.strengths.join('; ') : feedback.strengths;
              const weaknessesAsString = Array.isArray(feedback.weaknesses) ? feedback.weaknesses.join('; ') : feedback.weaknesses;
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

          } catch (error: any) {
              console.error("Erro ao gerar ou guardar feedback:", error);
              return reply.code(500).send({ message: error.message || "Erro ao processar feedback com a IA." });
          }
      }
  });
}