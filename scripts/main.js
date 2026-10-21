class Chamado {
    constructor(morador, material, peso, dataHora, observacoes, nomeFoto, latitude, longitude, endereco) {
        this.id = Date.now(); // Gera um ID único baseado no timestamp
        this.morador = morador || "Mariana Silva";
        this.material = material;
        this.peso = parseFloat(peso).toFixed(1);
        this.dataHora = dataHora;
        this.observacoes = observacoes;
        this.nomeFoto = nomeFoto;
        this.latitude = latitude;
        this.longitude = longitude;
        this.endereco = endereco || "Rua dos Pinheiros, 450 - Ap 72B";
        this.distancia = "0.8 km";
        this.status = "Pendente"; // Estados: Pendente -> Em Andamento -> Concluído
        this.criadoEm = "Agora mesmo";
    }

    aceitarColeta(cooperativa) {
        if (this.status !== "Pendente") {
            return false;
        }
        this.status = "Em Andamento";
        this.cooperativaResponsavel = cooperativa;
        return true;
    }
}

const StorageService = {
    CHAVE_CHAMADOS: "recicladescarte_chamados",
    CHAVE_TOKEN: "recicladescarte_jwt_token",
    CHAVE_USUARIO: "recicladescarte_usuario",

    obterChamados() {
        const dados = localStorage.getItem(this.CHAVE_CHAMADOS);
        return dados ? JSON.parse(dados) : [];
    },

    salvarChamado(novoChamado) {
        const lista = this.obterChamados();
        lista.unshift(novoChamado); // Adiciona no topo da lista
        localStorage.setItem(this.CHAVE_CHAMADOS, JSON.stringify(lista));
    },

    atualizarStatusChamado(id, novoStatus) {
        const lista = this.obterChamados();
        const index = lista.findIndex(item => String(item.id) === String(id));
        if (index !== -1) {
            lista[index].status = novoStatus;
            localStorage.setItem(this.CHAVE_CHAMADOS, JSON.stringify(lista));
        }
    },

    gerarTokenJWT(email, perfil) {
        // Estrutura didática de um JSON Web Token (Header.Payload.Signature - Aula 15)
        const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
        const payload = btoa(JSON.stringify({
            sub: email,
            role: perfil,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24) // Expira em 24h
        }));
        const signature = btoa("recicladescarte_secret_key_2026");
        const token = `${header}.${payload}.${signature}`;

        localStorage.setItem(this.CHAVE_TOKEN, token);
        localStorage.setItem(this.CHAVE_USUARIO, JSON.stringify({ email, perfil }));
        return token;
    },

    obterTokenJWT() {
        return localStorage.getItem(this.CHAVE_TOKEN);
    }
};

const ApiService = {
    URL_BASE: "http://localhost:5000/api",

    async enviarRequisicao(endpoint, metodo = "GET", corpo = null) {
        const token = StorageService.obterTokenJWT();
        const opcoes = {
            method: metodo,
            headers: {
                "Content-Type": "application/json",
                ...(token ? { "Authorization": `Bearer ${token}` } : {})
            }
        };

        if (corpo) {
            opcoes.body = JSON.stringify(corpo);
        }

        try {
            const resposta = await fetch(`${this.URL_BASE}${endpoint}`, opcoes);
            if (!resposta.ok) throw new Error("API offline ou erro na requisição");
            return await resposta.json();
        } catch (erro) {
            // Fallback silencioso para manter o MVP funcionando via LocalStorage enquanto o Python não está rodando
            console.info(`[Modo Local/Offline] Operação registrada no navegador (${endpoint}).`);
            return null;
        }
    }
};

document.addEventListener("DOMContentLoaded", () => {
    inicializarMenusMobile();
    inicializarTelaLoginECadastro();
    inicializarTelaSolicitacao();
    inicializarTelaRadarCooperativa();
});

function inicializarMenusMobile() {
    const btnMenuMobile = document.querySelector(".botao-menu-mobile");
    const menuDropdown = document.querySelector(".menu-mobile-dropdown");
    const btnSanduiche = document.querySelector(".btn-sanduiche");
    const overlayMenu = document.getElementById("overlay-menu");

    if (btnMenuMobile && menuDropdown) {
        btnMenuMobile.addEventListener("click", () => {
            menuDropdown.classList.toggle("ativo");
        });
    }

    if (btnSanduiche) {
        btnSanduiche.addEventListener("click", () => {
            if (overlayMenu) {
                overlayMenu.hidden = !overlayMenu.hidden;
            }
            if (menuDropdown) {
                menuDropdown.classList.toggle("ativo");
            }
        });
    }

    if (overlayMenu) {
        overlayMenu.addEventListener("click", (evento) => {
            if (evento.target === overlayMenu) {
                overlayMenu.hidden = true;
            }
        });
    }
}

function inicializarTelaLoginECadastro() {
    const iconeOlho = document.querySelector(".icone-olho");
    const inputSenha = document.getElementById("senha");

    if (iconeOlho && inputSenha) {
        iconeOlho.addEventListener("click", () => {
            const tipoAtual = inputSenha.getAttribute("type");
            inputSenha.setAttribute("type", tipoAtual === "password" ? "text" : "password");
        });
    }

    const formLogin = document.querySelector(".tela-login form, .login-form");
    if (formLogin) {
        formLogin.addEventListener("submit", async (evento) => {
            evento.preventDefault();

            const email = document.getElementById("email")?.value.trim();
            const senha = document.getElementById("senha")?.value.trim();

            if (!email || !senha) {
                alert("Por favor, preencha o e-mail e a senha.");
                return;
            }

            const perfil = email.toLowerCase().includes("coop") ? "cooperativa" : "morador";
            StorageService.gerarTokenJWT(email, perfil);

            await ApiService.enviarRequisicao("/login", "POST", { email, senha });

            if (perfil === "cooperativa") {
                window.location.href = "radar_cooperativa.html";
            } else {
                window.location.href = "dash_morador.html";
            }
        });
    }
}

function inicializarTelaSolicitacao() {
    const telaSolicitacao = document.querySelector(".tela-solicitacao");
    if (!telaSolicitacao) return;

    const formSolicitacao = telaSolicitacao.querySelector("form");
    const textoEndereco = telaSolicitacao.querySelector(".endereco address span");
    let coordenadasAtuais = { latitude: -22.9056, longitude: -47.0608 }; // Padrão: Campinas-SP

    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            (posicao) => {
                coordenadasAtuais.latitude = posicao.coords.latitude.toFixed(6);
                coordenadasAtuais.longitude = posicao.coords.longitude.toFixed(6);

                if (textoEndereco) {
                    textoEndereco.textContent = `GPS Ativo (${coordenadasAtuais.latitude}, ${coordenadasAtuais.longitude})`;
                }
            },
            () => {
                console.warn("Permissão de GPS negada ou indisponível. Usando localização padrão do cadastro.");
            }
        );
    }

    if (formSolicitacao) {
        formSolicitacao.addEventListener("submit", async (evento) => {
            evento.preventDefault();

            const materialSelecionado = formSolicitacao.querySelector('input[name="material"]:checked');
            const labelMaterial = materialSelecionado
                ? formSolicitacao.querySelector(`label[for="${materialSelecionado.id}"] span`)?.textContent
                : "Plástico";

            const peso = document.getElementById("peso")?.value;
            const dataHora = document.getElementById("data-hora")?.value;
            const observacoes = document.getElementById("observacoes")?.value;
            const inputFoto = document.getElementById("foto");
            const nomeFoto = inputFoto?.files[0] ? inputFoto.files[0].name : "foto_residuo.jpg";
            const ruaEndereco = telaSolicitacao.querySelector(".endereco address strong")?.textContent;

            const novoChamado = new Chamado(
                "Mariana Silva",
                labelMaterial || materialSelecionado.value,
                peso,
                dataHora,
                observacoes,
                nomeFoto,
                coordenadasAtuais.latitude,
                coordenadasAtuais.longitude,
                ruaEndereco
            );

            StorageService.salvarChamado(novoChamado);
            await ApiService.enviarRequisicao("/chamados", "POST", novoChamado);

            alert(`Solicitação registrada com sucesso!\nMaterial: ${novoChamado.material} (${novoChamado.peso} kg)\nCoordenadas GPS: ${novoChamado.latitude}, ${novoChamado.longitude}`);
            window.location.href = "dash_morador.html";
        });
    }
}

function inicializarTelaRadarCooperativa() {
    const secaoRadar = document.querySelector(".radar, .radar-lista, .dashboard-radar");
    if (!secaoRadar) return;

    renderizarChamadosSalvosNoRadar();
    configurarBotoesAceitar();
    configurarFiltrosRadar();
}

function renderizarChamadosSalvosNoRadar() {
    const chamadosSalvos = StorageService.obterChamados();
    if (chamadosSalvos.length === 0) return;

    const containerLista = document.querySelector(".lista-chamados") || document.querySelector(".radar");
    const primeiroCardExistente = containerLista?.querySelector(".card-chamado, .chamado");

    if (!containerLista || !primeiroCardExistente) return;

    const usaClasseCardChamado = primeiroCardExistente.classList.contains("card-chamado");

    chamadosSalvos.forEach((chamado) => {
        const artigo = document.createElement("article");
        artigo.dataset.id = chamado.id;

        if (usaClasseCardChamado) {
            artigo.className = "card-chamado";
            artigo.innerHTML = `
                <div class="chamado-topo">
                    <div class="chamado-info">
                        <h3>${chamado.morador}</h3>
                        <span>${chamado.criadoEm}</span>
                    </div>
                    <div class="chamado-metricas">
                        <span class="tag-distancia">${chamado.distancia}</span>
                        <span class="tag-peso">${chamado.peso} kg</span>
                    </div>
                </div>
                <div class="chamado-tags">
                    <span class="tag-material verde">${chamado.material}</span>
                </div>
                <div class="chamado-endereco">
                    <span>📍</span> ${chamado.endereco} (GPS: ${chamado.latitude}, ${chamado.longitude})
                </div>
                <div class="chamado-rodape">
                    <span class="estimativa">Est. ${chamado.peso} kg de recicláveis</span>
                    <button type="button" class="btn-aceitar" ${chamado.status !== "Pendente" ? "disabled" : ""}>
                        ${chamado.status === "Pendente" ? "✓ Aceitar" : "Em Coleta"}
                    </button>
                </div>
            `;
        } else {
            artigo.className = "chamado";
            artigo.innerHTML = `
                <header>
                    <h3>${chamado.morador}</h3>
                    <p class="data"><small>${chamado.criadoEm}</small></p>
                    <ul class="metricas">
                        <li class="distancia">${chamado.distancia}</li>
                        <li class="peso">${chamado.peso} kg</li>
                    </ul>
                </header>
                <ul class="materiais">
                    <li class="tag tag-plastico">${chamado.material}</li>
                </ul>
                <p class="endereco"><img src="../imagens/map-pin.png" alt="Local"> ${chamado.endereco}</p>
                <footer>
                    <p class="estimativa">Est. ${chamado.peso} kg de recicláveis</p>
                    <button type="button" class="btn-aceitar" ${chamado.status !== "Pendente" ? "disabled" : ""}>
                        <img src="../imagens/check.png" alt=""> ${chamado.status === "Pendente" ? "Aceitar" : "Em Coleta"}
                    </button>
                </footer>
            `;
        }

        containerLista.insertBefore(artigo, primeiroCardExistente);
    });

    atualizarContadorPendentes(chamadosSalvos.filter(c => c.status === "Pendente").length);
}

function configurarBotoesAceitar() {
    const botoesAceitar = document.querySelectorAll(".btn-aceitar");

    botoesAceitar.forEach((botao) => {
        botao.addEventListener("click", async function () {
            if (this.disabled) return;

            const card = this.closest(".card-chamado, .chamado");
            const nomeMorador = card?.querySelector("h3")?.textContent || "Morador";
            const idChamado = card?.dataset.id;

            this.disabled = true;
            this.textContent = "✓ Coleta Aceita";
            this.style.backgroundColor = "#128A3E";
            this.style.cursor = "default";

            if (card) {
                card.style.borderColor = "#1BC059";
                card.style.backgroundColor = "#F0FDF4";
            }

            if (idChamado) {
                StorageService.atualizarStatusChamado(idChamado, "Em Andamento");
                await ApiService.enviarRequisicao(`/chamados/${idChamado}/aceitar`, "PUT", {
                    status: "Em Andamento"
                });
            }

            atualizarContadorPendentes(-1, true);
            alert(`Chamado de ${nomeMorador} aceito pela cooperativa! A rota foi reservada exclusivamente para sua equipe.`);
        });
    });
}

function atualizarContadorPendentes(valor, ehDecremento = false) {
    const badge = document.querySelector(".badge-pendentes, .pendentes");
    if (!badge) return;

    const numeroAtual = parseInt(badge.textContent.replace(/\D/g, ""), 10) || 12;
    const novoTotal = ehDecremento ? Math.max(0, numeroAtual + valor) : numeroAtual + valor;
    badge.textContent = `${novoTotal} chamados pendentes`;
}

function configurarFiltrosRadar() {
    const inputBusca = document.querySelector("#busca, .busca input");
    const selectMaterial = document.querySelector("#filtro-material, .filtros-radar select:first-child");

    function filtrarCards() {
        const termo = inputBusca ? inputBusca.value.toLowerCase().trim() : "";
        const materialFiltro = selectMaterial ? selectMaterial.value.toLowerCase() : "todos";
        const cards = document.querySelectorAll(".card-chamado, .chamado");

        cards.forEach((card) => {
            const textoCard = card.textContent.toLowerCase();
            const bateBusca = !termo || textoCard.includes(termo);
            const bateMaterial =
                materialFiltro === "todos" ||
                materialFiltro === "todos os materiais" ||
                textoCard.includes(materialFiltro);

            card.style.display = bateBusca && bateMaterial ? "" : "none";
        });
    }

    if (inputBusca) {
        inputBusca.addEventListener("input", filtrarCards);
    }

    if (selectMaterial) {
        selectMaterial.addEventListener("change", filtrarCards);
    }
}