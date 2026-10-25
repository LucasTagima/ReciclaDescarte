import { caminhoPagina, destinoPerfil, sair } from "../services/auth.js";
import { usuarioDemo, entrarDemo } from "../services/demo.js";
import { elemento, mensagem, ocupado } from "../utils/ui.js";

let eventosMenu;

export function montarNavegacao(usuario = null) {
    const container = document.getElementById("cabecalho-app");
    if (!container) return;
    eventosMenu?.abort();
    eventosMenu = new AbortController();
    const marca = elemento("a", "", "marca");
    marca.href = usuario
        ? destinoPerfil(usuario)
        : new URL("../../index.html", import.meta.url).href;
    const logo = elemento("img");
    logo.src = new URL("../../imagens/logo.png", import.meta.url).href;
    logo.alt = "";
    logo.width = 36;
    logo.height = 36;
    marca.append(logo, elemento("span", "ReciclaDescarte"));
    const botaoMenu = elemento("button", "Menu", "botao botao-secundario menu-toggle");
    botaoMenu.type = "button";
    botaoMenu.setAttribute("aria-controls", "navegacao-app");
    botaoMenu.setAttribute("aria-expanded", "false");
    const nav = elemento("nav", "", "navegacao-app");
    nav.id = "navegacao-app";
    nav.setAttribute("aria-label", "Menu principal");
    const links =
        usuario?.tipo === "cooperativa"
            ? [
                  ["Radar de coletas", "radar_cooperativa.html"],
                  ["Minhas coletas", "coletas.html"],
              ]
            : usuario
              ? [
                    ["Início", "dash_morador.html"],
                    ["Nova solicitação", "solicitacao.html"],
                    ["Minhas coletas", "coletas.html"],
                ]
              : [
                    ["Entrar", "entrar.html"],
                    ["Cadastrar-se", "cadastro.html"],
                ];
    links.push(["Configurações", "configuracoes.html"]);
    for (const [rotulo, arquivo] of links) {
        const link = elemento("a", rotulo);
        link.href = caminhoPagina(arquivo);
        if (new URL(link.href).pathname === location.pathname)
            link.setAttribute("aria-current", "page");
        nav.append(link);
    }
    const conta = elemento("div", "", "conta");
    if (usuario) {
        const iniciais = usuario.nome
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((parte) => parte[0])
            .join("")
            .toUpperCase();
        const avatar = elemento("span", iniciais, "avatar");
        avatar.setAttribute("aria-hidden", "true");
        const descricao = elemento("div", "", "conta-texto");
        descricao.append(
            elemento("strong", usuario.nome),
            elemento("small", usuario.tipo === "morador" ? "Morador" : "Cooperativa / coletor"),
        );
        const botaoSair = elemento("button", "Sair", "botao-texto");
        botaoSair.type = "button";
        botaoSair.addEventListener("click", () =>
            ocupado(botaoSair, async () => {
                try {
                    await sair();
                    location.assign(caminhoPagina("entrar.html"));
                } catch (erro) {
                    mensagem(
                        document.getElementById("mensagem-global"),
                        erro.message,
                        "erro",
                        true,
                    );
                }
            }),
        );
        conta.append(avatar, descricao, botaoSair);
    }
    container.replaceChildren(marca, botaoMenu, nav, conta);
    const fechar = () => {
        botaoMenu.setAttribute("aria-expanded", "false");
        nav.classList.remove("aberto");
    };
    botaoMenu.addEventListener("click", () => {
        const abrir = botaoMenu.getAttribute("aria-expanded") !== "true";
        botaoMenu.setAttribute("aria-expanded", String(abrir));
        nav.classList.toggle("aberto", abrir);
    });
    document.addEventListener(
        "keydown",
        (evento) => {
            if (evento.key === "Escape" && nav.classList.contains("aberto")) {
                fechar();
                botaoMenu.focus();
            }
        },
        { signal: eventosMenu.signal },
    );
    document.addEventListener(
        "click",
        (evento) => {
            if (!container.contains(evento.target)) fechar();
        },
        { signal: eventosMenu.signal },
    );
    nav.addEventListener("click", (evento) => {
        if (evento.target.closest("a")) fechar();
    });

    const faixa = document.getElementById("faixa-demo");
    if (faixa && usuario && usuarioDemo()) {
        faixa.hidden = false;
        const outro = usuario.tipo === "morador" ? "cooperativa" : "morador";
        const botao = elemento("button", `Testar como ${outro}`, "botao-texto");
        botao.type = "button";
        botao.addEventListener("click", () => {
            try {
                location.assign(destinoPerfil(entrarDemo(outro)));
            } catch (erro) {
                mensagem(document.getElementById("mensagem-global"), erro.message, "erro", true);
            }
        });
        faixa.replaceChildren(
            elemento("span", "Você está na demonstração. Use apenas dados de exemplo."),
            botao,
        );
    }
}
