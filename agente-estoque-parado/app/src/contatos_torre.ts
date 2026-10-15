// Contatos dos clientes B2B vindos da Torre. Vazio no git de propósito: o arquivo preenchido tem telefone e e-mail de clientes.
// Para preencher: rode contatos/torre_contatos.sql na Torre (query_sql) e passe o JSON para contatos/gerar_contatos_torre.py.
export const TORRE_GERADO_EM = "";
export type ContatoTorre = { telefone?: string; email?: string; emailFonte?: string; emailAviso?: string; motivo?: string };
export const TORRE: Record<string, ContatoTorre> = {};
