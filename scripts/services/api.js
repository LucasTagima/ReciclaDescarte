import { CONFIG } from "../config.js";

export class ErroApi extends Error {
    constructor(mensagem, status = 0, campos = {}) {
        super(mensagem);
        this.name = "ErroApi";
        this.status = status;
        this.campos = campos && typeof campos === "object" ? campos : {};
    }
}

let tokenCsrf = null;
export function limparCsrf() {
    tokenCsrf = null;
}

async function requisitar(caminho, { metodo = "GET", corpo, headers = {} } = {}) {
    const controle = new AbortController();
    const timeout = setTimeout(() => controle.abort(), CONFIG.timeoutMs);
    const multipart = corpo instanceof FormData;
    const cabecalhos = { Accept: "application/json", ...headers };
    if (corpo !== undefined && !multipart) cabecalhos["Content-Type"] = "application/json";
    try {
        const resposta = await fetch(`${CONFIG.apiBase.replace(/\/$/, "")}${caminho}`, {
            method: metodo,
            headers: cabecalhos,
            credentials: "include",
            cache: "no-store",
            signal: controle.signal,
            ...(corpo !== undefined ? { body: multipart ? corpo : JSON.stringify(corpo) } : {}),
        });
        const json = resposta.headers.get("content-type")?.includes("application/json");
        const dados = resposta.status === 204 ? null : json ? await resposta.json() : null;
        if (!resposta.ok) {
            const mensagens = {
                401: "Sessão ausente ou expirada. Entre novamente.",
                403: "Você não tem permissão para esta ação.",
                404: "Este recurso não está disponível.",
                409: "O registro foi alterado. Atualize a lista e tente novamente.",
                413: "O arquivo excede o tamanho permitido.",
                429: "Muitas tentativas. Aguarde um pouco e tente novamente.",
            };
            const mensagem =
                typeof dados?.erro?.mensagem === "string"
                    ? dados.erro.mensagem
                    : mensagens[resposta.status] ||
                      "O serviço não conseguiu concluir a operação. Tente novamente.";
            throw new ErroApi(mensagem, resposta.status, dados?.erro?.campos);
        }
        if (resposta.status !== 204 && (!json || !dados || !Object.hasOwn(dados, "dados"))) {
            throw new ErroApi(
                "O serviço respondeu em um formato inesperado. Verifique a conexão com a aplicação.",
                resposta.status,
            );
        }
        return dados?.dados ?? null;
    } catch (erro) {
        if (erro instanceof ErroApi) throw erro;
        throw new ErroApi(
            erro.name === "AbortError"
                ? "O serviço demorou para responder. Tente novamente."
                : "Não foi possível conectar ao serviço. Tente novamente mais tarde.",
        );
    } finally {
        clearTimeout(timeout);
    }
}

export async function api(caminho, opcoes = {}) {
    const metodo = opcoes.metodo || "GET";
    if (!["GET", "HEAD"].includes(metodo)) {
        if (!tokenCsrf) {
            const dados = await requisitar("/auth/csrf");
            if (typeof dados?.csrf_token !== "string" || !dados.csrf_token) {
                throw new ErroApi("Não foi possível validar a sessão. Recarregue a página.");
            }
            tokenCsrf = dados.csrf_token;
        }
        try {
            return await requisitar(caminho, {
                ...opcoes,
                headers: { ...opcoes.headers, "X-CSRF-Token": tokenCsrf },
            });
        } catch (erro) {
            if ([401, 403].includes(erro.status)) limparCsrf();
            throw erro;
        }
    }
    return requisitar(caminho, opcoes);
}
