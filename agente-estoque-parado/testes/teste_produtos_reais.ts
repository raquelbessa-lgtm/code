import { DATA } from "../app/src/data";
import * as NOVO from "../app/src/agente";
import * as ANTIGO from "../app-original/src/agente";

// Dados REAIS do Data Mart (api.supply_fluxo_estoque snapshot 08/09 + api.supply_sales, janelas 09/08-07/09 e 10/07-08/08).
const REAIS = [
  ["Copo Vibe 470ml", 130720, 27.37, 118.2, 6352, 12905, 0, "linha"],
  ["Mini Tote", 118330, 43.05, 212.42, 16463, 16234, 159932, "linha"],
  ["Bolsa Moove", 41796, 43.28, 200.94, 8136, 3698, 81390, "linha"],
  ["Garrafa Fresh 650ml", 208989, 30.12, 156.1, 26026, 40114, 112874, "linha"],
  ["Tote Bag Daily", 108062, 46.14, 232.55, 17528, 38519, 0, "linha"],
  ["Mochila Fun", 9679, 74.21, 318.28, 351, 623, 33796, "descontinuado"],
  ["Guia Pet", 37753, 15.77, 47.79, 2776, 2174, 0, "descontinuado"],
  ["Necessaire Holográfica", 70206, 5.76, 5.87, 3388, 1228, 0, "linha"],
] as const;
const mk = (r: typeof REAIS[number]): any => ({ sku: "REAL-" + r[0], produto: r[0], categoria: "Bolsas", status: "real",
  estoque_un: r[1], custo_unit_brl: r[2], preco_cheio_brl: r[3], venda_media_30d_un: r[4], venda_30d_anteriores_un: r[5],
  po_pendente_un: r[6] || undefined, situacao: r[7] });
const base = (ps: any[]) => ({ produtos: [...ps, ...(DATA.produtos as any[])], clientes: DATA.clientes as any, pedidos: DATA.pedidos as any });
const hoje = new Date("2026-10-15T15:00:00Z");
const only = process.argv[2];
for (const r of REAIS) {
  if (only && !r[0].toLowerCase().includes(only)) continue;
  const p = mk(r), b = base([p]);
  const a = NOVO.analisar(p, b, hoje), o = ANTIGO.analisar(p, b, hoje);
  const inf = a.mensagens.find(m => m.time === "Influência")!, infO = o.mensagens.find(m => m.time === "Influência")!;
  const comp = a.mensagens.find(m => m.time === "Produto e Compras")!;
  console.log("=".repeat(100)); console.log(`${r[0]} | classe=${a.classe} | cobertura=${a.coberturaDias}d | var=${a.variacaoVendaPct}% | precoMin=${a.precoMinimo}`);
  console.log("--- ANTES (Influência) ---"); console.log(infO.oQueFazer + "\n" + infO.pronto);
  console.log("--- DEPOIS (Influência) --- [chat: " + NOVO.textoChat(a, inf).length + " caracteres]"); console.log("O que fazer: " + inf.oQueFazer + "\nPor quê: " + inf.porque + "\n" + inf.pronto);
  if (p.po_pendente_un) { console.log("--- Produto e Compras (com PO) ---"); console.log(comp.oQueFazer + "\n" + comp.pronto); }
}
