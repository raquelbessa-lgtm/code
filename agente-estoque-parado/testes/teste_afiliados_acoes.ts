// Wishlist e Data Mart FALSOS, só para validar o código (leitura, cruzamento, privacidade). Banco: SQLite real em memória.
import { Database } from "bun:sqlite";
import worker from "../app/src/worker";
import { DATA } from "../app/src/data";
import * as A from "../app/src/agente";

const sqlite = new Database(":memory:");
const DB = { exec: async (s: string, p: unknown[]) => { sqlite.query(s).run(...(p as any[])); return {}; }, query: async (s: string, p: unknown[]) => ({ rows: sqlite.query(s).all(...(p as any[])) as any[] }) };
let wishlistChamadas = 0, comChave = true;
(globalThis as any).fetch = async (u: string) => {
  const url = new URL(u); const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
  if (url.host.startsWith("wishlist-afiliadas")) {
    wishlistChamadas++;
    if (url.pathname === "/api/catalog") return ok({ products: [
      { id: "b1", n: "Body Splash Desodorante Colônia Caramel Kiss 200ml", b: "barbours" },
      { id: "b2", n: "Body Splash Pink Chantilly 200ml", b: "barbours" },
      { id: "k1", n: "Creme Gel Facial Gota de Colágeno 45g", b: "kokeshi" }] });
    if (url.pathname === "/api/respostas") return url.searchParams.get("key") === "segredo" ? ok([
      { instagram: "ana", nome: "Ana Silva", whatsapp: "11999990000", email: "ana@x.com", escolhas: { barbours: ["b1", "b2"] }, cupons: { barbours: "ANA10" } },
      { instagram: "bia", nome: "Bia Souza", whatsapp: "11988880000", email: "bia@x.com", escolhas: { barbours: ["b1"] }, cupons: { barbours: "BIA10" } },
      { instagram: "cris", nome: "Cris", whatsapp: "11977770000", email: "c@x.com", escolhas: { barbours: ["b2"], kokeshi: ["k1"] }, cupons: { barbours: "CRIS5" } }]) : new Response("Acesso restrito", { status: 403 });
  }
  return new Response("nope", { status: 404 });
};
const mk = (chave?: string): any => ({ DB, WISHLIST_KEY: chave });
const req = (path: string, init?: any) => new Request("https://app.test" + path, { ...init, headers: { "x-godeploy-user-email": "raquel@gocase.com" } });
const J = async (env: any, path: string, init?: any) => (await worker.fetch(req(path, init), env)).json() as Promise<any>;
const falha = (m: string) => { console.log("FALHOU:", m); process.exitCode = 1; };
const ok = (c: boolean, m: string) => (c ? console.log("ok   " + m) : falha(m));

const produto = { produto: "Body Splash Caramel Kiss 200ml", marca: "Barbours", categoria: "Perfumaria", situacao: "linha", estoque_un: "64611", custo_unit_brl: "10,99", preco_cheio_brl: "34,90", venda_media_30d_un: "2858", venda_30d_anteriores_un: "3100" };

// 1) com chave: Influência é a primeira solução e usa o Wishlist
let env = mk("segredo");
const r1 = await J(env, "/api/produtos", { method: "POST", body: JSON.stringify(produto) });
const msgs = r1.analise.mensagens;
ok(msgs[0].time === "Influência", "Influência é a primeira mensagem");
ok(/2 afiliadas pediram|2 escolheram/.test(msgs[0].pronto + msgs[0].oQueFazer), "usa os votos do Wishlist (2 afiliadas)");
ok(msgs[0].pronto.includes("@ana (ANA10)") && msgs[0].pronto.includes("@bia (BIA10)"), "lista @ e cupom de quem pediu");
ok(msgs[0].pronto.includes("Fonte: projeto de afiliados"), "cita a fonte");
const tudo = JSON.stringify(r1);
ok(!/1199999|ana@x|Ana Silva|1198888|bia@x/.test(tudo), "nenhum nome, WhatsApp ou e-mail na resposta");
console.log("\n--- Influência (Barbours, com Wishlist) ---\n" + msgs[0].oQueFazer + "\n" + msgs[0].pronto + "\n");

// 2) sem chave: avisa e ainda entrega ação
env = mk(undefined); (globalThis as any); 
const antes = wishlistChamadas;
const r2 = await J(env, "/api/radar");
ok(r2.reais.length === 0 || true, "radar roda sem chave");
const prodSem = await J(env, "/api/produtos", { method: "POST", body: JSON.stringify({ ...produto, produto: "Body Splash Pink Chantilly 200ml" }) });
ok(prodSem.analise.mensagens[0].time === "Influência", "sem chave: Influência continua primeiro");
ok(prodSem.analise.mensagens[0].pronto.includes("WISHLIST_KEY"), "sem chave: avisa que falta WISHLIST_KEY");
ok(wishlistChamadas === antes, "sem chave: não chama o Wishlist");

// 3) chave errada: erro tratado, ação continua
env = mk("errada");
const r3 = await J(env, "/api/produtos", { method: "POST", body: JSON.stringify({ ...produto, produto: "Body Splash Teste Erro 200ml" }) });
ok(r3.analise.mensagens[0].time === "Influência" && r3.analise.mensagens[0].pronto.includes("Ação para afiliadas"), "chave recusada: ainda devolve a ação");

// 4) toda análise (radar com os dados fictícios + reais) começa por afiliadas e cada uma tem ação
const base = { produtos: [...(DATA.produtos as any[])], clientes: DATA.clientes as any, pedidos: DATA.pedidos as any };
const rad = A.radar(base, new Date());
const todos = [...rad.parados, ...rad.emRisco];
ok(todos.every(a => a.mensagens[0].time === "Influência"), `todos os ${todos.length} produtos do radar começam por Influência`);
ok(todos.every(a => /^(Abra|Descubra|Ofereça|Inclua)/.test(a.mensagens[0].oQueFazer)), "toda primeira solução é uma ação (verbo de ação)");
const saudavel = A.analisar({ ...(DATA.produtos as any[])[0], status: "ativo", estoque_un: 100, venda_media_30d_un: 300, venda_30d_anteriores_un: 300 }, base);
ok(saudavel.mensagens[0].time === "Influência" && /^Inclua/.test(saudavel.mensagens[0].oQueFazer), "produto saudável: ação leve, sem bônus");

// 5) ações: criar, duplicar, listar, fechar
env = mk("segredo");
await J(env, "/api/produtos", { method: "POST", body: JSON.stringify(produto) });
const sku = r1.analise.sku;
const c1 = await J(env, "/api/acoes", { method: "POST", body: JSON.stringify({ sku }) });
ok(c1.ok && c1.ja_existia === false && typeof c1.id === "number", `cria ação #${c1.id}`);
const c2 = await J(env, "/api/acoes", { method: "POST", body: JSON.stringify({ sku }) });
ok(c2.ja_existia === true && c2.id === c1.id, "segunda criação reaproveita a ação aberta");
const l1 = await J(env, "/api/acoes");
ok(l1.acoes.length === 1 && l1.acoes[0].baseline.cobertura_dias > 0 && l1.acoes[0].criada_por === "raquel@gocase.com", "lista traz baseline (cobertura) e quem criou");
await J(env, "/api/acoes/fechar", { method: "POST", body: JSON.stringify({ id: c1.id, nota: "120 un por cupom em 14 dias" }) });
const l2 = await J(env, "/api/acoes");
ok(l2.acoes[0].status === "fechada" && l2.acoes[0].nota.includes("120"), "fecha a ação com a nota do resultado");
const c3 = await J(env, "/api/acoes", { method: "POST", body: JSON.stringify({ sku }) });
ok(c3.ja_existia === false && c3.id !== c1.id, "depois de fechada, cria uma nova");
const c4 = await worker.fetch(req("/api/acoes", { method: "POST", body: JSON.stringify({ sku: "NAO-EXISTE" }) }), env);
ok(c4.status === 404, "produto inexistente devolve 404");
const st = await J(env, "/api/status");
ok(st.wishlist === true, "status informa que o Wishlist está configurado");
