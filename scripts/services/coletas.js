import { api } from "./api.js";
import { CATEGORIAS_DEMO } from "../config.js";
import { usuarioDemo, listarDemo, criarDemo, atualizarDemo } from "./demo.js";
import { Chamado } from "../models/chamado.js";

export async function obterCategorias() {
    const categorias = usuarioDemo() ? CATEGORIAS_DEMO : await api("/categorias");
    if (
        !Array.isArray(categorias) ||
        categorias.some((item) => item?.id == null || typeof item.nome !== "string")
    ) {
        throw new Error("Não foi possível carregar as categorias.");
    }
    return categorias.map((item) => ({ ...item, id: String(item.id) }));
}

export async function listarChamados(visao = "minhas") {
    const dados = usuarioDemo()
        ? listarDemo(visao)
        : await api(`/chamados?visao=${encodeURIComponent(visao)}`);
    if (!Array.isArray(dados)) throw new Error("Não foi possível ler a lista de solicitações.");
    return dados.map((item) => new Chamado(item));
}

export async function criarChamado(dados, foto) {
    if (usuarioDemo()) return new Chamado(await criarDemo(dados, foto));
    const formulario = new FormData();
    formulario.append("dados", JSON.stringify(dados));
    formulario.append("foto", foto);
    // O navegador gera o boundary; não definir Content-Type manualmente.
    return new Chamado(await api("/chamados", { metodo: "POST", corpo: formulario }));
}

export async function atualizarChamado(id, acao) {
    if (!["aceitar", "concluir"].includes(acao)) throw new Error("Ação inválida.");
    const dados = usuarioDemo()
        ? await atualizarDemo(id, acao)
        : await api(`/chamados/${encodeURIComponent(id)}/${acao}`, { metodo: "POST" });
    return new Chamado(dados);
}
