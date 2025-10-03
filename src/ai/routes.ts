import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function callGeminiAPI(prompt: string, retries = 3, delay = 1000) {
  if (!GEMINI_API_KEY) {
    throw new Error("A chave da API do Gemini (GEMINI_API_KEY) não está definida.");
  }
  const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;

  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(GEMINI_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json();
        console.error("Erro na resposta da API do Gemini:", errorBody);
        if (response.status >= 500 && i < retries - 1) {
          console.log(`Tentativa ${i + 1} falhou. A tentar novamente em ${delay / 1000}s...`);
          await new Promise(res => setTimeout(res, delay));
          delay *= 2;
          continue;
        }
        throw new Error(`Falha na API do Gemini com status: ${response.status}`);
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error("Resposta da IA inválida ou vazia.");
      }
      return text;
    } catch (error) {
      console.error(`Erro na tentativa ${i + 1} de chamar a API do Gemini:`, error);
      if (i < retries - 1) {
        await new Promise(res => setTimeout(res, delay));
        delay *= 2;
      } else {
        throw new Error("Falha ao gerar conteúdo com a IA após múltiplas tentativas.");
      }
    }
  }
  throw new Error("Falha ao comunicar com a IA.");
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
            } catch (error) {
                return reply.code(500).send({ message: "Erro de comunicação com o serviço de IA." });
            }
        }
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
                        // Dados da vaga
                        title: jobDetails.title,
                        description: jobDetails.description,
                        durationMinutes: jobDetails.duracao_entrevista,
                        interviewType: jobDetails.tipo_de_entrevista,
                        userId: jobDetails.user_id,
                        
                        // Dados do feedback (já tratados)
                        feedbackSummary: feedback.summary,
                        feedbackStrengths: strengthsAsString,
                        feedbackWeaknesses: weaknessesAsString,
                        feedbackScore: scoreAsNumber,
                    },
                });

                return newJob;

            } catch (error) {
                console.error("Erro ao gerar ou guardar feedback:", error);
                return reply.code(500).send({ message: "Erro ao processar feedback com a IA." });
            }
        }
    });
}