import test from "node:test";
import assert from "node:assert/strict";
import { Chamado } from "../scripts/models/chamado.js";
import { filtrarChamados, formatarData, distanciaKm } from "../scripts/utils/dados.js";
import { normalizarPreferencias } from "../scripts/services/preferencias.js";
import { listarChamados, criarChamado, atualizarChamado } from "../scripts/services/coletas.js";
import { limparCsrf } from "../scripts/services/api.js";
import { CONFIG } from "../scripts/config.js";

const dados = (extra = {}) => ({
    id: "42",
    categoria: { id: "17", nome: "Papel" },
    status: "pendente",
    criado_em: "2026-10-26T12:00:00Z",
    endereco: { logradouro: "Rua São João", numero: "120" },
    localizacao: { latitude: -22.9056, longitude: -47.0608 },
    ...extra,
});

function responder(valor, status = 200) {
    return new Response(JSON.stringify(valor), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

function simularFetch(t, tarefa) {
    const anterior = globalThis.fetch;
    const localAnterior = globalThis.location;
    globalThis.location = { href: "http://127.0.0.1:5500/pages/coletas.html" };
    globalThis.fetch = tarefa;
    limparCsrf();
    t.after(() => {
        globalThis.fetch = anterior;
        globalThis.location = localAnterior;
        limparCsrf();
    });
}

test("Lê um chamado real sem exigir peso ou data de preferência", () => {
    const chamado = new Chamado(dados());
    assert.equal(chamado.id, "42");
    assert.equal(chamado.rotuloStatus, "Pendente");
    assert.equal(chamado.peso_kg, undefined);
    assert.equal(chamado.data_preferida, undefined);
});

test("Oferece ações somente para o perfil e o responsável corretos", () => {
    const chamado = new Chamado(dados());
    assert.equal(chamado.podeAceitar({ id: "8", tipo: "morador" }), false);
    assert.equal(chamado.podeAceitar({ id: "8", tipo: "cooperativa" }), true);
    const aceito = new Chamado(dados({ status: "em_andamento", cooperativa_id: "8" }));
    assert.equal(aceito.podeAceitar({ id: "8", tipo: "cooperativa" }), false);
    assert.equal(aceito.podeConcluir({ id: "8", tipo: "cooperativa" }), true);
    assert.equal(aceito.podeConcluir({ id: "9", tipo: "cooperativa" }), false);
});

test("Busca pela rua sem acentos, pelo número e pelo identificador", () => {
    const lista = [new Chamado(dados())];
    for (const texto of ["sao joao", "120", "42", "papel"]) {
        assert.equal(filtrarChamados(lista, { texto }).length, 1);
    }
    assert.equal(filtrarChamados(lista, { texto: "bairro inexistente" }).length, 0);
});

test("Ordena pela criação e mantém registros sem data ao final", () => {
    const antigo = new Chamado(dados({ id: "1", criado_em: "2026-10-24T12:00:00Z" }));
    const recente = new Chamado(dados({ id: "2" }));
    const semData = new Chamado(dados({ id: "3", criado_em: null }));
    const lista = [semData, antigo, recente];
    assert.deepEqual(
        filtrarChamados(lista).map((item) => item.id),
        ["2", "1", "3"],
    );
    assert.deepEqual(
        filtrarChamados(lista, { ordem: "antigos" }).map((item) => item.id),
        ["1", "2", "3"],
    );
    assert.equal(lista[0], semData);
    const mesmoSegundo = new Chamado(dados({ id: "10" }));
    assert.deepEqual(
        filtrarChamados([recente, mesmoSegundo]).map((item) => item.id),
        ["10", "2"],
    );
});

test("Filtra a distância somente quando existe uma localização válida", () => {
    const lista = [new Chamado(dados())];
    assert.equal(filtrarChamados(lista, { raio: "5" }).length, 0);
    const origem = lista[0].localizacao;
    assert.equal(filtrarChamados(lista, { raio: "5", origem }).length, 1);
    assert.equal(distanciaKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0 }), 0);
});

test("Não apresenta datas nulas como se fossem de 1970", () => {
    for (const valor of [null, undefined, "", "data inválida"]) {
        assert.equal(formatarData(valor), "Não informado");
    }
});

test("Normaliza a preferência antiga de agendamento para uma opção disponível", () => {
    assert.equal(normalizarPreferencias({ ordemPadrao: "agendamento" }).ordemPadrao, "recentes");
    assert.equal(normalizarPreferencias({ ordemPadrao: "antigos" }).ordemPadrao, "antigos");
});

test("Resolve a referência protegida da foto e recusa uma URL externa", async (t) => {
    const foto = `/api/fotos/${"a".repeat(48)}.jpg`;
    simularFetch(t, async (url, opcoes) => {
        const destino = new URL(url, location.href);
        assert.equal(destino.pathname, "/api/chamados");
        assert.equal(destino.searchParams.get("visao"), "minhas");
        assert.equal(opcoes.credentials, "include");
        return responder({
            dados: [
                dados({ foto_url: foto }),
                dados({ id: "43", foto_url: "https://outro.example/foto.jpg" }),
            ],
        });
    });
    const lista = await listarChamados();
    assert.equal(lista[0].foto_url, new URL(foto, new URL(CONFIG.apiBase, location.href)).href);
    assert.equal(lista[1].foto_url, null);
});

test("Envia criação em multipart com CSRF e cookies, sem fixar o boundary", async (t) => {
    const entrada = {
        categoria_id: "17",
        endereco: { logradouro: "Rua de teste", numero: "" },
        localizacao: { latitude: -22.9056, longitude: -47.0608 },
    };
    let envios = 0;
    simularFetch(t, async (url, opcoes) => {
        if (new URL(url, location.href).pathname === "/api/auth/csrf")
            return responder({ dados: { csrf_token: "token-de-teste" } });
        envios += 1;
        assert.equal(new URL(url, location.href).pathname, "/api/chamados");
        assert.equal(opcoes.method, "POST");
        assert.equal(opcoes.credentials, "include");
        assert.equal(opcoes.headers["X-CSRF-Token"], "token-de-teste");
        assert.equal(opcoes.headers["Content-Type"], undefined);
        assert.ok(opcoes.body instanceof FormData);
        assert.deepEqual(JSON.parse(opcoes.body.get("dados")), entrada);
        assert.ok(opcoes.body.get("foto") instanceof Blob);
        return responder({ dados: dados() }, 201);
    });
    const chamado = await criarChamado(
        entrada,
        new Blob(["imagem de teste"], { type: "image/png" }),
    );
    assert.equal(chamado.id, "42");
    assert.equal(envios, 1);
});

test("Envia o aceite sem corpo e lê o chamado retornado pela API", async (t) => {
    simularFetch(t, async (url, opcoes) => {
        if (new URL(url, location.href).pathname === "/api/auth/csrf")
            return responder({ dados: { csrf_token: "token-de-teste" } });
        assert.equal(new URL(url, location.href).pathname, "/api/chamados/42/aceitar");
        assert.equal(opcoes.method, "POST");
        assert.equal(opcoes.body, undefined);
        return responder({ dados: dados({ status: "em_andamento", cooperativa_id: "8" }) });
    });
    const chamado = await atualizarChamado("42", "aceitar");
    assert.equal(chamado.status, "em_andamento");
    assert.equal(chamado.podeConcluir({ id: "8", tipo: "cooperativa" }), true);
});

test("Mantém um erro de rede visível sem transformar a operação em demonstração", async (t) => {
    simularFetch(t, async () =>
        responder({ erro: { mensagem: "Serviço indisponível para o teste." } }, 503),
    );
    await assert.rejects(listarChamados(), /Serviço indisponível para o teste/);
});
