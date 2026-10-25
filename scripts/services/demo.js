import { CATEGORIAS_DEMO } from "../config.js";
import { armazenamento, lerJson, gravarJson, remover } from "./storage.js";

const CHAVE_SESSAO = "recicladescarte:demo:sessao:v1";
const CHAVE_DADOS = "recicladescarte:demo:chamados:v1";
const USUARIOS = Object.freeze({
    morador: {
        id: "demo-morador",
        nome: "Morador de exemplo",
        tipo: "morador",
        email: "morador@example.com",
    },
    cooperativa: {
        id: "demo-cooperativa",
        nome: "Cooperativa de exemplo",
        tipo: "cooperativa",
        email: "cooperativa@example.com",
    },
});

export function usuarioDemo() {
    const tipo = lerJson(armazenamento("sessionStorage"), CHAVE_SESSAO);
    return Object.hasOwn(USUARIOS, tipo) ? { ...USUARIOS[tipo] } : null;
}

export function entrarDemo(tipo) {
    if (!Object.hasOwn(USUARIOS, tipo)) throw new Error("Selecione um perfil de demonstração.");
    gravarJson(armazenamento("sessionStorage"), CHAVE_SESSAO, tipo);
    return { ...USUARIOS[tipo] };
}

export function sairDemo() {
    remover(armazenamento("sessionStorage"), CHAVE_SESSAO);
}

function exemplos() {
    const agora = Date.now();
    const foto = new URL("../../imagens/monitor_folha.png", import.meta.url).href;
    return [
        ["eletronicos", "5", 4.5, "pendente", -22.9056, -47.0608, "Centro", "demo-morador"],
        ["papel", "2", 8, "pendente", -22.8976, -47.0497, "Cambuí", "demo-outro"],
        ["metal", "4", 3, "em_andamento", -22.9124, -47.0678, "Botafogo", "demo-morador"],
        ["plastico", "1", 2.5, "concluido", -22.9085, -47.0587, "Centro", "demo-morador"],
    ].map(([nome, categoria, peso, status, latitude, longitude, bairro, morador], indice) => ({
        id: `exemplo-${indice + 1}`,
        morador_id: morador,
        categoria: CATEGORIAS_DEMO.find((item) => item.id === categoria),
        peso_kg: peso,
        status,
        criado_em: new Date(
            agora - (status === "concluido" ? 3 * 86400000 : (indice + 1) * 3600000),
        ).toISOString(),
        data_preferida: new Date(
            agora + (status === "concluido" ? -86400000 : (indice + 1) * 86400000),
        ).toISOString(),
        concluido_em: status === "concluido" ? new Date(agora - 3600000).toISOString() : null,
        cooperativa_id: status === "pendente" ? null : "demo-cooperativa",
        cooperativa_nome: status === "pendente" ? null : USUARIOS.cooperativa.nome,
        endereco: {
            logradouro: "Endereço ilustrativo",
            numero: String(indice + 1),
            complemento: "",
            bairro,
            cidade: "Campinas",
            uf: "SP",
            cep: "",
        },
        localizacao: { latitude, longitude },
        observacoes: `Exemplo de ${nome}. Dados fictícios para testar o fluxo.`,
        foto_url: foto,
    }));
}

function lerChamados() {
    const salvo = lerJson(armazenamento(), CHAVE_DADOS);
    if (Array.isArray(salvo)) return salvo;
    const inicial = exemplos();
    gravarJson(armazenamento(), CHAVE_DADOS, inicial);
    return inicial;
}

export function listarDemo(visao) {
    const usuario = usuarioDemo();
    if (!usuario) throw new Error("Entre na demonstração para continuar.");
    return lerChamados().filter((item) =>
        visao === "radar"
            ? usuario.tipo === "cooperativa" && item.status === "pendente"
            : usuario.tipo === "morador"
              ? item.morador_id === usuario.id
              : item.cooperativa_id === usuario.id,
    );
}

export async function criarDemo(dados, foto) {
    const usuario = usuarioDemo();
    if (usuario?.tipo !== "morador")
        throw new Error("Somente o perfil de morador pode solicitar uma coleta.");
    const fotoUrl = await new Promise((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onload = () => resolve(leitor.result);
        leitor.onerror = () =>
            reject(new Error("Não foi possível ler a foto. Selecione outro arquivo."));
        leitor.readAsDataURL(foto);
    });
    const chamado = {
        ...dados,
        id: crypto.randomUUID(),
        morador_id: usuario.id,
        status: "pendente",
        categoria: CATEGORIAS_DEMO.find((categoria) => categoria.id === dados.categoria_id),
        criado_em: new Date().toISOString(),
        cooperativa_id: null,
        cooperativa_nome: null,
        concluido_em: null,
        foto_url: fotoUrl,
    };
    const lista = lerChamados();
    lista.unshift(chamado);
    gravarJson(armazenamento(), CHAVE_DADOS, lista);
    return chamado;
}

export async function atualizarDemo(id, acao) {
    const alterar = () => {
        const usuario = usuarioDemo();
        const lista = lerChamados();
        const chamado = lista.find((item) => String(item.id) === String(id));
        if (!chamado || usuario?.tipo !== "cooperativa")
            throw new Error("Solicitação indisponível para este perfil.");
        if (acao === "aceitar" && chamado.status === "pendente") {
            chamado.status = "em_andamento";
            chamado.cooperativa_id = usuario.id;
            chamado.cooperativa_nome = usuario.nome;
        } else if (
            acao === "concluir" &&
            chamado.status === "em_andamento" &&
            chamado.cooperativa_id === usuario.id
        ) {
            chamado.status = "concluido";
            chamado.concluido_em = new Date().toISOString();
        } else {
            throw new Error("Esta solicitação já mudou de situação. Atualize a lista.");
        }
        gravarJson(armazenamento(), CHAVE_DADOS, lista);
        return chamado;
    };
    // Evita sobreposição em abas da demonstração quando Web Locks está disponível.
    return navigator.locks ? navigator.locks.request(CHAVE_DADOS, alterar) : alterar();
}

export function reiniciarDemo() {
    gravarJson(armazenamento(), CHAVE_DADOS, exemplos());
}
