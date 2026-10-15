// Lógica do Agente de Estoque Parado: radar, oferta com margem e uma mensagem pronta por time.
// Funções puras, sem I/O, para rodar igual no GoDeploy e no teste local.

export type Produto = {
  sku: string;
  produto: string;
  categoria: string;
  status: string; // slow moving | descontinuado | dead stock | ativo | campeão | real
  estoque_un: number;
  custo_unit_brl: number;
  preco_cheio_brl: number;
  venda_15d_un: number; // unidades vendidas nos últimos 15 dias
  venda_15d_anteriores_un: number; // unidades vendidas nos 15 dias antes desses
  real?: boolean; // dado real da empresa (sem base de clientes no agente)
  marca?: string; // marca usada nos textos; sem valor, Gocase
  recompra?: Recompra[]; // clientes B2B com recompra prevista (histórico de pedidos)
  semPrecoVarejo?: boolean; // B2C sem preço de site na base: o agente só fixa o piso de preço
  obs?: string; // observação da planilha de permanências (ex.: OFF SITE)
};
export type Recompra = {
  cliente: string; cidade: string; uf: string; vendedor: string;
  pedidos: number; intervalo: number; dias_sem: number; qtd_media: number; preco_medio: number;
  // parado: não comprou nada desde a última compra do SKU; ativo: compra outros itens sem trocar este;
  // trocou: passou a comprar outro item da mesma família (não vale abordar como recompra)
  situacao?: "parado" | "ativo" | "trocou";
  dias_sem_compra?: number;
  paga_boleto_prazo?: boolean; // forma de pagamento mais usada nos últimos 180 dias é boleto a prazo
};
export type Cliente = {
  cliente_id: string;
  canal_preferido: string;
  recorrente: string;
  dias_desde_ultima_compra: number;
  aceita_marketing: string;
  qtd_pedidos: number;
  ticket_medio_brl: number;
};
export type Pedido = { cliente_id: string; sku: string };
export type Base = { produtos: Produto[]; clientes: Cliente[]; pedidos: Pedido[] };

export type Classe = "parado" | "em_risco" | "saudavel" | "campeao";

export type Mensagem = {
  time: string;
  oQueFazer: string;
  porque: string;
  ateQuando: string;
  pronto: string;
  executar: { canal: string; passos: string[] }; // como colocar a ação no ar logo depois da análise
  porVendedor?: { vendedor: string; clientes: number; unidades: number; texto: string }[]; // B2B: mensagem pronta por vendedor
};

export type Analise = {
  sku: string;
  produto: string;
  categoria: string;
  classe: Classe;
  status: string;
  coberturaDias: number;
  variacaoVendaPct: number;
  valorEstoque: number;
  motivo: string;
  precoMinimo: number;
  oferta: { tipo: string; descricao: string; preco: number; descontoPct: number; campeao?: string };
  publico: { total: number; porCanal: Record<string, number>; criterio: string; amostra: string[] };
  mensagens: Mensagem[];
};

export const MARGEM_MINIMA = 1.8; // preço mínimo = custo x 1,8 (folga para frete, imposto e mídia)

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const int = (v: number) => Math.round(v).toLocaleString("pt-BR");
const arred5 = (pct: number) => Math.floor(pct / 5) * 5;

// Regra da empresa: slow moving é o produto cujo estoque, no ritmo de venda dos últimos 15 dias, dura mais de 120 dias.
export const LIMITE_SLOW_MOVING = 120;
export function cobertura(p: Produto): number {
  return p.venda_15d_un > 0 ? Math.round(p.estoque_un / (p.venda_15d_un / 15)) : 9999;
}
export function variacao(p: Produto): number {
  return p.venda_15d_anteriores_un > 0 ? Math.round((p.venda_15d_un / p.venda_15d_anteriores_un - 1) * 1000) / 10 : 0;
}

export function classificar(p: Produto): Classe {
  if (p.status === "campeão") return "campeao";
  const cob = cobertura(p), v = variacao(p);
  if (cob > LIMITE_SLOW_MOVING) return "parado";
  // Entrando em slow moving: já passa de 90 dias, ou a venda despencou e o estoque ainda dura mais de 60 dias.
  if (cob > 90 || (v <= -30 && cob > 60)) return "em_risco";
  return "saudavel";
}

function prazo(hoje: Date, dias: number): string {
  const d = new Date(hoje.getTime() + dias * 86400000);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
}

function campeaoRelacionado(p: Produto, base: Base): Produto | undefined {
  // Na base real não há status "campeão": vale o que gira rápido (cobertura abaixo de 90 dias).
  const camp = base.produtos.filter(x => x.sku !== p.sku && (x.status === "campeão" || (x.real && cobertura(x) < 90)));
  return camp.find(x => x.categoria === p.categoria) ?? camp.sort((a, b) => b.venda_15d_un - a.venda_15d_un)[0];
}

function publico(p: Produto, camp: Produto | undefined, base: Base) {
  const cat = new Map(base.produtos.map(x => [x.sku, x.categoria]));
  const alvo = new Set<string>();
  for (const ped of base.pedidos) {
    if (cat.get(ped.sku) === p.categoria || (camp && ped.sku === camp.sku)) alvo.add(ped.cliente_id);
  }
  const escolhidos = base.clientes
    .filter(c => alvo.has(c.cliente_id) && c.aceita_marketing === "sim" && c.dias_desde_ultima_compra <= 365)
    .sort((a, b) => (a.recorrente === b.recorrente ? a.dias_desde_ultima_compra - b.dias_desde_ultima_compra : a.recorrente === "sim" ? -1 : 1));
  const porCanal: Record<string, number> = {};
  for (const c of escolhidos) porCanal[c.canal_preferido] = (porCanal[c.canal_preferido] ?? 0) + 1;
  return {
    total: escolhidos.length,
    porCanal,
    criterio: `compraram ${p.categoria.toLowerCase()}${camp ? " ou " + camp.produto : ""} no último ano e aceitam marketing; recorrentes primeiro`,
    amostra: escolhidos.slice(0, 8).map(c => c.cliente_id),
  };
}

export function analisar(p: Produto, base: Base, hoje = new Date()): Analise {
  const classe = classificar(p);
  const cob = cobertura(p), v = variacao(p);
  const precoMin = Math.round(p.custo_unit_brl * MARGEM_MINIMA * 100) / 100;
  const camp = campeaoRelacionado(p, base);
  const real = p.status === "real" || !!p.real;
  const marca = p.marca ?? "Gocase";
  const pub = real
    ? { total: 0, porCanal: {} as Record<string, number>, criterio: `clientes reais que compraram ${p.categoria.toLowerCase()} no último ano e aceitam marketing; recorrentes primeiro`, amostra: [] as string[] }
    : publico(p, camp, base);
  const quem = pub.total > 0 ? `${pub.total} clientes` : "o público do critério abaixo";
  const parado = classe === "parado";
  const saida = p.status === "descontinuado" || p.status === "dead stock";

  // Oferta: desconto até o preço mínimo (teto de 40% parado, 15% em risco). Desconto baixo vira kit com campeão.
  const teto = parado ? 40 : 15;
  const espaco = arred5((1 - precoMin / p.preco_cheio_brl) * 100);
  const desc = Math.max(0, Math.min(teto, espaco));
  let oferta: Analise["oferta"];
  if (p.semPrecoVarejo) {
    oferta = { tipo: "piso", descricao: `${p.produto} com preço final nunca abaixo de ${brl(precoMin)}`, preco: precoMin, descontoPct: 0 };
  } else if (desc >= 10) {
    const preco = Math.round(p.preco_cheio_brl * (1 - desc / 100) * 100) / 100;
    oferta = { tipo: "desconto", descricao: `${p.produto} de ${brl(p.preco_cheio_brl)} por ${brl(preco)} (${desc}% off)`, preco, descontoPct: desc };
  } else {
    const preco = Math.max(precoMin, Math.round(p.preco_cheio_brl * 0.9 * 100) / 100);
    oferta = { tipo: "kit", descricao: `Na compra de ${camp?.produto ?? "um campeão"}, leve ${p.produto} por ${brl(preco)}`, preco, descontoPct: Math.round((1 - preco / p.preco_cheio_brl) * 100), campeao: camp?.produto };
  }

  const temTendencia = p.venda_15d_anteriores_un > 0;
  const motivo = p.venda_15d_un === 0
    ? "sem venda nos últimos 15 dias"
    : parado || !temTendencia
      ? `${int(cob)} dias de estoque`
      : classe === "em_risco"
        ? `${int(cob)} dias de estoque, venda ${v < 0 ? "caiu " + Math.abs(v).toLocaleString("pt-BR") + "%" : "estável"} em 15 dias`
        : `${int(cob)} dias de estoque, venda estável`;
  const foraDoSite = (p.obs ?? "").toUpperCase().includes("OFF SITE");
  const ate = prazo(hoje, parado ? 7 : 14);
  const canais = Object.entries(pub.porCanal).map(([c, n]) => `${c} ${n}`).join(", ") || "nenhum";

  // B2B: oferecer só o que o cliente costuma recomprar, nunca o estoque inteiro.
  const todos = p.recompra ?? [];
  // Quem trocou por outro item da mesma família não é abordado: a recompra dele já acontece com outro SKU.
  const reativar = todos.filter(r => r.situacao === "parado");
  const incluir = todos.filter(r => r.situacao === "ativo");
  const trocaram = todos.filter(r => r.situacao === "trocou").length;
  const recompra = [...reativar, ...incluir];
  const qtdSugerida = (r: Recompra) => r.situacao === "ativo" ? Math.max(1, Math.round(r.qtd_media * 0.5)) : r.qtd_media;
  const recompraUn = recompra.reduce((t, r) => t + qtdSugerida(r), 0);
  const precoHabitual = (r: Recompra) => Math.max(precoMin, Math.round(r.preco_medio * 100) / 100);
  // Faixas de tabela da Torre (prelanc_faixa): padrão até 34% sobre a tabela, intermediária de 35% a 49%, especial a partir de 50%.
  // A faixa do cliente sai do preço que ele já paga contra o preço de tabela do SKU. O desconto extra nunca tira o cliente da faixa dele.
  const descontoAtual = (r: Recompra) => Math.max(0, 1 - r.preco_medio / p.preco_cheio_brl);
  const faixa = (r: Recompra) => {
    const d = descontoAtual(r);
    return d < 0.345 ? { nome: "padrão (até 34%)", teto: 0.34 } : d < 0.495 ? { nome: "intermediária (35% a 49%)", teto: 0.49 } : { nome: "especial (50% ou mais)", teto: null as number | null };
  };
  const precoComDesconto = (r: Recompra) => {
    const f = faixa(r);
    if (f.teto === null) return precoHabitual(r); // tabela especial: sem desconto extra
    const pisoFaixa = Math.round(p.preco_cheio_brl * (1 - f.teto) * 100) / 100;
    return Math.max(precoMin, pisoFaixa, Math.round(r.preco_medio * 0.95 * 100) / 100); // até 5% sobre o preço que ele já paga
  };
  const extraPct = (r: Recompra) => Math.max(0, Math.round((1 - precoComDesconto(r) / r.preco_medio) * 1000) / 10);
  // Classe de crédito da Torre para recompra a prazo: A até R$ 30 mil, B até R$ 20 mil, C até R$ 5 mil; D e E só cartão ou PIX.
  const valorPedido = (r: Recompra) => qtdSugerida(r) * condicao(r).preco;
  // O braço vem do nome do cliente: o mesmo cliente recebe sempre a mesma condição em todos os SKUs, para não misturar o teste.
  // Só quem paga a prazo por boleto entra no sorteio; PIX, cartão e outros recebem a condição de preço, fora da comparação.
  const braco = (r: Recompra) => r.paga_boleto_prazo === false
    ? "A, fora do sorteio"
    : ([...r.cliente].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 2 === 0 ? "A" : "B");
  const condicao = (r: Recompra) => braco(r) !== "B"
    ? (extraPct(r) > 0
      ? { texto: `${brl(precoComDesconto(r))}/un (${extraPct(r).toLocaleString("pt-BR")}% abaixo do que paga hoje), no prazo de sempre`, preco: precoComDesconto(r) }
      : { texto: `${brl(precoHabitual(r))}/un, o mesmo preço de sempre`, preco: precoHabitual(r) })
    : { texto: `${brl(precoHabitual(r))}/un, com 30 dias a mais na última parcela (até 120 dias)`, preco: precoHabitual(r) };
  const avisoCredito = (r: Recompra) => {
    if (braco(r) !== "B") return "";
    const v = valorPedido(r);
    return v > 30000 ? ` Pedido de ${brl(v)} passa do teto da classe A (R$ 30 mil): dividir ou pagar parte à vista.`
      : v > 5000 ? ` Pedido de ${brl(v)}: a prazo só para classe ${v > 20000 ? "A" : "A ou B"} na Torre.` : "";
  };
  const vendedores = [...new Set(recompra.map(r => r.vendedor))];
  const porVendedor = vendedores.map(vend => {
    const lista = recompra.filter(r => r.vendedor === vend);
    const linhas = lista.map(r => r.situacao === "parado"
      ? `- REATIVAR [teste ${braco(r)}, tabela ${faixa(r).nome}] ${r.cliente} (${r.cidade}/${r.uf}): comprava cerca de ${int(r.qtd_media)} un a cada ${r.intervalo} dias, não pede este há ${r.dias_sem} dias e a conta está sem pedido há mais tempo que o normal dela. ` +
        `Mensagem: "Oi! Faz tempo que não falamos. Separei ${int(qtdSugerida(r))} un de ${p.produto} a ${condicao(r).texto}, condição até ${ate}. Posso montar o pedido?"${avisoCredito(r)}`
      : `- INCLUIR NO PRÓXIMO PEDIDO [teste ${braco(r)}, tabela ${faixa(r).nome}] ${r.cliente} (${r.cidade}/${r.uf}): segue comprando outros itens, mas não pede este há ${r.dias_sem} dias (costumava a cada ${r.intervalo}). ` +
        `Mensagem: "Oi! No seu próximo pedido, posso incluir ${int(qtdSugerida(r))} un de ${p.produto} a ${condicao(r).texto}? Condição até ${ate}."${avisoCredito(r)}`);
    return {
      vendedor: vend, clientes: lista.length, unidades: lista.reduce((t, r) => t + qtdSugerida(r), 0),
      texto: `${vend}, ${lista.length === 1 ? "este cliente" : "estes clientes"} de ${p.produto}:\n${linhas.join("\n")}`,
    };
  });
  // Sem histórico B2B: lote pequeno, até 30 dias de venda e no máximo 10% do estoque.
  const loteUn = Math.max(10, Math.round(Math.min(p.venda_15d_un * 2, p.estoque_un * 0.1) / 10) * 10);
  const precoLote = Math.max(precoMin, Math.round(p.preco_cheio_brl * 0.7 * 100) / 100);

  // Box surpresa: clientes fiéis assinam e ganham o produto parado de surpresa; quem acabou de comprar recebe o convite.
  const fieis = real ? [] : base.clientes.filter(c => c.recorrente === "sim" && c.qtd_pedidos >= 3 && c.aceita_marketing === "sim");
  const novos = real ? [] : base.clientes.filter(c => c.qtd_pedidos === 1 && c.dias_desde_ultima_compra <= 30 && c.aceita_marketing === "sim");
  const ticketFiel = fieis.length ? fieis.reduce((s, c) => s + c.ticket_medio_brl, 0) / fieis.length : 149.9;
  const faixas = [99.9, 149.9, 199.9, 249.9];
  const box = faixas.find(f => f >= ticketFiel && p.custo_unit_brl <= f * 0.25) ?? faixas.find(f => p.custo_unit_brl <= f * 0.25) ?? 249.9;
  const brindeOk = p.custo_unit_brl <= box * 0.25;
  const fieisTxt = real ? "os clientes fiéis da base real (3 ou mais pedidos)" : `${fieis.length} clientes fiéis`;
  const novosTxt = real || !novos.length
    ? "quem fizer a primeira compra a partir de hoje"
    : `${novos.length} clientes que compraram pela primeira vez nos últimos 30 dias`;

  // Influência: o produto entra na lista que os influenciadores escolhem para puxar com cupom próprio.
  const cupom = p.produto.normalize("NFD").replace(/[^A-Za-z0-9 ]/g, "").split(" ").filter(Boolean).map(w => w[0]).join("").toUpperCase().slice(0, 4) + (oferta.descontoPct || 10);

  const plataforma = marca === "Gocase" ? "admin do site da Gocase (Spree)" : `admin da loja ${marca} (Yampi)`;
  const descTxt = oferta.tipo === "kit" ? "preço de kit" : oferta.tipo === "piso" ? "desconto livre" : `${oferta.descontoPct}% de desconto`;

  // Sem preço de site, o texto ao cliente fala da condição especial; o valor entra quando Growth definir o cupom.
  const ofertaCliente = oferta.tipo === "piso" ? `${p.produto} com condição especial no cupom ${cupom}` : oferta.descricao;
  const textoWhats =`Oi! Separamos uma oferta pra você: ${ofertaCliente}. Vale até ${ate} ou enquanto durar o estoque.`;
  const textoEmail = `Assunto: ${oferta.tipo === "kit" ? "Seu kit com preço especial" : `Preço especial só para clientes ${marca}`}\n${ofertaCliente}. Válido até ${ate}.`;
  const textoSms = `${marca}: ${ofertaCliente}. Até ${ate}.`;

  const mensagens: Mensagem[] = [
    {
      time: "Growth",
      oQueFazer: parado ? `Lance a oferta para ${quem}` : `Destaque o produto e lance a oferta leve para ${quem}`,
      porque: motivo,
      ateQuando: ate,
      pronto: `Oferta: ${oferta.descricao}\n\nWhatsApp: ${textoWhats}\n\nE-mail: ${textoEmail}\n\nSMS: ${textoSms}`,
      executar: { canal: plataforma, passos: [
        ...(foraDoSite
          ? [(p.obs ?? "").toUpperCase().includes("DESCONTINUADO")
            ? `Está fora do site e descontinuado (${p.obs}): decidir com Produto se volta ao ar ou sai pela box e pelo B2B`
            : `Reativar o produto no site: hoje está fora do ar (${p.obs})`]
          : []),
        p.semPrecoVarejo
          ? `Criar o cupom ${cupom} com o desconto que couber, sem o preço final passar abaixo de ${brl(precoMin)}`
          : `Criar o cupom ${cupom} com ${descTxt}, válido até ${ate}`,
        "Colocar o produto em destaque na vitrine com a oferta",
        "Passar os textos acima para o CRM disparar hoje",
      ] },
    },
    {
      time: "CRM",
      oQueFazer: `Dispare a campanha de Growth para ${quem}`,
      porque: motivo,
      ateQuando: ate,
      pronto: real
        ? `Público: ${pub.criterio}. Montar a lista na base real do CRM.`
        : `Público: ${pub.criterio}.\nPor canal: ${canais}.\nPrimeiros da lista (fictícios): ${pub.amostra.join(", ")}`,
      executar: { canal: "ferramenta de disparo do CRM", passos: [
        real ? "Montar o segmento com o critério acima na base real" : "Importar a lista de clientes do público",
        "Agendar o disparo para hoje às 18h com os textos de Growth",
        `Medir as vendas pelo cupom ${cupom} em 24 horas`,
      ] },
    },
    {
      time: "CRM: Box surpresa",
      oQueFazer: brindeOk
        ? `Ofereça a Box surpresa de ${brl(box)}/mês para ${fieisTxt}`
        : `Use o produto como item principal da Box de ${brl(box)}/mês para ${fieisTxt}`,
      porque: motivo,
      ateQuando: ate,
      pronto: `Box: assine a Box ${marca} de ${brl(box)}/mês e ganhe ${brindeOk ? `${p.produto} de surpresa` : `${p.produto} na primeira caixa`}.\n` +
        `Custo do item: ${brl(p.custo_unit_brl)} (${Math.round((p.custo_unit_brl / box) * 100)}% do valor da box).\n` +
        `Fiéis: ${fieisTxt}, ticket médio ${brl(ticketFiel)}.\n` +
        `Pós-compra: ${novosTxt} recebem o convite "assine e ganhe uma surpresa" no e-mail de confirmação do pedido.\n` +
        `Atenção: conferir o item da box na expedição. Brinde faltando é o maior motivo de reembolso do ano.`,
      executar: { canal: "piloto com CRM e expedição", passos: [
        "Criar a box como produto de assinatura no site",
        "Incluir o convite no e-mail de confirmação de pedido",
        "Combinar com a expedição a conferência do item surpresa",
      ] },
    },
    {
      time: "Influência",
      oQueFazer: `Coloque ${p.produto} na lista de produtos que os influenciadores podem puxar`,
      porque: motivo,
      ateQuando: ate,
      pronto: `Cupom sugerido: ${cupom} (${oferta.tipo === "kit" ? "kit" : oferta.tipo === "piso" ? "desconto definido por Growth" : oferta.descontoPct + "% off"}, preço final ${oferta.tipo === "piso" ? "a partir de " : ""}${brl(oferta.preco)}).\n` +
        `Comissão sugerida: 10% sobre a venda, acima do preço mínimo de ${brl(precoMin)}.\n` +
        `Roteiro em 3 falas: mostrar o produto em uso; dizer o preço com o cupom; avisar que é por pouco tempo.\n` +
        `O influenciador escolhe qual produto da lista vai puxar.`,
      executar: { canal: "grupo de afiliados e InfluHub", passos: [
        `Criar o cupom ${cupom} para os afiliados`,
        "Mandar a lista de produtos e o roteiro no grupo de afiliados",
        "Acompanhar as vendas por cupom no InfluHub",
      ] },
    },
    recompra.length
      ? {
        time: "B2B",
        oQueFazer: [reativar.length ? `Reative ${reativar.length} cliente${reativar.length > 1 ? "s" : ""} parado${reativar.length > 1 ? "s" : ""}` : "",
          incluir.length ? `inclua no próximo pedido de ${incluir.length} cliente${incluir.length > 1 ? "s" : ""} ativo${incluir.length > 1 ? "s" : ""}` : ""]
          .filter(Boolean).join(" e ") + ` (${int(recompraUn)} un, ${Math.max(1, Math.round((recompraUn / p.estoque_un) * 100))}% do estoque)`,
        porque: motivo,
        ateQuando: ate,
        pronto: `Clientes que compraram o SKU 2 ou mais vezes no último ano e passaram do intervalo habitual. ` +
          `Reativar = não fez nenhum pedido desde então: oferecer a quantidade de sempre. Incluir no próximo pedido = segue comprando outros itens: oferecer metade, junto do pedido que já vai fazer. ` +
          `${trocaram ? `${trocaram} cliente${trocaram > 1 ? "s" : ""} que trocaram por outro item da mesma família ficaram de fora. ` : ""}` +
          `Condição em teste hoje, só entre clientes que pagam a prazo por boleto: metade (A) recebe até 5% abaixo do preço que já paga, no prazo de sempre, sem sair da faixa de tabela dele (padrão até 34%, intermediária até 49%; quem já está na especial, 50% ou mais, não ganha desconto extra); a outra metade (B) paga o preço de sempre com 30 dias a mais na última parcela, até 120 dias. ` +
          `Quem paga PIX, cartão ou outra forma recebe a condição A e fica fora da comparação. ` +
          `Preço nunca abaixo de ${brl(precoMin)} (piso provisório). Prazo extra só para quem está com o crédito em dia na Torre; com título vencido, a condição vira pagamento à vista no preço do braço A. ` +
          `Estas condições são uma proposta de alçada: precisam do ok do gestor comercial antes do envio. Validade de 7 dias.\n\n` +
          porVendedor.map(x => x.texto).join("\n\n"),
        executar: { canal: "Gira, na Torre B2B", passos: [
          "Pegar o ok do gestor comercial para as condições A e B",
          "Conferir o crédito de cada cliente na Torre antes de oferecer o prazo do braço B",
          "Clientes a reativar: criar no Gira o link de pedido pronto com a quantidade de sempre",
          "Clientes ativos: incluir o item no próximo pedido pelo Gira, junto dos itens que ele já compra",
          "Cada vendedor manda o link para o cliente pelo WhatsApp e confirma em até 2 horas se o cliente abriu",
          "Registrar o braço (A ou B) de cada link para medir qual condição aprovou mais pedidos",
          "Acompanhar na Torre quantos pedidos foram aprovados até o prazo",
        ] },
        porVendedor,
      }
      : todos.length
      ? {
        time: "B2B",
        oQueFazer: `Não abordar como recompra: ${trocaram} cliente${trocaram > 1 ? "s" : ""} trocaram por outro item da mesma família`,
        porque: motivo,
        ateQuando: ate,
        pronto: `Todos os clientes que repunham ${p.produto} passaram a comprar outro item da mesma família. Insistir na recompra só troca um item pelo outro no mesmo pedido. A saída B2B para este SKU é buscar clientes novos para ele.`,
        executar: { canal: "time comercial B2B", passos: [
          `Levantar na Torre clientes que compram a família de ${p.produto} e nunca compraram este SKU`,
          "Oferecer como item novo no próximo pedido, pelo vendedor responsável",
        ] },
      }
      : {
        time: "B2B",
        oQueFazer: `Ofereça até ${int(loteUn)} unidades a clientes que já compram ${p.categoria.toLowerCase()}`,
        porque: motivo,
        ateQuando: ate,
        pronto: `Sem histórico B2B deste SKU na base. Lote limitado a 30 dias de venda e 10% do estoque: ${int(loteUn)} un a ${brl(precoLote)}/un. Preço mínimo com margem: ${brl(precoMin)}.`,
        executar: { canal: "time comercial B2B", passos: [
          `Levantar na Torre clientes que compram ${p.categoria.toLowerCase()}`,
          "Oferecer o lote pelo vendedor responsável de cada cliente",
        ] },
      },
    {
      time: "Produto e Compras",
      oQueFazer: saida ? "Monte o plano de saída e não recompre" : parado ? "Não recompre até a cobertura cair abaixo de 90 dias" : "Pause a próxima compra e revise em 2 semanas",
      porque: motivo,
      ateQuando: ate,
      pronto: `${p.produto}: ${int(p.estoque_un)} un em estoque (${brl(p.estoque_un * p.custo_unit_brl)} a custo), ${int(cob)} dias de cobertura, ${temTendencia ? `venda ${v >= 0 ? "+" : ""}${v.toLocaleString("pt-BR")}% contra os 15 dias anteriores.` : `venda de ${int(p.venda_15d_un)} un nos últimos 15 dias.`} Slow moving a partir de ${LIMITE_SLOW_MOVING} dias.`,
      executar: { canal: "planejamento de compras", passos: [
        saida ? "Registrar o plano de saída do SKU" : "Marcar o SKU como \"não recomprar\" no planejamento",
        `Rever a decisão em ${ate}`,
      ] },
    },
  ];

  const canalB2B = p.recompra !== undefined;
  const mensagensDoCanal = mensagens.filter(m => m.time === (canalB2B ? "B2B" : "Influência"));

  return {
    sku: p.sku, produto: p.produto, categoria: p.categoria, classe, status: p.status,
    coberturaDias: cob, variacaoVendaPct: v, valorEstoque: Math.round(p.estoque_un * p.custo_unit_brl),
    motivo, precoMinimo: precoMin, oferta, publico: pub, mensagens: mensagensDoCanal,
  };
}

export function radar(base: Base, hoje = new Date()) {
  const todos = base.produtos.map(p => analisar(p, base, hoje)).sort((a, b) => b.valorEstoque - a.valorEstoque);
  return {
    reais: todos.filter(a => a.status === "real"),
    parados: todos.filter(a => a.classe === "parado" && a.status !== "real"),
    emRisco: todos.filter(a => a.classe === "em_risco" && a.status !== "real"),
    saudaveis: todos.filter(a => a.classe === "saudavel").map(a => a.produto),
  };
}

export function textoChat(a: Analise, m: Mensagem): string {
  return `*Agente de Estoque Parado → ${m.time}*\n*O que fazer:* ${m.oQueFazer}\n*Por quê:* ${a.produto}, ${m.porque}\n*Até quando:* ${m.ateQuando}\n*Pronto para usar:*\n${m.pronto}\n*Como executar agora (${m.executar.canal}):*\n${m.executar.passos.map((p, i) => `${i + 1}. ${p}`).join("\n")}\n\nResponda *ok* para aprovar.`;
}
