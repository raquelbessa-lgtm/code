// Fonte "projeto de afiliados" do agente: Wishlist Afiliadas Gobeauté (app wishlist-afiliadas).
// Lê o catálogo (público) e as respostas (exigem a ADMIN_KEY do Wishlist, guardada como secret WISHLIST_KEY).
// Das respostas só saem @ do Instagram e cupom da marca: nome, WhatsApp e e-mail nunca são usados nem devolvidos.
// Cobre só as 5 marcas Gobeauté do formulário (Ápice, Barbours, Kokeshi, Lescent, Rituária); Gocase usa o GoCreators.

const WISHLIST = "https://wishlist-afiliadas.devgogroup.com";
export const MARCA_CHAVE: Record<string, string> = {
  "Ápice": "apice", Barbours: "barbours", Kokeshi: "kokeshi", Lescent: "lescent", "Rituária": "rituaria",
};

type ItemCatalogo = { id: string; n: string; b: string };
type Resposta = { instagram: string; escolhas: Record<string, string[]>; cupons: Record<string, string> };

export type Wishlist = { catalogo: ItemCatalogo[]; respostas: Resposta[]; carregado_em: string };
export type WishlistMatch = {
  produto_catalogo: string;
  votos: number;
  posicao: number; // posição entre os produtos da marca com voto (1 = mais pedido)
  total_respostas: number;
  afiliadas: { instagram: string; cupom: string }[]; // até 8
};
export type WishlistEstado =
  | { estado: "ok"; wishlist: Wishlist }
  | { estado: "sem_chave" }
  | { estado: "erro"; motivo: string };

let cache: { quando: number; dados: WishlistEstado } | null = null;

export async function carregarWishlist(chave: string | undefined): Promise<WishlistEstado> {
  if (!chave) return { estado: "sem_chave" };
  if (cache && Date.now() - cache.quando < 5 * 60 * 1000) return cache.dados;
  let dados: WishlistEstado;
  try {
    const [c, r] = await Promise.all([
      fetch(`${WISHLIST}/api/catalog`),
      fetch(`${WISHLIST}/api/respostas?key=${encodeURIComponent(chave)}`),
    ]);
    if (r.status === 403) throw new Error("chave do Wishlist recusada (403)");
    if (!c.ok || !r.ok) throw new Error(`Wishlist respondeu ${c.ok ? r.status : c.status}`);
    const cat = await c.json() as { products?: ItemCatalogo[] };
    const brutas = await r.json() as Record<string, unknown>[];
    const respostas: Resposta[] = brutas.map(x => ({
      instagram: String(x.instagram ?? ""),
      escolhas: (x.escolhas ?? {}) as Record<string, string[]>,
      cupons: (x.cupons ?? {}) as Record<string, string>,
    }));
    dados = { estado: "ok", wishlist: { catalogo: cat.products ?? [], respostas, carregado_em: new Date().toISOString().slice(0, 10) } };
  } catch (e) {
    dados = { estado: "erro", motivo: (e as Error).message };
  }
  cache = { quando: Date.now(), dados };
  return dados;
}

const PARADAS = new Set(["de", "da", "do", "com", "kit", "para", "ml", "g", "gr", "em", "e", "o", "a"]);
const tokens = (t: string) =>
  new Set(t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 2 && !PARADAS.has(w)));

// Acha o produto do catálogo do Wishlist que corresponde ao nome do produto parado (mesma marca).
export function votosDoProduto(w: Wishlist, nome: string, marca: string): WishlistMatch | null {
  const chave = MARCA_CHAVE[marca];
  if (!chave) return null;
  const alvo = tokens(nome);
  if (alvo.size === 0) return null;
  let melhor: { item: ItemCatalogo; score: number; inter: number } | null = null;
  for (const item of w.catalogo.filter(i => i.b === chave)) {
    const t = tokens(item.n);
    let inter = 0;
    for (const x of alvo) if (t.has(x)) inter++;
    const score = inter / Math.min(alvo.size, t.size || 1);
    if (inter >= 2 && score >= 0.6 && (!melhor || score > melhor.score || (score === melhor.score && inter > melhor.inter))) melhor = { item, score, inter };
  }
  if (!melhor) return null;

  const contagem = new Map<string, number>();
  const quem: { instagram: string; cupom: string }[] = [];
  for (const r of w.respostas) {
    const ids = r.escolhas[chave] ?? [];
    for (const id of ids) contagem.set(id, (contagem.get(id) ?? 0) + 1);
    if (ids.includes(melhor.item.id)) quem.push({ instagram: r.instagram, cupom: r.cupons[chave] ?? "" });
  }
  const ranking = [...contagem.entries()].sort((a, b) => b[1] - a[1]);
  const pos = ranking.findIndex(([id]) => id === melhor!.item.id);
  return {
    produto_catalogo: melhor.item.n,
    votos: contagem.get(melhor.item.id) ?? 0,
    posicao: pos >= 0 ? pos + 1 : 0,
    total_respostas: w.respostas.length,
    afiliadas: quem.slice(0, 8),
  };
}
