import { iniciarPreferencias } from "./services/preferencias.js";
import { exigirUsuario, obterUsuario } from "./services/auth.js";
import { montarNavegacao } from "./components/navegacao.js";
import { mensagem, configurarSenhas } from "./utils/ui.js";

// As importações são explícitas e relativas a este arquivo, não à URL do HTML.
const paginas = {
    entrar: () => import("./pages/entrar.js"),
    cadastro: () => import("./pages/cadastro.js"),
    morador: () => import("./pages/morador.js"),
    solicitacao: () => import("./pages/solicitacao.js"),
    radar: () => import("./pages/radar.js"),
    coletas: () => import("./pages/coletas.js"),
    configuracoes: () => import("./pages/configuracoes.js"),
};
const acesso = {
    morador: ["morador"],
    solicitacao: ["morador"],
    radar: ["cooperativa"],
    coletas: ["morador", "cooperativa"],
};

async function iniciar() {
    iniciarPreferencias();
    configurarSenhas();
    const pagina = document.body.dataset.pagina;
    let usuario = null;
    if (acesso[pagina]) {
        usuario = await exigirUsuario(acesso[pagina]);
        if (!usuario) return;
    }
    montarNavegacao(usuario);
    if (pagina === "configuracoes") {
        // Não bloqueia a edição das preferências enquanto verifica a sessão.
        obterUsuario()
            .then((perfil) => montarNavegacao(perfil))
            .catch(() => {});
    }
    const conteudo = document.getElementById("conteudo");
    if (conteudo) conteudo.hidden = false;
    const carregamento = document.getElementById("carregamento");
    if (carregamento) carregamento.hidden = true;
    if (paginas[pagina]) {
        const modulo = await paginas[pagina]();
        await modulo.iniciar({ usuario });
    }
}

iniciar().catch((erro) => {
    const carregamento = document.getElementById("carregamento");
    if (carregamento) carregamento.hidden = true;
    mensagem(
        document.getElementById("mensagem-global"),
        erro.message || "Não foi possível abrir esta página. Tente novamente.",
        "erro",
        true,
    );
    document.getElementById("recuperar-pagina")?.removeAttribute("hidden");
});

document.getElementById("recarregar-pagina")?.addEventListener("click", () => location.reload());

window.addEventListener("pageshow", (evento) => {
    if (evento.persisted && acesso[document.body.dataset.pagina]) location.reload();
});
