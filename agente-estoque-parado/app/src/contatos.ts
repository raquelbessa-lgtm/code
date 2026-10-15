// Contato dos clientes B2B, lido ao vivo do Data Mart (pedidos de atacado do Tiny), pelo login de quem usa o app.
// O agente só recebe da Torre nome, cidade, UF e vendedor; telefone e e-mail não vêm de lá. O Tiny cobre só parte dos clientes,
// então o contato é "melhor esforço": quando não acha, o cartão diz o motivo e manda abrir o cliente na Torre. Nunca inventa contato.
// Nada de telefone ou e-mail fica no código ou no banco do app: só passa por aqui na hora, para quem tem acesso ao Data Mart.
import type { ContatoCliente } from "./agente";
import { TORRE, TORRE_GERADO_EM } from "./contatos_torre";

export const TABELAS_TINY = [
  "tiny_pedidos_apice_atacado_sp",
  "tiny_pedidos_apice_cosmetics_atacado_es",
  "tiny_pedidos_apice_cosmetics_atacado_rj",
  "tiny_pedidos_ap_cosmetics_es",
  "tiny_pedidos_ap_cosmetics_rj",
  "tiny_pedidos_ap_cosmetics_sp",
];

export type LinhaTiny = {
  nome_cliente?: string | null; fone_cliente?: string | null; email_cliente?: string | null;
  cpf_cnpj_cliente?: string | null; data_pedido?: string | null;
};
export type Resultado = { contato: ContatoCliente | null; motivo?: string };
export type Consulta = (tabela: string, query: string) => Promise<LinhaTiny[]>;
// Falta de login ou de permissão no Data Mart: aparece como erro claro, nunca como "cliente não encontrado".
export class ErroAcesso extends Error {}

export const norm = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Padrão ilike para o PostgREST: até 3 palavras do nome, com vogais e "c" trocados por "_" para não depender de acento
// (o agente guarda o nome sem acento; o Tiny guarda com). O nome exato é conferido depois, em norm().
export function padraoIlike(nome: string): string {
  const palavras = norm(nome).split(" ").filter(Boolean);
  const boas = palavras.filter(p => p.length >= 3);
  const usar = (boas.length ? boas : palavras).slice(0, 3);
  return "*" + usar.map(p => p.replace(/[aeiouc]/g, "_")).join("*") + "*";
}

export const queryTiny = (nome: string) =>
  `select=nome_cliente,fone_cliente,email_cliente,cpf_cnpj_cliente,data_pedido&nome_cliente=ilike.${encodeURIComponent(padraoIlike(nome))}&order=data_pedido.desc&limit=30`;

const limpar = (v?: string | null) => { const t = (v ?? "").trim(); return t || undefined; };
const dataBr = (d?: string | null) => { const m = String(d ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; };

export function escolherContato(alvo: string, linhas: LinhaTiny[]): Resultado {
  const alvoN = norm(alvo);
  const exatas = linhas.filter(l => norm(l.nome_cliente ?? "") === alvoN);
  if (!exatas.length) return { contato: null, motivo: "não encontrado nos pedidos do Tiny" };
  const docs = new Set(exatas.map(l => (l.cpf_cnpj_cliente ?? "").replace(/\D/g, "")).filter(Boolean));
  if (docs.size > 1) return { contato: null, motivo: "há mais de um cadastro com esse nome no Tiny: confirme na Torre qual é o cliente" };
  const recentes = [...exatas].sort((a, b) => String(b.data_pedido ?? "").localeCompare(String(a.data_pedido ?? "")));
  const com = recentes.find(l => limpar(l.fone_cliente) || limpar(l.email_cliente));
  if (!com) return { contato: null, motivo: "cadastro no Tiny sem telefone nem e-mail" };
  return {
    contato: {
      telefone: limpar(com.fone_cliente),
      email: limpar(com.email_cliente)?.toLowerCase(),
      fonte: `Tiny, pedido de ${dataBr(com.data_pedido)}`,
    },
  };
}

const cache = new Map<string, { t: number; v: Resultado }>();
const TTL_MS = 10 * 60 * 1000;
export const MAX_CLIENTES = 12;

export async function buscarContatos(consulta: Consulta, nomes: string[]): Promise<{ resultados: Record<string, Resultado>; falhas: number }> {
  const unicos = [...new Set(nomes)];
  const resultados: Record<string, Resultado> = {};
  let falhas = 0;
  await Promise.all(unicos.map(async (nome, i) => {
    if (i >= MAX_CLIENTES) { resultados[nome] = { contato: null, motivo: `não consultado (limite de ${MAX_CLIENTES} clientes por vez)` }; return; }
    const chave = norm(nome), hit = cache.get(chave);
    if (hit && Date.now() - hit.t < TTL_MS) { resultados[nome] = hit.v; return; }
    const q = queryTiny(nome);
    let falhou = false;
    const lotes = await Promise.all(TABELAS_TINY.map(t => consulta(t, q).catch(e => {
      if (e instanceof ErroAcesso) throw e;
      falhas++; falhou = true; return [] as LinhaTiny[];
    })));
    const r = escolherContato(nome, lotes.flat());
    if (!falhou) cache.set(chave, { t: Date.now(), v: r }); // resposta incompleta não fica em cache
    resultados[nome] = falhou && !r.contato ? { contato: null, motivo: "consulta ao Tiny falhou em alguma tabela: tente de novo" } : r;
  }));
  return { resultados, falhas };
}

// Contato da Torre (dim_cliente + contatos de WhatsApp validados), por nome normalizado + UF. Vem do arquivo gerado
// por contatos/gerar_contatos_torre.py. Cliente com mais de uma filial no mesmo nome não recebe contato chutado.
export function contatoDaTorre(cliente: string, uf: string): Resultado | null {
  const t = TORRE[`${norm(cliente)}|${uf}`];
  if (!t) return null;
  if (t.motivo) return { contato: null, motivo: t.motivo };
  const avisos = [t.emailAviso].filter(Boolean).join("; ");
  return { contato: { telefone: t.telefone, email: t.email, fonte: `Torre B2B, base de ${TORRE_GERADO_EM}${t.email && t.emailFonte ? `; e-mail ${t.emailFonte}` : ""}`, aviso: avisos || undefined } };
}

export const limparCacheContatos = () => cache.clear();
