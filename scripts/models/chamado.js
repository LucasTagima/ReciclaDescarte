export const STATUS = Object.freeze({
    pendente: "Pendente",
    em_andamento: "Em andamento",
    concluido: "Concluído",
});

export class Chamado {
    constructor(dados) {
        if (
            !dados ||
            dados.id == null ||
            !Object.hasOwn(STATUS, dados.status) ||
            !dados.categoria?.nome
        ) {
            throw new Error("A lista de solicitações contém um registro inválido.");
        }
        Object.assign(this, dados);
        this.id = String(dados.id);
        this.categoria = { ...dados.categoria, id: String(dados.categoria.id) };
    }

    get rotuloStatus() {
        return STATUS[this.status];
    }
    podeAceitar(usuario) {
        return usuario?.tipo === "cooperativa" && this.status === "pendente";
    }
    podeConcluir(usuario) {
        return (
            usuario?.tipo === "cooperativa" &&
            this.status === "em_andamento" &&
            String(this.cooperativa_id) === String(usuario.id)
        );
    }
}
