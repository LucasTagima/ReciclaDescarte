import {
    obterPreferencias,
    salvarPreferencias,
    restaurarPreferencias,
    PADRAO,
} from "../services/preferencias.js";
import { obterCategorias } from "../services/coletas.js";
import { usuarioDemo, reiniciarDemo } from "../services/demo.js";
import { elemento, mensagem, preencherCategorias } from "../utils/ui.js";

export async function iniciar() {
    const formulario = document.getElementById("form-configuracoes");
    const campos = formulario.elements;
    const aviso = document.getElementById("mensagem-form");
    let categoriaDisponivel = false;
    function preencher(dados) {
        campos.tema.value = dados.tema;
        campos.tamanhoTexto.value = dados.tamanhoTexto;
        campos.reduzirMovimento.checked = dados.reduzirMovimento;
        campos.raioPadrao.value = dados.raioPadrao;
        campos.ordemPadrao.value = dados.ordemPadrao;
        campos.categoriaPadrao.value = dados.categoriaPadrao;
        if (campos.categoriaPadrao.selectedIndex < 0) campos.categoriaPadrao.value = "";
    }
    preencher(obterPreferencias());
    formulario.addEventListener("submit", (evento) => {
        evento.preventDefault();
        try {
            salvarPreferencias({
                tema: campos.tema.value,
                tamanhoTexto: campos.tamanhoTexto.value,
                reduzirMovimento: campos.reduzirMovimento.checked,
                raioPadrao: campos.raioPadrao.value,
                ordemPadrao: campos.ordemPadrao.value,
                categoriaPadrao: categoriaDisponivel
                    ? campos.categoriaPadrao.value
                    : obterPreferencias().categoriaPadrao,
            });
            mensagem(aviso, "Configurações salvas neste navegador.", "sucesso", true);
        } catch (erro) {
            mensagem(aviso, erro.message, "erro", true);
        }
    });
    document.getElementById("restaurar-configuracoes").addEventListener("click", () => {
        try {
            restaurarPreferencias();
            preencher(PADRAO);
            mensagem(aviso, "Configurações padrão restauradas.", "sucesso", true);
        } catch (erro) {
            mensagem(aviso, erro.message, "erro", true);
        }
    });
    if (usuarioDemo()) {
        const area = document.getElementById("controle-demo");
        area.hidden = false;
        const botao = document.getElementById("reiniciar-demo");
        botao.addEventListener("click", () => {
            const dialogo = elemento("dialog", "", "dialogo");
            const titulo = elemento("h2", "Reiniciar a demonstração?");
            titulo.id = "titulo-reiniciar";
            dialogo.setAttribute("aria-labelledby", titulo.id);
            const cancelar = elemento("button", "Manter dados", "botao botao-secundario");
            cancelar.type = "button";
            cancelar.addEventListener("click", () => dialogo.close());
            const confirmar = elemento("button", "Reiniciar demonstração", "botao botao-primario");
            confirmar.type = "button";
            confirmar.addEventListener("click", () => {
                try {
                    reiniciarDemo();
                    dialogo.close();
                    mensagem(
                        aviso,
                        "Demonstração reiniciada com os exemplos iniciais.",
                        "sucesso",
                        true,
                    );
                } catch (erro) {
                    dialogo.close();
                    mensagem(aviso, erro.message, "erro", true);
                }
            });
            const acoes = elemento("div", "", "acoes");
            acoes.append(cancelar, confirmar);
            dialogo.append(
                titulo,
                elemento(
                    "p",
                    "Seus pedidos e fotos de teste serão apagados, e os exemplos iniciais voltarão. Suas configurações continuam salvas.",
                ),
                acoes,
            );
            document.body.append(dialogo);
            dialogo.addEventListener("close", () => dialogo.remove(), { once: true });
            dialogo.showModal();
            cancelar.focus();
        });
    }
    try {
        const categorias = await obterCategorias();
        preencherCategorias(campos.categoriaPadrao, categorias, "Escolher a cada solicitação");
        categoriaDisponivel = true;
        campos.categoriaPadrao.disabled = false;
        preencher(obterPreferencias());
    } catch {
        document.getElementById("ajuda-categoria").textContent =
            "Não foi possível carregar os materiais. Você ainda pode salvar as outras configurações.";
    }
}
