import { armazenamento, lerJson, gravarJson, remover } from "./storage.js";

export const CHAVE_PREFERENCIAS = "recicladescarte:preferencias:v1";
export const PADRAO = Object.freeze({
    tema: "sistema",
    tamanhoTexto: "normal",
    reduzirMovimento: false,
    categoriaPadrao: "",
    raioPadrao: "todos",
    ordemPadrao: "recentes",
});

export function normalizarPreferencias(dados) {
    const valor = dados && typeof dados === "object" ? dados : {};
    const umaDe = (chave, opcoes) => (opcoes.includes(valor[chave]) ? valor[chave] : PADRAO[chave]);
    return {
        tema: umaDe("tema", ["sistema", "claro", "escuro"]),
        tamanhoTexto: umaDe("tamanhoTexto", ["normal", "grande"]),
        reduzirMovimento: valor.reduzirMovimento === true,
        categoriaPadrao:
            typeof valor.categoriaPadrao === "string" ? valor.categoriaPadrao.slice(0, 80) : "",
        raioPadrao: umaDe("raioPadrao", ["todos", "5", "10", "25"]),
        ordemPadrao: umaDe("ordemPadrao", ["recentes", "proximos", "antigos"]),
    };
}

export function obterPreferencias() {
    return normalizarPreferencias(lerJson(armazenamento(), CHAVE_PREFERENCIAS));
}

export function aplicarPreferencias(preferencias = obterPreferencias()) {
    const escuro =
        preferencias.tema === "escuro" ||
        (preferencias.tema === "sistema" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.tema = escuro ? "escuro" : "claro";
    document.documentElement.dataset.texto = preferencias.tamanhoTexto;
    document.documentElement.classList.toggle("reduzir-movimento", preferencias.reduzirMovimento);
}

export function salvarPreferencias(dados) {
    const preferencias = normalizarPreferencias(dados);
    gravarJson(armazenamento(), CHAVE_PREFERENCIAS, preferencias);
    aplicarPreferencias(preferencias);
    return preferencias;
}

export function restaurarPreferencias() {
    // Remove somente a chave da aplicação; nunca use localStorage.clear().
    if (!remover(armazenamento(), CHAVE_PREFERENCIAS)) {
        throw new Error("Não foi possível restaurar as preferências neste navegador.");
    }
    aplicarPreferencias(PADRAO);
}

export function iniciarPreferencias() {
    aplicarPreferencias();
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () =>
        aplicarPreferencias(),
    );
    window.addEventListener("storage", (evento) => {
        if (evento.key === CHAVE_PREFERENCIAS || evento.key === null) aplicarPreferencias();
    });
}
