import { listarChamados } from "../services/coletas.js";
import { renderizarChamados } from "../components/chamados.js";
import { filtrarChamados } from "../utils/dados.js";
import { mensagem, ocupado } from "../utils/ui.js";

export async function iniciar({ usuario }) {
    const filtros = document.getElementById("filtros").elements;
    const aviso = document.getElementById("mensagem-lista");
    let chamados = [];
    document.getElementById("descricao-coletas").textContent =
        usuario.tipo === "cooperativa"
            ? "Veja as coletas que você aceitou. Abra a rota e conclua o pedido após retirar o material."
            : "Veja a situação dos seus pedidos e quem aceitou cada coleta.";
    if (new URLSearchParams(location.search).get("criada") === "1") {
        mensagem(
            document.getElementById("mensagem-acao"),
            "Solicitação criada. Agora é só aguardar o aceite de uma cooperativa.",
            "sucesso",
        );
        history.replaceState(null, "", location.pathname);
    }
    function renderizar() {
        const lista = filtrarChamados(chamados, {
            texto: filtros.busca.value,
            status: filtros.status.value,
            ordem: filtros.ordem.value,
        });
        document.getElementById("total-resultados").textContent =
            `${lista.length} ${lista.length === 1 ? "coleta encontrada" : "coletas encontradas"}`;
        renderizarChamados(document.getElementById("lista-chamados"), lista, {
            usuario,
            aoAlterar: (atualizado) => {
                chamados = chamados.map((item) => (item.id === atualizado.id ? atualizado : item));
                renderizar();
                mensagem(
                    document.getElementById("mensagem-acao"),
                    "Coleta concluída.",
                    "sucesso",
                    true,
                );
            },
        });
    }
    async function carregar() {
        mensagem(aviso, "Carregando suas coletas…");
        try {
            chamados = await listarChamados();
            renderizar();
            mensagem(aviso);
        } catch (erro) {
            mensagem(aviso, erro.message, "erro");
        }
    }
    document
        .getElementById("filtros")
        .addEventListener("submit", (evento) => evento.preventDefault());
    document.getElementById("filtros").addEventListener("input", renderizar);
    document.getElementById("limpar-filtros").addEventListener("click", () => {
        filtros.busca.value = "";
        filtros.status.value = "";
        filtros.ordem.value = "recentes";
        renderizar();
    });
    document
        .getElementById("atualizar-lista")
        .addEventListener("click", (evento) => ocupado(evento.currentTarget, carregar));
    await carregar();
}
