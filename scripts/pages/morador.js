import { listarChamados } from "../services/coletas.js";
import { renderizarChamados } from "../components/chamados.js";
import { mensagem, ocupado } from "../utils/ui.js";

export async function iniciar({ usuario }) {
    document.getElementById("saudacao").textContent = `Olá, ${usuario.nome.split(" ")[0]}!`;
    const aviso = document.getElementById("mensagem-lista");
    async function carregar() {
        mensagem(aviso, "Carregando suas solicitações…");
        try {
            const chamados = await listarChamados();
            document.getElementById("total-pendentes").textContent = chamados.filter(
                (item) => item.status === "pendente",
            ).length;
            document.getElementById("total-andamento").textContent = chamados.filter(
                (item) => item.status === "em_andamento",
            ).length;
            document.getElementById("total-concluidas").textContent = chamados.filter(
                (item) => item.status === "concluido",
            ).length;
            document.getElementById("total-solicitacoes").textContent = chamados.length;
            const recentes = [...chamados]
                .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em))
                .slice(0, 3);
            renderizarChamados(document.getElementById("lista-recentes"), recentes, {
                usuario,
                vazio: "Você ainda não fez um pedido. Use “Nova solicitação” para começar.",
            });
            mensagem(aviso);
        } catch (erro) {
            mensagem(aviso, erro.message, "erro");
        }
    }
    document
        .getElementById("atualizar-lista")
        .addEventListener("click", (evento) => ocupado(evento.currentTarget, carregar));
    await carregar();
}
