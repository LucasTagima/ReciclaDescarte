import { api } from "./api.js";
import { CONFIG, CATEGORIAS_DEMO } from "../config.js";
import { usuarioDemo, listarDemo, criarDemo, atualizarDemo } from "./demo.js";
import { Chamado } from "../models/chamado.js";

function lerChamado(dados) {
    let fotoUrl = null;
    if (
        typeof dados?.foto_url === "string" &&
        /^\/api\/fotos\/[a-f0-9]{48}\.jpg$/.test(dados.foto_url)
    ) {
        const base = new URL(CONFIG.apiBase, location.href);
        fotoUrl = new URL(dados.foto_url, base).href;
    }
    return new Chamado({ ...dados, foto_url: fotoUrl });
}

export async function obterCategorias() {
    const categorias = usuarioDemo() ? CATEGORIAS_DEMO : await api("/categorias");
    if (
        !Array.isArray(categorias) ||
        categorias.some((item) => item?.id == null || typeof item.nome !== "string")
    ) {
        throw new Error("Não foi possível carregar as categorias.");
    }
    const normalizar = (nome) =>
        nome
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim()
            .toLowerCase();
    const icones = new Map(CATEGORIAS_DEMO.map((item) => [normalizar(item.nome), item.icone]));
    icones.set("papel", "papel");
    icones.set("papelao", "papel");
    return categorias.map((item) => ({
        ...item,
        id: String(item.id),
        icone: item.icone || icones.get(normalizar(item.nome)) || "residuos-especiais",
    }));
}

export async function listarChamados(visao = "minhas") {
    const demonstracao = Boolean(usuarioDemo());
    const dados = demonstracao
        ? listarDemo(visao)
        : await api(`/chamados?visao=${encodeURIComponent(visao)}`);
    if (!Array.isArray(dados)) throw new Error("Não foi possível ler a lista de solicitações.");
    return dados.map((item) => (demonstracao ? new Chamado(item) : lerChamado(item)));
}

export async function criarChamado(dados, foto) {
    if (usuarioDemo()) return new Chamado(await criarDemo(dados, foto));
    const formulario = new FormData();
    formulario.append("dados", JSON.stringify(dados));
    formulario.append("foto", foto);
    // O navegador gera o boundary; não definir Content-Type manualmente.
    return lerChamado(await api("/chamados", { metodo: "POST", corpo: formulario }));
}

export async function atualizarChamado(id, acao) {
    if (!["aceitar", "concluir"].includes(acao)) throw new Error("Ação inválida.");
    if (usuarioDemo()) return new Chamado(await atualizarDemo(id, acao));
    return lerChamado(await api(`/chamados/${encodeURIComponent(id)}/${acao}`, { metodo: "POST" }));
}
