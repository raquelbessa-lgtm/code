// B2B: cartões por cliente com dados REAIS da Torre (REAIS_GOBEAUTE). O Tiny usado para contato é FALSO e serve só para
// validar a busca, a conferência do nome, os erros e o cache.
import worker from "../app/src/worker";
import { REAIS_GOBEAUTE } from "../app/src/reais";
import * as A from "../app/src/agente";
import { padraoIlike, escolherContato, limparCacheContatos, norm, contatoDaTorre } from "../app/src/contatos";
import { TORRE } from "../app/src/contatos_torre";

const ok = (c: boolean, m: string) => { console.log((c ? "ok   " : "FALHOU: ") + m); if (!c) process.exitCode = 1; };
const hoje = new Date("2026-10-15T15:00:00Z");
const base = { produtos: REAIS_GOBEAUTE as any[], clientes: [], pedidos: [] };

// 1) todos os produtos B2B reais
const todos = (REAIS_GOBEAUTE as any[]).map(p => A.analisar(p, base, hoje));
const b2b = todos.map(a => ({ a, m: a.mensagens.find(m => m.time === "B2B")! })).filter(x => x.m.acoes?.length);
const esperados = (REAIS_GOBEAUTE as any[]).filter(p => (p.recompra ?? []).some((r: any) => r.situacao === "parado" || r.situacao === "ativo")).length;
ok(b2b.length === esperados && esperados > 0, `${b2b.length} produtos reais têm clientes a abordar (esperado pelos dados: ${esperados})`);
let clientes = 0, maxChat = 0, ruins = 0;
for (const { a, m } of b2b) {
  for (const x of m.acoes!) {
    clientes++;
    const primeiro = x.vendedor.split(" ")[0];
    const bom = x.whatsapp.includes(primeiro) && x.whatsapp.includes(a.produto) && x.whatsapp.includes(String(x.validade)) && !/undefined|NaN|\[object/.test(x.whatsapp + x.emailCorpo + x.condicao + x.situacao)
      && x.quantidade > 0 && x.precoUn > 0 && x.valorPedido > 0 && x.cliente && x.vendedor && x.emailAssunto && x.emailCorpo.includes(x.cliente.split(" ")[0]);
    if (!bom) { ruins++; console.log("  ruim:", a.produto, x.cliente); }
  }
  const chat = A.textoChat(a, m).length; maxChat = Math.max(maxChat, chat);
  if (!/^(Reative|Inclua)/.test(m.oQueFazer) || !m.acoes!.some(x => m.oQueFazer.includes(x.cliente.split(" ").slice(0, 2).join(" ")))) ruins++;
}
ok(ruins === 0, `${clientes} cartões completos (mensagem com vendedor, produto e validade; sem undefined) e título com nome de cliente`);
ok(maxChat < 4096, `maior mensagem no Chat: ${maxChat} caracteres (limite ~4.096)`);
ok(b2b.every(({ m }) => m.porVendedor!.reduce((t, v) => t + v.clientes, 0) === m.acoes!.length), "porVendedor cobre todas as ações");
ok(b2b.every(({ m }) => m.executar.passos.some(p => p.startsWith("Gira:"))), "passos de execução citam cliente, quantidade e vendedor");

// exemplo legível
const ex = b2b.find(({ m }) => m.acoes!.some(x => x.tipo === "reativar") && m.acoes!.some(x => x.tipo === "incluir")) ?? b2b[0];
console.log("\n=== EXEMPLO:", ex.a.produto, "===\nO QUE FAZER: " + ex.m.oQueFazer + "\n\n" + ex.m.pronto + "\n\n--- 1 cartão (campos) ---\n" + JSON.stringify({ ...ex.m.acoes![0], emailCorpo: ex.m.acoes![0].emailCorpo.slice(0, 160) + "..." }, null, 1) + "\n\n--- Chat: " + A.textoChat(ex.a, ex.m).length + " caracteres ---\n");

// 2) contato: nomes, padrão e conferência
const comoRegex = (p: string) => new RegExp("^" + p.replace(/\*/g, ".*").replace(/_/g, ".") + "$", "i");
ok(comoRegex(padraoIlike("Dac Distribuidora De Cosmeticos Ltda")).test("DAC DISTRIBUIDORA DE COSMÉTICOS LTDA"), "padrão ilike casa o nome com acento e caixa alta do Tiny");
ok(!comoRegex(padraoIlike("Dac Distribuidora De Cosmeticos Ltda")).test("OUTRA EMPRESA QUALQUER LTDA"), "padrão ilike não casa outro nome");
const linhas = [
  { nome_cliente: "SANIELLA LTDA - ME", fone_cliente: " (12) 99999-0000 ", email_cliente: "COMPRAS@SANIELLA.COM", cpf_cnpj_cliente: "11.111.111/0001-11", data_pedido: "2026-10-01" },
  { nome_cliente: "Saniella Ltda Me", fone_cliente: "", email_cliente: "", cpf_cnpj_cliente: "11.111.111/0001-11", data_pedido: "2026-10-08" },
  { nome_cliente: "Saniella Ltda Me Filial", fone_cliente: "1", email_cliente: "x", cpf_cnpj_cliente: "22", data_pedido: "2026-10-09" },
];
const r1 = escolherContato("Saniella Ltda Me", linhas);
ok(r1.contato?.telefone === "(12) 99999-0000" && r1.contato?.email === "compras@saniella.com" && r1.contato.fonte === "Tiny, pedido de 01/10/2026", "escolhe o pedido mais recente que TEM contato, normaliza e cita a fonte");
ok(escolherContato("Saniella Ltda Me", [linhas[2]]).motivo?.includes("não encontrado"), "nome parecido não conta (só nome exato)");
ok(escolherContato("Saniella Ltda Me", [{ ...linhas[0] }, { ...linhas[0], cpf_cnpj_cliente: "99.999.999/0001-99" }]).motivo?.includes("mais de um cadastro"), "dois CNPJs com o mesmo nome: não chuta");
ok(escolherContato("Saniella Ltda Me", [linhas[1]]).motivo?.includes("sem telefone nem e-mail"), "cadastro sem contato: diz o motivo");

// 2b) contato da Torre (snapshot): cobre quase todos, filial duplicada não é chutada, e-mail compartilhado vem com aviso
const clientesTorre = new Set<string>();
for (const p of REAIS_GOBEAUTE) for (const x of A.analisar(p as any, base, hoje).mensagens.find(m => m.time === "B2B")?.acoes ?? []) clientesTorre.add(x.cliente + "|" + x.uf);
const resT = [...clientesTorre].map(k => { const [c, u] = k.split("|"); return { k, r: contatoDaTorre(c, u) }; });
ok(resT.length >= 35, `${resT.length} clientes B2B distintos nos cartões`);
const semT = resT.filter(x => !x.r);
ok(semT.length === 0, `todo cliente dos cartões está no snapshot da Torre (faltam: ${semT.map(x => x.k).join(", ") || "nenhum"})`);
const comTel = resT.filter(x => x.r?.contato?.telefone).length;
ok(comTel >= 34, `${comTel} de ${resT.length} com telefone (WhatsApp validado)`);
ok(resT.filter(x => !x.r?.contato).every(x => x.r?.motivo), "quem fica sem contato diz o motivo");
ok(resT.some(x => x.r?.motivo?.includes("cadastros (filiais)")), "rede com várias filiais: não chuta loja");
ok(resT.filter(x => x.r?.contato?.email).some(x => x.r?.contato?.aviso?.includes("compartilhada")), "e-mail repetido em clientes diferentes vem com aviso");
ok(resT.every(x => !x.r?.contato?.telefone || /^55\d{10,11}$/.test(x.r.contato.telefone)), "telefones no formato 55 + DDD + número");

// 3) endpoint com Tiny falso (sem o snapshot da Torre, para testar o caminho de fallback)
const clientesReais = ex.m.acoes!.map(x => x.cliente);
const TORRE_BKP = { ...TORRE }; for (const k of Object.keys(TORRE)) delete TORRE[k];
let modo: "ok" | "401" | "403" | "500" = "ok"; const chamadas: string[] = [];
(globalThis as any).fetch = async (u: string) => {
  chamadas.push(u); const url = new URL(u);
  if (modo === "401") return new Response("x", { status: 401 });
  if (modo === "403") return new Response("x", { status: 403 });
  if (modo === "500") return new Response("x", { status: 500 });
  const alvo = clientesReais[0], pad = url.searchParams.get("nome_cliente") ?? "";
  const tabela = url.pathname.split(".").pop();
  if (tabela === "tiny_pedidos_apice_atacado_sp" && pad.startsWith("ilike.") && padraoIlike(alvo) === decodeURIComponent(pad.slice(6)))
    return new Response(JSON.stringify([{ nome_cliente: alvo.toUpperCase().replace(/ ME$/, " - ME"), fone_cliente: "(11) 98888-7777", email_cliente: "contato@x.com", cpf_cnpj_cliente: "1", data_pedido: "2026-10-08T00:00:00-03:00" }]), { status: 200 });
  return new Response("[]", { status: 200 });
};
const env: any = { PROXY_BASE_URL: "https://proxy.test", DB: { exec: async () => ({}), query: async () => ({ rows: [] }) } };
const get = async (p: string) => { const r = await worker.fetch(new Request("https://app.test" + p, { headers: { cookie: "sid=abc" } }), env); return { status: r.status, body: await r.json() as any }; };
const sku = ex.a.sku;
const c1 = await get("/api/b2b/contatos?sku=" + sku);
ok(c1.status === 200 && c1.body.resumo.com_contato === 1 && c1.body.resumo.clientes === clientesReais.length, `endpoint: ${c1.body.resumo?.com_contato} de ${c1.body.resumo?.clientes} clientes com contato (os outros dizem o motivo)`);
ok(Object.values(c1.body.contatos as Record<string, any>).filter(r => !r.contato).every(r => r.motivo), "quem não tem contato vem com motivo");
ok(chamadas.length === clientesReais.length * 6 && chamadas.every(u => u.startsWith("https://proxy.test/datamart/api.tiny_pedidos_")), `consulta ${chamadas.length} vezes o Data Mart (6 tabelas por cliente), só leitura`);
ok(chamadas.every(u => !/%20|\s/.test(u.split("?")[0])), "caminhos de tabela sem caracteres soltos");
const n0 = chamadas.length; await get("/api/b2b/contatos?sku=" + sku);
ok(chamadas.length === n0, "segunda chamada usa o cache (sem novas consultas)");
limparCacheContatos(); modo = "403";
const c403 = await get("/api/b2b/contatos?sku=" + sku);
ok(c403.status === 200 && c403.body.resumo.com_contato === 0 && Object.values(c403.body.contatos as Record<string, any>).every(r => /permissão/.test(r.motivo)), "sem permissão no Data Mart: cada cartão diz isso, não 'cliente não encontrado'");
modo = "401"; ok(Object.values((await get("/api/b2b/contatos?sku=" + sku)).body.contatos as Record<string, any>).every(r => /login/.test(r.motivo)), "sem login: erro claro em cada cartão");
modo = "500"; const c500 = await get("/api/b2b/contatos?sku=" + sku);
ok(c500.status === 200 && c500.body.resumo.consultas_com_erro > 0 && c500.body.resumo.com_contato === 0, "Data Mart fora do ar: 200 com a contagem de falhas, sem inventar contato");
ok((await get("/api/b2b/contatos?sku=NAO-EXISTE")).status === 404, "produto inexistente: 404");
delete env.PROXY_BASE_URL; limparCacheContatos();
ok(Object.values((await get("/api/b2b/contatos?sku=" + sku)).body.contatos as Record<string, any>).every(r => /Proxy de dados/.test(r.motivo)), "sem proxy de dados configurado: erro claro em cada cartão");

// 3b) com o snapshot da Torre de volta: o endpoint responde só com a Torre, sem consultar o Data Mart
Object.assign(TORRE, TORRE_BKP); chamadas.length = 0; limparCacheContatos(); env.PROXY_BASE_URL = "https://proxy.test"; modo = "ok";
const cT = await get("/api/b2b/contatos?sku=" + sku);
ok(cT.status === 200 && cT.body.resumo.com_contato >= 1 && chamadas.length === 0, `endpoint com a Torre: ${cT.body.resumo?.com_contato} de ${cT.body.resumo?.clientes} com contato, sem consultar o Data Mart`);
delete env.PROXY_BASE_URL; ok((await get("/api/b2b/contatos?sku=" + sku)).status === 200, "com a Torre, não depende do proxy de dados");

// 4) nada mais quebrou: radar das 4 fontes
env.PROXY_BASE_URL = "https://proxy.test";
for (const f of ["gobeaute", "b2c", "real", "ficticia"]) { const r = await get("/api/radar?fonte=" + f); ok(r.status === 200 && Array.isArray(r.body.parados), `radar ${f} segue funcionando (${r.body.parados.length} parados)`); }

// 5) caso extremo: 12 clientes de um mesmo produto (todos os vendedores diferentes) continua cabendo no Chat
const grande: any = { ...(REAIS_GOBEAUTE as any[])[0], recompra: Array.from({ length: 12 }, (_, i) => ({
  cliente: `Distribuidora Exemplo Numero ${i + 1} De Cosmeticos Ltda Me`, cidade: "Sao Jose Dos Campos", uf: "SP", vendedor: `Vendedora Com Nome Longo ${i + 1} Da Silva`,
  pedidos: 12, intervalo: 20, dias_sem: 60 + i, qtd_media: 1500 + i, preco_medio: 25, situacao: i % 2 ? "ativo" : "parado", paga_boleto_prazo: true })) };
const ag = A.analisar(grande, { produtos: [grande], clientes: [], pedidos: [] }, hoje);
const mg = ag.mensagens.find(m => m.time === "B2B")!;
ok(mg.acoes!.length === 12 && A.textoChat(ag, mg).length < 4096, `12 clientes: ${A.textoChat(ag, mg).length} caracteres no Chat e os 12 cartões no app`);
ok(mg.pronto.includes("no app, com contato e e-mail pronto"), "o resumo avisa que o resto está no app");
