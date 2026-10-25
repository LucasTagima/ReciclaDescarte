import { cadastrar, caminhoPagina } from "../services/auth.js";
import { mensagem, ocupado, configurarFormulario, erroFormulario, erroCampo } from "../utils/ui.js";

export function iniciar() {
    const formulario = document.getElementById("form-cadastro");
    const aviso = document.getElementById("mensagem-form");
    const perfil = new URLSearchParams(location.search).get("perfil");
    if (perfil === "cooperativa") formulario.elements.tipo.value = perfil;
    configurarFormulario(formulario);
    formulario.elements.senha.addEventListener("input", () =>
        formulario.elements.confirmar_senha.setCustomValidity(""),
    );
    formulario.addEventListener("submit", (evento) => {
        evento.preventDefault();
        const campos = formulario.elements;
        if (campos.nome.value.trim().length < 2)
            return erroCampo(campos.nome, "Informe pelo menos dois caracteres.");
        if (campos.senha.value !== campos.confirmar_senha.value)
            return erroCampo(campos.confirmar_senha, "As senhas precisam ser iguais.");
        const telefone = campos.telefone.value.replace(/\D/g, "");
        if (telefone.length < 10 || telefone.length > 11)
            return erroCampo(campos.telefone, "Informe o telefone com DDD, com 10 ou 11 dígitos.");
        ocupado(
            formulario.querySelector('[type="submit"]'),
            async () => {
                mensagem(aviso);
                const dados = {
                    nome: campos.nome.value.trim(),
                    email: campos.email.value.trim(),
                    telefone,
                    senha: campos.senha.value,
                    tipo: campos.tipo.value,
                };
                try {
                    await cadastrar(dados);
                    formulario.reset();
                    location.assign(`${caminhoPagina("entrar.html")}?cadastro=ok`);
                } catch (erro) {
                    erroFormulario(formulario, aviso, erro);
                }
            },
            "Criando conta…",
        );
    });
}
