import { STATUS } from "../models/chamado.js";
import { atualizarChamado } from "../services/coletas.js";
import { usuarioDemo } from "../services/demo.js";
import { elemento, mensagem, ocupado, mostrarMapa } from "../utils/ui.js";
import { distanciaKm, formatarData, urlFotoSegura, urlRota } from "../utils/dados.js";

function enderecoResumido(chamado) {
    if (chamado.endereco?.logradouro)
        return [chamado.endereco.logradouro, chamado.endereco.numero].filter(Boolean).join(", ");
    return chamado.precisao_localizacao === "aproximada"
        ? "Localização aproximada no mapa"
        : "Local de retirada não informado";
}

function adicionarDetalhe(lista, rotulo, valor) {
    lista.append(elemento("dt", rotulo), elemento("dd", valor));
}

export function abrirDetalhes(chamado, { usuario, aoAlterar = () => {}, aoMapa } = {}) {
    const dialogo = elemento("dialog", "", "dialogo");
    dialogo.setAttribute("aria-labelledby", "titulo-detalhe");
    const topo = elemento("div", "", "linha-entre");
    const titulo = elemento("h2", chamado.categoria.nome);
    titulo.id = "titulo-detalhe";
    const fechar = elemento("button", "Fechar", "botao botao-secundario");
    fechar.type = "button";
    fechar.addEventListener("click", () => dialogo.close());
    topo.append(titulo, fechar);
    const etiqueta = elemento("span", STATUS[chamado.status], `status status-${chamado.status}`);
    const lista = elemento("dl", "", "detalhes-lista");
    adicionarDetalhe(lista, "Solicitação", chamado.id);
    adicionarDetalhe(lista, "Solicitada em", formatarData(chamado.criado_em));
    if (chamado.cooperativa_nome) adicionarDetalhe(lista, "Responsável", chamado.cooperativa_nome);
    if (chamado.aceito_em) adicionarDetalhe(lista, "Aceita em", formatarData(chamado.aceito_em));
    if (chamado.concluido_em)
        adicionarDetalhe(lista, "Concluída em", formatarData(chamado.concluido_em));
    const acessoCompleto =
        (usuario?.tipo === "morador" && String(chamado.morador_id) === String(usuario.id)) ||
        String(chamado.cooperativa_id) === String(usuario?.id) ||
        Boolean(usuarioDemo());
    if (acessoCompleto) {
        adicionarDetalhe(lista, "Endereço", enderecoResumido(chamado));
    }
    if (chamado.categoria.instrucoes)
        adicionarDetalhe(lista, "Como separar", chamado.categoria.instrucoes);
    const foto = urlFotoSegura(chamado.foto_url, Boolean(usuarioDemo()));
    dialogo.append(topo, etiqueta, lista);
    if (chamado.precisao_localizacao === "aproximada")
        dialogo.append(
            elemento(
                "p",
                "O ponto no radar é aproximado. O endereço aparece após o aceite.",
                "texto-pequeno",
            ),
        );
    if (foto) {
        const imagem = elemento("img", "", "foto-detalhe");
        if (!usuarioDemo()) imagem.crossOrigin = "use-credentials";
        imagem.src = foto;
        imagem.alt = `Material informado: ${chamado.categoria.nome}`;
        imagem.addEventListener(
            "error",
            () => imagem.replaceWith(elemento("p", "A foto não está disponível.")),
            { once: true },
        );
        dialogo.append(imagem);
    }
    const acoes = elemento("div", "", "acoes");
    if (aoMapa && chamado.localizacao) {
        const mapa = elemento("button", "Ver ponto no mapa", "botao botao-secundario");
        mapa.type = "button";
        mapa.addEventListener("click", () => {
            dialogo.close();
            aoMapa(chamado);
        });
        acoes.append(mapa);
    }
    const rota =
        acessoCompleto && chamado.status === "em_andamento" && chamado.podeConcluir(usuario)
            ? urlRota(chamado.localizacao)
            : null;
    if (rota) {
        const link = elemento("a", "Abrir rota no Google Maps ↗", "botao botao-secundario");
        link.href = rota;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        acoes.append(link);
    }
    const aviso = elemento("p", "", "mensagem");
    aviso.setAttribute("role", "status");
    aviso.hidden = true;
    const acao = chamado.podeAceitar(usuario)
        ? "aceitar"
        : chamado.podeConcluir(usuario)
          ? "concluir"
          : null;
    if (acao) {
        const confirmar = elemento("label", "", "checkbox-linha");
        const checkbox = elemento("input");
        checkbox.type = "checkbox";
        confirmar.append(
            checkbox,
            elemento(
                "span",
                acao === "aceitar" ? "Posso fazer esta coleta." : "O material já foi retirado.",
            ),
        );
        const botao = elemento(
            "button",
            acao === "aceitar" ? "Aceitar coleta" : "Concluir coleta",
            "botao botao-primario",
        );
        botao.type = "button";
        botao.disabled = true;
        checkbox.addEventListener("change", () => {
            botao.disabled = !checkbox.checked;
        });
        let enviando = false;
        dialogo.addEventListener("cancel", (evento) => {
            if (enviando) evento.preventDefault();
        });
        botao.addEventListener("click", () =>
            ocupado(botao, async () => {
                enviando = true;
                checkbox.disabled = true;
                fechar.disabled = true;
                try {
                    const atualizado = await atualizarChamado(chamado.id, acao);
                    dialogo.close();
                    await aoAlterar(atualizado);
                } catch (erro) {
                    mensagem(aviso, erro.message, "erro", true);
                } finally {
                    enviando = false;
                    checkbox.disabled = false;
                    fechar.disabled = false;
                }
            }),
        );
        dialogo.append(confirmar);
        acoes.append(botao);
    }
    dialogo.append(aviso, acoes);
    document.body.append(dialogo);
    dialogo.addEventListener("close", () => dialogo.remove(), { once: true });
    dialogo.showModal();
}

export function renderizarChamados(container, lista, opcoes = {}) {
    container.replaceChildren();
    if (!lista.length) {
        container.append(
            elemento(
                "p",
                opcoes.vazio || "Nenhuma coleta com esses filtros. Tente outra busca.",
                "estado-vazio",
            ),
        );
        return;
    }
    lista.forEach((chamado) => {
        const card = elemento("article", "", "card card-coleta");
        const topo = elemento("div", "", "linha-entre");
        topo.append(
            elemento("h3", chamado.categoria.nome),
            elemento("span", chamado.rotuloStatus, `status status-${chamado.status}`),
        );
        const distancia = distanciaKm(opcoes.origem, chamado.localizacao);
        const botao = elemento("button", "Ver detalhes", "botao botao-secundario");
        botao.type = "button";
        botao.setAttribute(
            "aria-label",
            `Ver detalhes de ${chamado.categoria.nome}, solicitação ${chamado.id}`,
        );
        botao.addEventListener("click", () => abrirDetalhes(chamado, opcoes));
        card.append(
            topo,
            elemento("p", enderecoResumido(chamado), "texto-suave"),
            elemento("p", `Solicitada em: ${formatarData(chamado.criado_em)}`, "texto-pequeno"),
        );
        if (distancia !== null)
            card.append(
                elemento(
                    "p",
                    `Cerca de ${distancia.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km em linha reta`,
                    "texto-pequeno",
                ),
            );
        card.append(botao);
        container.append(card);
    });
}

export function mostrarPonto(chamado, container, legenda) {
    mostrarMapa(container, chamado.localizacao, `Ponto de referência: ${chamado.categoria.nome}`);
    legenda.textContent =
        chamado.precisao_localizacao === "aproximada"
            ? `${chamado.categoria.nome} • Ponto aproximado. O endereço aparece após o aceite.`
            : `${chamado.categoria.nome} • ${enderecoResumido(chamado)}. Local da retirada.`;
    container.scrollIntoView({ behavior: "auto", block: "center" });
    legenda.tabIndex = -1;
    legenda.focus({ preventScroll: true });
}
