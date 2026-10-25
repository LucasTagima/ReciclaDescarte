import { listarChamados, obterCategorias } from "../services/coletas.js";
import { obterPreferencias } from "../services/preferencias.js";
import { renderizarChamados, mostrarPonto } from "../components/chamados.js";
import { filtrarChamados } from "../utils/dados.js";
import { mensagem, ocupado, obterLocalizacao, preencherCategorias } from "../utils/ui.js";

export async function iniciar({ usuario }) {
    const filtros = document.getElementById("filtros").elements;
    const aviso = document.getElementById("mensagem-lista");
    const avisoLocal = document.getElementById("mensagem-localizacao");
    let chamados = [];
    let origem = null;
    const preferencias = obterPreferencias();
    // Distância só pode ser calculada depois de obter uma localização verdadeira.
    filtros.raio.value = "todos";
    filtros.ordem.value =
        preferencias.ordemPadrao === "proximos" ? "recentes" : preferencias.ordemPadrao;
    const opcoesDistancia = [...filtros.raio.options].filter((opcao) => opcao.value !== "todos");
    opcoesDistancia.forEach((opcao) => {
        opcao.disabled = true;
    });
    filtros.ordem.querySelector('[value="proximos"]').disabled = true;

    function renderizar() {
        const lista = filtrarChamados(chamados, {
            texto: filtros.busca.value,
            categoria: filtros.categoria.value,
            status: "pendente",
            raio: filtros.raio.value,
            ordem: filtros.ordem.value,
            origem,
        });
        document.getElementById("total-resultados").textContent =
            `${lista.length} ${lista.length === 1 ? "solicitação disponível" : "solicitações disponíveis"}`;
        renderizarChamados(document.getElementById("lista-chamados"), lista, {
            usuario,
            origem,
            aoMapa: (chamado) =>
                mostrarPonto(
                    chamado,
                    document.getElementById("mapa-radar"),
                    document.getElementById("legenda-mapa"),
                ),
            aoAlterar: async () => {
                await carregar();
                mensagem(
                    document.getElementById("mensagem-acao"),
                    "Coleta aceita. Em “Minhas coletas”, você pode abrir a rota e concluir a retirada.",
                    "sucesso",
                    true,
                );
            },
        });
    }
    async function carregar() {
        mensagem(aviso, "Buscando solicitações disponíveis…");
        try {
            chamados = await listarChamados("radar");
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
        filtros.categoria.value = "";
        filtros.raio.value = "todos";
        filtros.ordem.value = "recentes";
        renderizar();
    });
    document
        .getElementById("atualizar-lista")
        .addEventListener("click", (evento) => ocupado(evento.currentTarget, carregar));
    document.getElementById("usar-localizacao").addEventListener("click", (evento) =>
        ocupado(
            evento.currentTarget,
            async () => {
                mensagem(avisoLocal, "Obtendo sua localização…");
                try {
                    origem = await obterLocalizacao();
                    opcoesDistancia.forEach((opcao) => {
                        opcao.disabled = false;
                    });
                    filtros.ordem.querySelector('[value="proximos"]').disabled = false;
                    filtros.raio.value = preferencias.raioPadrao;
                    filtros.ordem.value = preferencias.ordemPadrao;
                    renderizar();
                    mensagem(
                        avisoLocal,
                        "Localização obtida. As distâncias abaixo são em linha reta.",
                        "sucesso",
                    );
                } catch (erro) {
                    mensagem(avisoLocal, erro.message, "erro");
                }
            },
            "Localizando…",
        ),
    );
    try {
        preencherCategorias(filtros.categoria, await obterCategorias());
    } catch (erro) {
        mensagem(document.getElementById("mensagem-acao"), erro.message, "erro");
    }
    await carregar();
}
