import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";

// URL da API do Gemini
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent";

async function generateAiQuestion(jobTitle: string, jobDescription: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("A chave da API do Gemini (GEMINI_API_KEY) não está definida.");
    }

    const prompt = `
        Você é um recrutador experiente conduzindo uma entrevista de emprego em português do Brasil.
        A vaga é para "${jobTitle}".
        A descrição da vaga é: "${jobDescription}".

        Faça a próxima pergunta da entrevista. A pergunta deve ser clara, direta e relevante para a vaga.
        Retorne apenas o texto da pergunta, sem nenhuma introdução ou formatação extra.
    `;

    try {
        const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
            }),
        });

        if (!response.ok) {
            console.error("Erro na resposta da API do Gemini:", await response.text());
            throw new Error("Falha ao gerar pergunta com a IA.");
        }

        const data = await response.json();
        const question = data.candidates?.[0]?.content?.parts?.[0]?.text;

        return question || "Poderia me falar um pouco mais sobre suas experiências anteriores?";
    } catch (error) {
        console.error("Erro ao chamar a API do Gemini:", error);
        throw new Error("Erro de comunicação com o serviço de IA.");
    }
}


export async function aiRoutes(app: FastifyInstance): Promise<void> {
    app.post<{ Params: { id: string } }>("/jobs/:id/generate-question", {
        handler: async (request, reply) => {
            const paramsSchema = z.object({ id: z.string().uuid() });
            const { id } = paramsSchema.parse(request.params);

            const job = await prisma.job.findUnique({ where: { id } });

            if (!job) {
                return reply.code(404).send({ message: "Vaga não encontrada." });
            }

            try {
                const question = await generateAiQuestion(job.title, job.description);
                return { question };
            } catch (error: any) {
                return reply.code(500).send({ message: error.message });
            }
        },
    });
}
