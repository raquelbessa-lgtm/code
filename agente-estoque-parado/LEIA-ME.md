# Agente de Estoque Parado: código e testes

- `v12-original/`: a versão 12 do Will, como estava no GoDeploy em 15/10 às 17:05. Não editar; serve de base e de rollback.
- `app/`: a v12 com a melhoria do B2B (cartão de ação por cliente, mensagens prontas, contato ao vivo). É o que deve ser publicado.
- `b2b-acoes.patch`: só a diferença entre `v12-original/` e `app/` (para aplicar em cima de uma versão mais nova, se o Will já tiver mudado de novo).
- `app-v2-influencia/`, `app-v2-original/`, `testes-v2/`: o trabalho anterior (Influência "Postou e vendeu? Ganhou!"), feito sobre a v2. Ainda NÃO foi portado para a v12.
- `testes/`: `bun run teste_b2b.ts` (dados reais da Torre; o Tiny do contato é falso) e `bun run servidor_local.ts` (sobe o app em http://localhost:8799 para ver a tela).

ANTES DE PUBLICAR: o app é editado por mais de uma pessoa. Confira a versão no GoDeploy (`getApp`): se não for a 12, baixe a nova e aplique o patch em cima, em vez de enviar `app/` inteiro, senão o trabalho do outro é apagado.
Publicar = `updateApp` com TODOS os arquivos de `app/` (src/worker.ts, agente.ts, contatos.ts, data.ts, reais.ts e index.html como asset).
