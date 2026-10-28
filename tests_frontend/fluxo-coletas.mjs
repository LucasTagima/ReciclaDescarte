// Teste isolado: API Flask real, repositórios em memória, sem acesso ao MySQL do usuário.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";

const require = createRequire(import.meta.url);
const { chromium, request } = require("playwright");
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const python =
    process.env.COLETAS_PYTHON ||
    (process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python");
const processo = spawn(python, [path.join(raiz, "tests_frontend/servidor_teste.py")], {
    cwd: raiz,
    stdio: ["ignore", "pipe", "pipe"],
});
let errosServidor = "";
processo.stderr.on("data", (texto) => {
    errosServidor += texto;
});
const enderecos = await new Promise((resolve, reject) => {
    let saida = "";
    const tempo = setTimeout(
        () => reject(new Error(`Servidor de teste não iniciou. ${errosServidor}`)),
        15000,
    );
    processo.on("error", (erro) => {
        clearTimeout(tempo);
        reject(erro);
    });
    processo.on("exit", (codigo) => {
        clearTimeout(tempo);
        reject(new Error(`Servidor encerrou: ${codigo}. ${errosServidor}`));
    });
    processo.stdout.on("data", (texto) => {
        saida += texto;
        if (saida.includes("\n")) {
            clearTimeout(tempo);
            resolve(JSON.parse(saida.split("\n")[0]));
        }
    });
});

const errosPaginas = [];
const casos = [];
let navegador;
const registrar = (nome) => {
    casos.push(nome);
    console.log(`OK: ${nome}`);
};
const endereco = (pagina) => `${enderecos.front}/pages/${pagina}.html`;
const api = (rota) => `${enderecos.api}/api${rota}`;
const esperaResposta = (pagina, rota) =>
    pagina.waitForResponse(
        (resposta) => resposta.url() === api(rota) && resposta.request().method() === "POST",
    );

async function contexto() {
    const contexto = await navegador.newContext({
        viewport: { width: 1280, height: 900 },
        geolocation: { latitude: -22.9056, longitude: -47.0608 },
        permissions: ["geolocation"],
        locale: "pt-BR",
    });
    await contexto.route("**/*", async (rota) => {
        if (new URL(rota.request().url()).hostname !== "127.0.0.1") {
            await rota.fulfill({
                status: 200,
                contentType: "text/html",
                body: "<!DOCTYPE html><html lang='pt-BR'><body>Mapa simulado para o teste.</body></html>",
            });
        } else await rota.continue();
    });
    const pagina = await contexto.newPage();
    pagina.on("pageerror", (erro) => errosPaginas.push(erro.message));
    pagina.setDefaultTimeout(10000);
    return { contexto, pagina };
}

async function cadastrar(pagina, email, tipo, nome) {
    await pagina.goto(endereco("cadastro"));
    await pagina.locator('[name="nome"]').fill(nome);
    await pagina.locator('[name="email"]').fill(email);
    await pagina.locator('[name="telefone"]').fill("19999991234");
    await pagina.locator(`input[name="tipo"][value="${tipo}"]`).check();
    await pagina.locator('[name="senha"]').fill("Senha de teste 123");
    await pagina.locator('[name="confirmar_senha"]').fill("Senha de teste 123");
    const resposta = esperaResposta(pagina, "/auth/cadastro");
    await pagina.locator('#form-cadastro [type="submit"]').click();
    assert.equal((await resposta).status(), 201);
    await pagina.waitForURL(/entrar\.html\?cadastro=ok/);
    await pagina.locator('[name="email"]').fill(email);
    await pagina.locator('[name="senha"]').fill("Senha de teste 123");
    await pagina.locator('#form-entrar [type="submit"]').click();
    await pagina.waitForURL(tipo === "morador" ? /dash_morador\.html/ : /radar_cooperativa\.html/);
    await pagina.locator("#conteudo:not([hidden])").waitFor();
}

async function preencher(pagina, rua, usarGps, numero = "") {
    await pagina.goto(endereco("solicitacao"));
    await pagina.locator('input[name="categoria_id"]').first().waitFor();
    assert.equal(
        await pagina
            .locator(
                '[name="peso_kg"], [name="data_preferida"], [name="observacoes"], [name="bairro"], [name="cidade"], [name="uf"], [name="cep"], [name="complemento"]',
            )
            .count(),
        0,
    );
    await pagina.locator('input[name="categoria_id"]').first().check();
    await pagina.locator('[name="logradouro"]').fill(rua);
    await pagina.locator('[name="numero"]').fill(numero);
    await pagina.locator('[name="foto"]').setInputFiles(path.join(raiz, "imagens/logo.png"));
    await pagina.locator("#previa-foto:not([hidden])").waitFor();
    if (usarGps) {
        await pagina.getByRole("button", { name: "Usar minha localização", exact: true }).click();
        await pagina.waitForFunction(
            () => document.querySelector('[name="latitude"]').value !== "",
        );
    } else {
        await pagina.locator("#coordenadas-manuais summary").click();
        await pagina.locator('[name="latitude"]').fill("-22.9056");
        await pagina.locator('[name="longitude"]').fill("-47.0608");
    }
    await pagina.locator('[name="confirmar_localizacao"]').check();
}

async function abrir(pagina, rua) {
    const card = rua
        ? pagina.locator(".card-coleta").filter({ hasText: rua })
        : pagina.locator(".card-coleta").first();
    await card.getByRole("button", { name: /Ver detalhes/ }).click();
    await pagina.locator("dialog[open]").waitFor();
}

async function confirmar(pagina, nome, rota, status = 200) {
    const dialogo = pagina.locator("dialog[open]");
    await dialogo.locator('input[type="checkbox"]').check();
    const resposta = esperaResposta(pagina, rota);
    await dialogo.getByRole("button", { name: nome, exact: true }).click();
    const resultado = await resposta;
    assert.equal(resultado.status(), status);
    return resultado.json();
}

try {
    const opcoes = { headless: true };
    if (process.env.COLETAS_CHROMIUM) opcoes.executablePath = process.env.COLETAS_CHROMIUM;
    navegador = await chromium.launch(opcoes);
    const morador = await contexto();
    const cooperativa = await contexto();
    const outra = await contexto();
    await cadastrar(morador.pagina, "morador.navegador@example.com", "morador", "Morador do teste");
    await cadastrar(
        cooperativa.pagina,
        "cooperativa.navegador@example.com",
        "cooperativa",
        "Cooperativa responsável",
    );
    await cadastrar(
        outra.pagina,
        "outra.navegador@example.com",
        "cooperativa",
        "Outra cooperativa",
    );
    registrar("Cadastros e logins pelos formulários com cookies e CSRF reais");

    const m = morador.pagina;
    await preencher(m, "Rua da Integração", true);
    assert.equal(await m.locator('[name="numero"]').getAttribute("required"), null);
    assert.equal(await m.locator('[name="categoria_id"]:checked').inputValue(), "17");
    const envio = esperaResposta(m, "/chamados");
    await m.locator('#form-solicitacao [type="submit"]').click();
    const resposta = await envio;
    assert.equal(resposta.status(), 201);
    await m.waitForURL(/coletas\.html/);
    await m.locator(".card-coleta").waitFor();
    const criado = (await (await morador.contexto.request.get(api("/chamados"))).json()).dados[0];
    assert.equal(criado.endereco.numero, null);
    assert.equal(Object.hasOwn(criado, "peso_kg"), false);
    registrar("Criação com categoria real 17, foto, GPS e número opcional");

    await abrir(m, "Rua da Integração");
    await m.waitForFunction(() => {
        const img = document.querySelector(".foto-detalhe");
        return img?.complete && img.naturalWidth > 0;
    });
    assert.ok((await m.locator(".foto-detalhe").getAttribute("src")).startsWith(enderecos.api));
    assert.equal(await m.locator(".foto-detalhe").getAttribute("crossorigin"), "use-credentials");
    const anonimo = await request.newContext();
    assert.equal((await anonimo.get(`${enderecos.api}${criado.foto_url}`)).status(), 401);
    await anonimo.dispose();
    await m.getByRole("button", { name: "Fechar", exact: true }).click();
    registrar("Foto carregada pela porta da API e bloqueada sem autenticação");

    const c = cooperativa.pagina;
    const o = outra.pagina;
    await o.goto(endereco("radar_cooperativa"));
    await abrir(o);
    await c.goto(endereco("radar_cooperativa"));
    const radar = (
        await (await cooperativa.contexto.request.get(api("/chamados?visao=radar"))).json()
    ).dados;
    assert.equal(radar[0].precisao_localizacao, "aproximada");
    assert.equal(Object.hasOwn(radar[0], "endereco"), false);
    assert.notEqual(radar[0].localizacao.latitude, -22.9056);
    await abrir(c);
    assert.equal((await c.locator("dialog").innerText()).includes("Rua da Integração"), false);
    const aceite = await confirmar(c, "Aceitar coleta", `/chamados/${criado.id}/aceitar`);
    assert.equal(aceite.dados.status, "em_andamento");
    assert.equal(aceite.dados.endereco.logradouro, "Rua da Integração");
    await c.locator("dialog").waitFor({ state: "detached" });
    assert.equal(await c.locator(".card-coleta").count(), 0);
    registrar("Radar com ponto aproximado e aceite com endereço liberado ao responsável");

    await confirmar(o, "Aceitar coleta", `/chamados/${criado.id}/aceitar`, 409);
    assert.ok((await o.locator("dialog").innerText()).includes("já foi assumida"));
    await o.getByRole("button", { name: "Fechar", exact: true }).click();
    registrar("Segundo aceite recusado com erro visível, sem falso sucesso");

    await c.goto(endereco("coletas"));
    await abrir(c, "Rua da Integração");
    const rota = await c.getByRole("link", { name: /Abrir rota/ }).getAttribute("href");
    assert.equal(new URL(rota).searchParams.get("destination"), "-22.9056,-47.0608");
    const concluido = await confirmar(c, "Concluir coleta", `/chamados/${criado.id}/concluir`);
    assert.equal(concluido.dados.status, "concluido");
    assert.ok(concluido.dados.aceito_em && concluido.dados.concluido_em);
    await c.locator("dialog").waitFor({ state: "detached" });
    assert.equal(await c.locator(".card-coleta .status").innerText(), "Concluído");
    assert.equal((await outra.contexto.request.get(api(`/chamados/${criado.id}`))).status(), 404);
    await m.goto(endereco("dash_morador"));
    await m.waitForFunction(() => document.getElementById("total-concluidas").textContent === "1");
    assert.equal(await m.locator("#total-solicitacoes").innerText(), "1");
    registrar("Conclusão, rota exata, restrição de acesso e indicadores atualizados");

    await preencher(m, "Rua da Tentativa", false, "120");
    const falha = async (rota) => {
        if (rota.request().method() === "POST")
            await rota.fulfill({
                status: 503,
                contentType: "application/json",
                headers: {
                    "Access-Control-Allow-Origin": enderecos.front,
                    "Access-Control-Allow-Credentials": "true",
                },
                body: JSON.stringify({
                    erro: { mensagem: "Falha simulada para conferir a recuperação." },
                }),
            });
        else await rota.continue();
    };
    await m.route(api("/chamados"), falha);
    await m.locator('#form-solicitacao [type="submit"]').click();
    await m.waitForFunction(() =>
        document.getElementById("mensagem-form").textContent.includes("Falha simulada"),
    );
    assert.equal(await m.locator('[name="logradouro"]').inputValue(), "Rua da Tentativa");
    assert.equal(
        (await (await morador.contexto.request.get(api("/chamados"))).json()).dados.length,
        1,
    );
    await m.unroute(api("/chamados"), falha);
    const reenvio = esperaResposta(m, "/chamados");
    await m.locator('#form-solicitacao [type="submit"]').click();
    assert.equal((await reenvio).status(), 201);
    await m.waitForURL(/coletas\.html/);
    await m.waitForFunction(() => document.querySelectorAll(".card-coleta").length === 2);
    await m.locator('[name="busca"]').fill("tentativa");
    assert.equal(await m.locator(".card-coleta").count(), 1);
    registrar("Coordenadas manuais, falha 503, preservação dos campos e reenvio");

    const demonstracao = await contexto();
    const d = demonstracao.pagina;
    let chamadasDemo = 0;
    d.on("request", (req) => {
        if (req.url().startsWith(enderecos.api)) chamadasDemo += 1;
    });
    await d.goto(endereco("entrar"));
    await d.locator('[data-entrar-demo="morador"]').click();
    await d.waitForURL(/dash_morador\.html/);
    await preencher(d, "Rua de demonstração", false, "15");
    await d.locator('#form-solicitacao [type="submit"]').click();
    await d.waitForURL(/coletas\.html/);
    await d.locator(".card-coleta").filter({ hasText: "Rua de demonstração" }).waitFor();
    await d.getByRole("button", { name: "Testar como cooperativa", exact: true }).click();
    await d.waitForURL(/radar_cooperativa\.html/);
    await abrir(d, "Rua de demonstração");
    await d.locator('dialog input[type="checkbox"]').check();
    await d.getByRole("button", { name: "Aceitar coleta", exact: true }).click();
    await d.locator("dialog").waitFor({ state: "detached" });
    await d.goto(endereco("coletas"));
    await abrir(d, "Rua de demonstração");
    await d.locator('dialog input[type="checkbox"]').check();
    await d.getByRole("button", { name: "Concluir coleta", exact: true }).click();
    await d.locator("dialog").waitFor({ state: "detached" });
    assert.equal(
        await d
            .locator(".card-coleta")
            .filter({ hasText: "Rua de demonstração" })
            .locator(".status")
            .innerText(),
        "Concluído",
    );
    assert.equal(chamadasDemo, 0);
    registrar("Demonstração continua independente e permite criar, aceitar e concluir");

    await d.getByRole("button", { name: "Testar como morador", exact: true }).click();
    await d.waitForURL(/dash_morador\.html/);
    for (const largura of [320, 390, 1280]) {
        await d.setViewportSize({ width: largura, height: 900 });
        await d.goto(endereco("solicitacao"));
        await d.locator('input[name="categoria_id"]').first().waitFor();
        assert.equal(
            await d.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
            true,
        );
        if (process.env.COLETAS_EVIDENCIAS) {
            await fs.mkdir(process.env.COLETAS_EVIDENCIAS, { recursive: true });
            await d.screenshot({
                path: path.join(process.env.COLETAS_EVIDENCIAS, `solicitacao-${largura}.png`),
                fullPage: true,
            });
        }
    }
    assert.deepEqual(errosPaginas, []);
    registrar("Formulário sem rolagem horizontal em 320, 390 e 1280 pixels");
    console.log(
        JSON.stringify({
            casos: casos.length,
            errosJavaScript: errosPaginas.length,
            banco: "repositórios de teste em memória; MySQL não utilizado",
        }),
    );
} finally {
    if (navegador) await navegador.close();
    processo.kill("SIGTERM");
}
