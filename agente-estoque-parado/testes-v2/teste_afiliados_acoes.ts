// Formato "Postou e vendeu? Ganhou!", mensagem às afiliadas sem estoque, meta de unidades por tier e ações registradas.
// Banco: SQLite real em memória. Produtos: os reais do Data Mart usados nos outros testes.
import { Database } from "bun:sqlite";
import worker from "../app-v2-influencia/src/worker";
import { DATA } from "../app-v2-influencia/src/data";
import * as A from "../app-v2-influencia/src/agente";

const sqlite = new Database(":memory:");
const DB = { exec: async (s: string, p: unknown[]) => { sqlite.query(s).run(...(p as any[])); return {}; }, query: async (s: string, p: unknown[]) => ({ rows: sqlite.query(s).all(...(p as any[])) as any[] }) };
const env: any = { DB };
const req = (path: string, init?: any) => new Request("https://app.test" + path, { ...init, headers: { "x-godeploy-user-email": "raquel@gocase.com" } });
const J = async (path: string, init?: any) => (await worker.fetch(req(path, init), env)).json() as Promise<any>;
const ok = (c: boolean, m: string) => { console.log((c ? "ok   " : "FALHOU: ") + m); if (!c) process.exitCode = 1; };
const hoje = new Date("2026-10-15T15:00:00Z");
const PROIBIDAS = /parad|estoque|cobertura|slow|escoamento|encalh|liquida/i;

const mk = (nome: string, est: number, custo: number, preco: number, v30: number, vAnt: number, extra: any = {}): any =>
  ({ sku: "REAL-" + nome, produto: nome, categoria: "Bolsas", status: "real", estoque_un: est, custo_unit_brl: custo, preco_cheio_brl: preco, venda_media_30d_un: v30, venda_30d_anteriores_un: vAnt, ...extra });
const base = (p: any) => ({ produtos: [p, ...(DATA.produtos as any[])], clientes: DATA.clientes as any, pedidos: DATA.pedidos as any });
const msgAfiliadas = (pronto: string) => pronto.slice(pronto.indexOf("MENSAGEM PARA AS AFILIADAS"));
const interno = (pronto: string) => pronto.slice(0, pronto.indexOf("MENSAGEM PARA AS AFILIADAS"));

const vibe = mk("Copo Vibe 470ml", 130720, 27.37, 118.2, 6352, 12905);
const tote = mk("Mini Tote", 118330, 43.05, 212.42, 16463, 16234);
const moove = mk("Bolsa Moove", 41796, 43.28, 200.94, 8136, 3698);
const holo = mk("Necessaire Holográfica", 70206, 5.76, 5.87, 3388, 1228);
const fun = mk("Mochila Fun", 9679, 74.21, 318.28, 351, 623, { situacao: "descontinuado" });

for (const p of [vibe, tote, moove, holo, fun]) {
  const a = A.analisar(p, base(p), hoje), m = a.mensagens[0];
  const texto = m.pronto, aff = msgAfiliadas(texto), int = interno(texto);
  ok(m.time === "Influência", `${p.produto}: Influência é a primeira solução`);
  ok(/^(Lance|Inclua)/.test(m.oQueFazer), `${p.produto}: é uma ação (${m.oQueFazer.slice(0, 60)}...)`);
  ok(aff.length > 40 && !PROIBIDAS.test(aff), `${p.produto}: mensagem às afiliadas existe e não cita estoque, parado nem cobertura`);
  ok(!/seeding/i.test(texto), `${p.produto}: sem seeding`);
  ok(!/convid|wishlist/i.test(texto), `${p.produto}: sem lista de convite`);
  ok(/CLUB/.test(int) && /VIP/.test(int) && /PREMIUM/.test(int), `${p.produto}: desafio para os 3 tiers`);
  ok(A.textoChat(a, m).length < 4000, `${p.produto}: cabe no Chat (${A.textoChat(a, m).length} caracteres)`);
  ok(texto.includes("Fonte: projeto de afiliados"), `${p.produto}: cita a fonte`);
}

// meta de unidades por tier: Mini Tote tem histórico (656 un / 125 afiliadas = 5), Copo Vibe não (base 3)
const ti = interno(A.analisar(tote, base(tote), hoje).mensagens[0].pronto);
ok(/CLUB: .*venda 5 un/.test(ti) && /VIP: .*venda 8 un/.test(ti) && /PREMIUM: .*venda 15 un/.test(ti), "Mini Tote: meta de venda 5 / 8 / 15 un (base real 656 un / 125 afiliadas)");
const vi = interno(A.analisar(vibe, base(vibe), hoje).mensagens[0].pronto);
ok(/CLUB: .*venda 3 un/.test(vi) && /VIP: .*venda 5 un/.test(vi) && /PREMIUM: .*venda 9 un/.test(vi), "Copo Vibe: meta de venda 3 / 5 / 9 un (sem histórico, base 3)");
ok(/de 5% para 10%/.test(msgAfiliadas(A.analisar(vibe, base(vibe), hoje).mensagens[0].pronto)), "Copo Vibe: afiliada vê 'comissão de 5% para 10%' ao vender a meta");

// comissão sempre dentro do limite pela margem
for (const a of A.radar({ produtos: DATA.produtos as any, clientes: DATA.clientes as any, pedidos: DATA.pedidos as any }, hoje).parados) {
  const t = a.mensagens[0].pronto, tot = [...t.matchAll(/para (\d+)% nas vendas/g)].map(x => +x[1]);
  const lim = t.match(/limite pela margem (\d+)%/);
  if (tot.length && lim) ok(Math.max(...tot) <= +lim[1], `${a.produto}: comissão ${Math.max(...tot)}% dentro do limite de ${lim[1]}%`);
}

// sem margem (brinde): só prêmio de postagem, sem aumento de comissão
const h = A.analisar(holo, base(holo), hoje).mensagens[0];
ok(/só com prêmio de postagem/.test(h.oQueFazer) && !/comissão aumenta|sua comissão/.test(msgAfiliadas(h.pronto)), "brinde sem margem: sem aumento de comissão na mensagem");
// saudável: ação leve na comissão normal
const s = A.analisar(moove, base(moove), hoje).mensagens[0];
ok(/^Inclua/.test(s.oQueFazer) && /comissão normal/.test(s.oQueFazer), "produto saudável: entra no próximo desafio na comissão normal");

console.log("\n--- Copo Vibe: Influência completa ---\n" + A.analisar(vibe, base(vibe), hoje).mensagens[0].oQueFazer + "\n" + A.analisar(vibe, base(vibe), hoje).mensagens[0].pronto + "\n");

// ações registradas (SQLite real)
await J("/api/produtos", { method: "POST", body: JSON.stringify({ produto: "Copo Vibe 470ml", marca: "Gocase", categoria: "Copos e garrafas", situacao: "linha", estoque_un: "130720", custo_unit_brl: "27,37", preco_cheio_brl: "118,20", venda_media_30d_un: "6352", venda_30d_anteriores_un: "12905" }) });
const sku = "REAL-COPO-VIBE-470ML";
const c1 = await J("/api/acoes", { method: "POST", body: JSON.stringify({ sku }) });
ok(c1.ok && c1.ja_existia === false && typeof c1.id === "number", `cria ação #${c1.id}`);
const c2 = await J("/api/acoes", { method: "POST", body: JSON.stringify({ sku }) });
ok(c2.ja_existia === true && c2.id === c1.id, "segunda criação reaproveita a ação aberta");
const l1 = await J("/api/acoes");
ok(l1.acoes.length === 1 && l1.acoes[0].baseline.cobertura_dias > 0 && l1.acoes[0].baseline.fonte.includes("InfluHub"), "lista traz a cobertura de partida e a fonte");
await J("/api/acoes/fechar", { method: "POST", body: JSON.stringify({ id: c1.id, nota: "120 un por cupom em 14 dias" }) });
ok((await J("/api/acoes")).acoes[0].status === "fechada", "fecha a ação com o resultado medido");
ok((await J("/api/acoes", { method: "POST", body: JSON.stringify({ sku }) })).ja_existia === false, "depois de fechada, cria uma nova");
ok((await worker.fetch(req("/api/acoes", { method: "POST", body: JSON.stringify({ sku: "NAO-EXISTE" }) }), env)).status === 404, "produto inexistente devolve 404");
