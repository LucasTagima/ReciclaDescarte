// Uma falha ou dado antigo no navegador não deve derrubar a interface.
export function lerJson(storage, chave, padrao = null) {
    try {
        const valor = storage.getItem(chave);
        return valor === null ? padrao : JSON.parse(valor);
    } catch {
        return padrao;
    }
}

export function gravarJson(storage, chave, valor) {
    try {
        storage.setItem(chave, JSON.stringify(valor));
    } catch {
        throw new Error(
            "Não foi possível salvar neste navegador. Verifique o espaço disponível e a permissão de armazenamento.",
        );
    }
}

export function remover(storage, chave) {
    try {
        storage.removeItem(chave);
        return true;
    } catch {
        return false;
    }
}

export function armazenamento(tipo = "localStorage") {
    try {
        return window[tipo];
    } catch {
        return null;
    }
}
