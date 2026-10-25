import { entrar, destinoPerfil } from "../services/auth.js";
import { entrarDemo } from "../services/demo.js";
import { mensagem, ocupado, configurarFormulario, erroFormulario } from "../utils/ui.js";

export function iniciar() {
    const formulario = document.getElementById("form-entrar");
    const aviso = document.getElementById("mensagem-form");
    configurarFormulario(formulario);
    if (new URLSearchParams(location.search).get("cadastro") === "ok") {
        mensagem(aviso, "Cadastro concluído. Entre com seu e-mail e senha.", "sucesso");
    }
    formulario.addEventListener("submit", (evento) => {
        evento.preventDefault();
        ocupado(
            formulario.querySelector('[type="submit"]'),
            async () => {
                mensagem(aviso);
                try {
                    const usuario = await entrar(
                        formulario.elements.email.value.trim(),
                        formulario.elements.senha.value,
                    );
                    location.assign(destinoPerfil(usuario));
                } catch (erro) {
                    erroFormulario(formulario, aviso, erro);
                }
            },
            "Entrando…",
        );
    });
    document.querySelectorAll("[data-entrar-demo]").forEach((botao) => {
        botao.addEventListener("click", () => {
            try {
                location.assign(destinoPerfil(entrarDemo(botao.dataset.entrarDemo)));
            } catch (erro) {
                mensagem(aviso, erro.message, "erro", true);
            }
        });
    });
}
