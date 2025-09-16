import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";

// Função para obter a chave da API do Gemini de forma segura
function getGeminiApiKey(): string {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("A chave da API do Gemini (GEMINI_API_KEY) não está definida.");
    }
    return apiKey;
}

// Função que se comunica com a API do Gemini
async function generateAiQuestion(jobTitle: string, jobDescription: string): Promise<string> {
    try {
        const apiKey = getGeminiApiKey();
        
        // CORREÇÃO AQUI: Usando o modelo 'gemini-1.5-flash-latest'
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

        const prompt = `Você é um recrutador de IA para a plataforma RecrutaAI. 
        Sua tarefa é criar uma única pergunta de entrevista relevante para um candidato à vaga de "${jobTitle}".
        A descrição da vaga é: "${jobDescription}".
        A pergunta deve ser clara, concisa e em português do Brasil. 
        Não adicione nenhuma introdução ou texto extra, apenas a pergunta.`;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
            }),
        });

        if (!response.ok) {
            const errorBody = await response.json();
            console.error("Erro na resposta da API do Gemini:", errorBody);
            throw new Error("Falha ao comunicar com a IA.");
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            throw new Error("A resposta da IA veio vazia.");
        }
        
        return text.trim();

    } catch (error) {
        console.error("Erro ao chamar a API do Gemini:", error);
        throw new Error("Falha ao gerar pergunta com a IA.");
    }
}

// Rota da nossa API
export async function aiRoutes(app: FastifyInstance): Promise<void> {
    app.post<{ Params: { jobId: string } }>("/jobs/:jobId/generate-question", {
        handler: async (request, reply) => {
            try {
                const paramsSchema = z.object({ jobId: z.string().uuid() });
                const { jobId } = paramsSchema.parse(request.params);

                const job = await prisma.job.findUnique({ where: { id: jobId } });

                if (!job) {
                    return reply.code(404).send({ message: "Vaga não encontrada." });
                }

                const question = await generateAiQuestion(job.title, job.description);
                return { question };

            } catch (error: any) {
                return reply.code(500).send({ message: error.message || "Erro de comunicação com o serviço de IA." });
            }
        },
    });
}
