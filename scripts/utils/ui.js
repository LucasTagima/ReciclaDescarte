import { urlMapa } from "./dados.js";

export function elemento(tag, texto = "", classe = "") {
    const no = document.createElement(tag);
    if (texto) no.textContent = texto;
    if (classe) no.className = classe;
    return no;
}

export function mensagem(no, texto = "", tipo = "info", focar = false) {
    if (!no) return;
    no.textContent = texto;
    no.dataset.tipo = tipo;
    no.hidden = !texto;
    if (focar && texto) {
        no.tabIndex = -1;
        no.focus();
    }
}

export async function ocupado(botao, tarefa, rotulo = "Aguarde…") {
    if (botao.disabled) return;
    const original = botao.textContent;
    botao.disabled = true;
    botao.textContent = rotulo;
    botao.setAttribute("aria-busy", "true");
    try {
        return await tarefa();
    } finally {
        botao.disabled = false;
        botao.textContent = original;
        botao.removeAttribute("aria-busy");
    }
}

export function configurarFormulario(formulario) {
    formulario.addEventListener("input", (evento) => {
        const campo = evento.target;
        if (typeof campo.setCustomValidity === "function") campo.setCustomValidity("");
        campo.removeAttribute("aria-invalid");
    });
    formulario.addEventListener(
        "invalid",
        (evento) => evento.target.setAttribute("aria-invalid", "true"),
        true,
    );
}

export function erroCampo(campo, texto) {
    campo.setCustomValidity(texto);
    campo.setAttribute("aria-invalid", "true");
    campo.reportValidity();
}

export function erroFormulario(formulario, no, erro) {
    for (const [nome, texto] of Object.entries(erro.campos || {})) {
        const campo = formulario.elements.namedItem(nome);
        if (campo?.setCustomValidity && typeof texto === "string") {
            campo.setCustomValidity(texto);
            campo.setAttribute("aria-invalid", "true");
        }
    }
    mensagem(no, erro.message, "erro", true);
}

export function configurarSenhas() {
    document.querySelectorAll("[data-mostrar-senha]").forEach((botao) => {
        botao.addEventListener("click", () => {
            const campo = document.getElementById(botao.dataset.mostrarSenha);
            const mostrar = campo.type === "password";
            campo.type = mostrar ? "text" : "password";
            botao.textContent = mostrar ? "Ocultar" : "Mostrar";
            botao.setAttribute("aria-pressed", String(mostrar));
        });
    });
}

export function preencherCategorias(select, categorias, primeira = "Todos os materiais") {
    select.replaceChildren(new Option(primeira, ""));
    categorias.forEach((categoria) => select.add(new Option(categoria.nome, categoria.id)));
}

export function obterLocalizacao() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation)
            return reject(
                new Error(
                    "Seu navegador não oferece localização. Informe as coordenadas do local.",
                ),
            );
        navigator.geolocation.getCurrentPosition(
            ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
            (erro) =>
                reject(
                    new Error(
                        erro.code === 1
                            ? "Permissão de localização recusada. Você pode informar as coordenadas do local."
                            : "Não encontramos sua localização. Tente de novo ou informe as coordenadas do local.",
                    ),
                ),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
        );
    });
}

export function mostrarMapa(container, localizacao, titulo = "Localização selecionada") {
    const url = urlMapa(localizacao);
    container.replaceChildren();
    if (!url) {
        container.append(elemento("p", "Escolha um ponto para ver no mapa.", "mapa-vazio"));
        return;
    }
    const iframe = elemento("iframe");
    iframe.src = url;
    iframe.title = titulo;
    iframe.loading = "lazy";
    iframe.referrerPolicy = "no-referrer";
    container.append(iframe);
}
