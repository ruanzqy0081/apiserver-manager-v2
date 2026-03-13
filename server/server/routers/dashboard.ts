import { z } from "zod";
import { getAllActivity, getDashboardStats, getExpiringKeys, getPackageById } from "../db";
import { invokeLLM } from "../_core/llm";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";

export const dashboardRouter = router({
  stats: protectedProcedure.query(({ ctx }) =>
    getDashboardStats(ctx.user.id, ctx.user.role === "admin")
  ),

  expiringKeys: protectedProcedure.query(() => getExpiringKeys(24)),

  recentActivity: adminProcedure.query(() => getAllActivity()),

  generateDocs: protectedProcedure
    .input(z.object({
      packageId: z.number(),
      docType: z.enum(["integration", "technical", "guide"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const pkg = await getPackageById(input.packageId);
      if (!pkg) return { content: "Package não encontrado." };

      const docType = input.docType ?? "technical";

      const prompts: Record<string, string> = {
        integration: `Gere um guia de integração completo para o package "${pkg.name}" (v${pkg.version}).
Token: ${pkg.token}
Descrição: ${pkg.description ?? "Não informada"}

Inclua:
1. Pré-requisitos
2. Instalação da dylib no IPA
3. Configuração do token
4. Registro de UDID
5. Ativação de Key
6. Exemplos de código Swift/Objective-C
7. Troubleshooting`,
        technical: `Gere documentação técnica completa para o package "${pkg.name}" (v${pkg.version}).
Token: ${pkg.token}
Descrição: ${pkg.description ?? "Não informada"}

Inclua:
1. Visão geral da arquitetura
2. Especificações técnicas
3. Endpoints da API
4. Estrutura de dados
5. Fluxo de autenticação
6. Referência completa de métodos
7. Exemplos avançados`,
        guide: `Gere um manual do usuário para o package "${pkg.name}" (v${pkg.version}).
Descrição: ${pkg.description ?? "Não informada"}

Inclua:
1. O que é este package
2. Como obter acesso (Key)
3. Como registrar seu dispositivo
4. Passo a passo de ativação
5. Uso diário
6. FAQ
7. Como obter suporte`,
      };

      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "Você é um especialista em documentação técnica para SDKs mobile iOS. Gere documentação profissional e clara em português brasileiro usando Markdown.",
          },
          { role: "user", content: prompts[docType] },
        ],
      });

      const content = response?.choices?.[0]?.message?.content ?? "Erro ao gerar documentação.";
      return { content };
    }),
});
