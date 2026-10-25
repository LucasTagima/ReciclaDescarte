export function coordenadasValidas(latitude, longitude) {
    return (
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        latitude >= -90 &&
        latitude <= 90 &&
        longitude >= -180 &&
        longitude <= 180
    );
}

export function distanciaKm(origem, destino) {
    if (
        !origem ||
        !destino ||
        !coordenadasValidas(origem.latitude, origem.longitude) ||
        !coordenadasValidas(destino.latitude, destino.longitude)
    )
        return null;
    const rad = (graus) => (graus * Math.PI) / 180;
    const dLat = rad(destino.latitude - origem.latitude);
    const dLon = rad(destino.longitude - origem.longitude);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(rad(origem.latitude)) * Math.cos(rad(destino.latitude)) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(Math.max(0, 1 - a)));
}

export function dataLocal(data = new Date()) {
    const deslocamento = data.getTimezoneOffset() * 60000;
    return new Date(data.getTime() - deslocamento).toISOString().slice(0, 16);
}

export function formatarData(valor) {
    const data = new Date(valor);
    return Number.isNaN(data.getTime())
        ? "Não informado"
        : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(data);
}

export function formatarPeso(valor) {
    return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(valor)} kg`;
}

export function filtrarChamados(
    chamados,
    {
        texto = "",
        categoria = "",
        status = "",
        raio = "todos",
        ordem = "recentes",
        origem = null,
    } = {},
) {
    const limpar = (valor) =>
        String(valor)
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLocaleLowerCase("pt-BR");
    const busca = limpar(texto.trim());
    const lista = chamados.filter((chamado) => {
        const distancia = distanciaKm(origem, chamado.localizacao);
        return (
            (!categoria || chamado.categoria.id === String(categoria)) &&
            (!status || chamado.status === status) &&
            (!busca ||
                limpar(
                    `${chamado.categoria.nome} ${chamado.endereco?.bairro || ""} ${chamado.endereco?.cidade || ""} ${chamado.id}`,
                ).includes(busca)) &&
            (raio === "todos" || (distancia !== null && distancia <= Number(raio)))
        );
    });
    return lista.sort((a, b) => {
        if (ordem === "proximos")
            return (
                (distanciaKm(origem, a.localizacao) ?? Infinity) -
                (distanciaKm(origem, b.localizacao) ?? Infinity)
            );
        if (ordem === "agendamento") return new Date(a.data_preferida) - new Date(b.data_preferida);
        return new Date(b.criado_em) - new Date(a.criado_em);
    });
}

export function urlMapa(localizacao) {
    if (!localizacao || !coordenadasValidas(localizacao.latitude, localizacao.longitude))
        return null;
    const { latitude: lat, longitude: lon } = localizacao;
    const url = new URL("https://www.openstreetmap.org/export/embed.html");
    url.searchParams.set(
        "bbox",
        [
            Math.max(-180, lon - 0.012),
            Math.max(-90, lat - 0.008),
            Math.min(180, lon + 0.012),
            Math.min(90, lat + 0.008),
        ].join(","),
    );
    url.searchParams.set("layer", "mapnik");
    url.searchParams.set("marker", `${lat},${lon}`);
    return url.href;
}

export function urlRota(localizacao) {
    if (!localizacao || !coordenadasValidas(localizacao.latitude, localizacao.longitude))
        return null;
    const url = new URL("https://www.google.com/maps/dir/");
    url.searchParams.set("api", "1");
    url.searchParams.set("destination", `${localizacao.latitude},${localizacao.longitude}`);
    url.searchParams.set("travelmode", "driving");
    return url.href;
}

export function urlFotoSegura(valor, permitirData = false) {
    if (typeof valor !== "string" || !valor) return null;
    if (permitirData && /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(valor))
        return valor;
    try {
        const url = new URL(valor, location.href);
        return ["http:", "https:"].includes(url.protocol) ? url.href : null;
    } catch {
        return null;
    }
}
