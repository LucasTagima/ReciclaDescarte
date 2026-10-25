import { api, limparCsrf } from "./api.js";
import { usuarioDemo, sairDemo } from "./demo.js";

export function caminhoPagina(nome) {
    return new URL(`../../pages/${nome}`, import.meta.url).href;
}

export function destinoPerfil(usuario) {
    return caminhoPagina(
        usuario.tipo === "cooperativa" ? "radar_cooperativa.html" : "dash_morador.html",
    );
}

function validarUsuario(usuario) {
    if (
        !usuario?.id ||
        typeof usuario.nome !== "string" ||
        !["morador", "cooperativa"].includes(usuario.tipo)
    ) {
        throw new Error("O serviço retornou um perfil inválido.");
    }
    return usuario;
}

export async function obterUsuario() {
    return usuarioDemo() || validarUsuario(await api("/auth/me"));
}

export async function entrar(email, senha) {
    const usuario = validarUsuario(
        await api("/auth/login", { metodo: "POST", corpo: { email, senha } }),
    );
    sairDemo();
    limparCsrf();
    return usuario;
}

export async function cadastrar(dados) {
    await api("/auth/cadastro", { metodo: "POST", corpo: dados });
    limparCsrf();
}

export async function sair() {
    if (usuarioDemo()) sairDemo();
    else await api("/auth/logout", { metodo: "POST" });
    limparCsrf();
}

export async function exigirUsuario(tipos) {
    try {
        const usuario = await obterUsuario();
        if (!tipos.includes(usuario.tipo)) {
            location.replace(destinoPerfil(usuario));
            return null;
        }
        return usuario;
    } catch (erro) {
        if (erro.status === 401) {
            location.replace(caminhoPagina("entrar.html"));
            return null;
        }
        throw erro;
    }
}
