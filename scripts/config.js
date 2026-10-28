// Único ponto de configuração da conexão. Configurado.
export const CONFIG = Object.freeze({
    apiBase: "http://127.0.0.1:5000/api",
    timeoutMs: 15000,
    fotoMaxBytes: 5 * 1024 * 1024,
    fotoDemoMaxBytes: 400 * 1024,
    tiposFoto: ["image/jpeg", "image/png", "image/webp"],
});

// Apenas a demonstração usa este catálogo; o modo conectado consulta GET /categorias.
export const CATEGORIAS_DEMO = Object.freeze([
    { id: "1", nome: "Plástico", icone: "plastico" },
    { id: "2", nome: "Papel / papelão", icone: "papel" },
    { id: "3", nome: "Vidro", icone: "vidro" },
    { id: "4", nome: "Metal", icone: "metal" },
    { id: "5", nome: "Eletrônicos", icone: "eletronicos" },
    { id: "6", nome: "Óleo de cozinha", icone: "residuos-especiais" },
    { id: "7", nome: "Volumosos", icone: "residuos-especiais" },
]);

export const ICONES_MATERIAL = new Set([
    "plastico",
    "papel",
    "vidro",
    "metal",
    "eletronicos",
    "organicos",
    "residuos-especiais",
]);
