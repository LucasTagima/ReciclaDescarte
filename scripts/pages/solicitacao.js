import { CONFIG, ICONES_MATERIAL } from "../config.js";
import { obterCategorias, criarChamado } from "../services/coletas.js";
import { usuarioDemo } from "../services/demo.js";
import { obterPreferencias } from "../services/preferencias.js";
import { caminhoPagina } from "../services/auth.js";
import { coordenadasValidas } from "../utils/dados.js";
import {
    elemento,
    mensagem,
    ocupado,
    configurarFormulario,
    erroCampo,
    erroFormulario,
    obterLocalizacao,
    mostrarMapa,
} from "../utils/ui.js";

export async function iniciar() {
    const formulario = document.getElementById("form-solicitacao");
    const campos = formulario.elements;
    const aviso = document.getElementById("mensagem-form");
    const localAviso = document.getElementById("mensagem-localizacao");
    const botaoEnviar = document.getElementById("enviar-solicitacao");
    const grade = document.getElementById("categorias");
    const orientacoes = document.getElementById("orientacoes-material");
    configurarFormulario(formulario);
    const limiteFoto = usuarioDemo() ? CONFIG.fotoDemoMaxBytes : CONFIG.fotoMaxBytes;
    document.getElementById("ajuda-foto").textContent = usuarioDemo()
        ? "JPG, PNG ou WebP de até 400 KB. Na demonstração, use uma foto de exemplo."
        : "JPG, PNG ou WebP de até 5 MB. Fotografe só o material, sem rostos ou documentos.";

    async function carregarCategorias() {
        botaoEnviar.disabled = true;
        mensagem(aviso, "Carregando os materiais disponíveis…");
        try {
            const categorias = await obterCategorias();
            if (!categorias.length)
                throw new Error("Nenhum material está disponível para coleta no momento.");
            grade.replaceChildren();
            orientacoes.hidden = true;
            orientacoes.textContent = "";
            categorias.forEach((categoria, indice) => {
                const opcao = elemento("div", "", "opcao-material");
                const input = elemento("input");
                input.type = "radio";
                input.name = "categoria_id";
                input.value = categoria.id;
                input.id = `categoria-${indice}`;
                input.required = true;
                input.checked = categoria.id === obterPreferencias().categoriaPadrao;
                const orientar = () => {
                    orientacoes.textContent = [
                        categoria.perigo ? `Risco: ${categoria.perigo}.` : "",
                        categoria.instrucoes,
                    ]
                        .filter(Boolean)
                        .join(" ");
                    orientacoes.hidden = !orientacoes.textContent;
                };
                input.addEventListener("change", orientar);
                if (input.checked) orientar();
                const label = elemento("label");
                label.htmlFor = input.id;
                const icone = elemento("img");
                const nome = ICONES_MATERIAL.has(categoria.icone)
                    ? categoria.icone
                    : "residuos-especiais";
                icone.src = new URL(`../../icon/icon-${nome}.svg`, import.meta.url).href;
                icone.alt = "";
                icone.width = 30;
                icone.height = 30;
                label.append(icone, elemento("span", categoria.nome));
                opcao.append(input, label);
                grade.append(opcao);
            });
            botaoEnviar.disabled = false;
            mensagem(aviso);
            document.getElementById("recarregar-categorias").hidden = true;
        } catch (erro) {
            mensagem(aviso, erro.message, "erro");
            document.getElementById("recarregar-categorias").hidden = false;
        }
    }
    document
        .getElementById("recarregar-categorias")
        .addEventListener("click", (evento) => ocupado(evento.currentTarget, carregarCategorias));

    let fotoUrl = null;
    let fotoValida = false;
    let sequenciaFoto = 0;
    campos.foto.addEventListener("change", () => {
        const sequencia = ++sequenciaFoto;
        fotoValida = false;
        if (fotoUrl) URL.revokeObjectURL(fotoUrl);
        const previa = document.getElementById("previa-foto");
        previa.hidden = true;
        previa.removeAttribute("src");
        const arquivo = campos.foto.files[0];
        if (!arquivo) return;
        if (!CONFIG.tiposFoto.includes(arquivo.type))
            return erroCampo(campos.foto, "Selecione uma imagem JPG, PNG ou WebP.");
        if (arquivo.size > limiteFoto)
            return erroCampo(
                campos.foto,
                `A foto deve ter até ${usuarioDemo() ? "400 KB" : "5 MB"}.`,
            );
        if (!arquivo.size) return erroCampo(campos.foto, "O arquivo está vazio.");
        fotoUrl = URL.createObjectURL(arquivo);
        const imagem = new Image();
        imagem.onload = () => {
            if (sequencia !== sequenciaFoto) return;
            fotoValida = true;
            campos.foto.setCustomValidity("");
            campos.foto.removeAttribute("aria-invalid");
            previa.src = fotoUrl;
            previa.hidden = false;
        };
        imagem.onerror = () => {
            if (sequencia === sequenciaFoto)
                erroCampo(
                    campos.foto,
                    "Não foi possível abrir esta imagem. Selecione outro arquivo.",
                );
        };
        imagem.src = fotoUrl;
    });
    window.addEventListener("pagehide", () => {
        if (fotoUrl) URL.revokeObjectURL(fotoUrl);
    });

    function atualizarPonto() {
        const latitude = campos.latitude.valueAsNumber;
        const longitude = campos.longitude.valueAsNumber;
        mostrarMapa(
            document.getElementById("mapa-localizacao"),
            coordenadasValidas(latitude, longitude) ? { latitude, longitude } : null,
        );
    }
    [campos.latitude, campos.longitude].forEach((campo) => {
        campo.addEventListener("input", () => {
            campos.confirmar_localizacao.checked = false;
        });
        campo.addEventListener("change", atualizarPonto);
    });
    ["logradouro", "numero"].forEach((nome) =>
        campos[nome].addEventListener("input", () => {
            campos.confirmar_localizacao.checked = false;
        }),
    );
    document.getElementById("usar-localizacao").addEventListener("click", (evento) =>
        ocupado(
            evento.currentTarget,
            async () => {
                mensagem(localAviso, "Obtendo sua localização…");
                try {
                    const ponto = await obterLocalizacao();
                    campos.latitude.value = ponto.latitude.toFixed(6);
                    campos.longitude.value = ponto.longitude.toFixed(6);
                    campos.confirmar_localizacao.checked = false;
                    campos.latitude.setCustomValidity("");
                    campos.longitude.setCustomValidity("");
                    atualizarPonto();
                    mensagem(
                        localAviso,
                        "Encontramos sua localização. Confira se é nesse endereço que a coleta deve acontecer.",
                        "sucesso",
                    );
                } catch (erro) {
                    document.getElementById("coordenadas-manuais").open = true;
                    mensagem(localAviso, erro.message, "erro");
                }
            },
            "Localizando…",
        ),
    );
    formulario.addEventListener(
        "invalid",
        (evento) => {
            if (["latitude", "longitude"].includes(evento.target.name))
                document.getElementById("coordenadas-manuais").open = true;
        },
        true,
    );

    formulario.addEventListener("submit", (evento) => {
        evento.preventDefault();
        if (!fotoValida)
            return erroCampo(
                campos.foto,
                "Espere a foto aparecer antes de enviar. Se ela não carregar, escolha outra imagem.",
            );
        const localizacao = {
            latitude: campos.latitude.valueAsNumber,
            longitude: campos.longitude.valueAsNumber,
        };
        if (!coordenadasValidas(localizacao.latitude, localizacao.longitude))
            return erroCampo(campos.latitude, "Informe um ponto válido.");
        if (!campos.logradouro.value.trim())
            return erroCampo(campos.logradouro, "Informe a rua ou avenida.");
        const dados = {
            categoria_id: campos.categoria_id.value,
            endereco: {
                logradouro: campos.logradouro.value.trim(),
                numero: campos.numero.value.trim(),
            },
            localizacao,
        };
        ocupado(
            botaoEnviar,
            async () => {
                mensagem(aviso);
                try {
                    await criarChamado(dados, campos.foto.files[0]);
                    location.assign(`${caminhoPagina("coletas.html")}?criada=1`);
                } catch (erro) {
                    erroFormulario(formulario, aviso, erro);
                }
            },
            "Enviando solicitação…",
        );
    });
    await carregarCategorias();
}
