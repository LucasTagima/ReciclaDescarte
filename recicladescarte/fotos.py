from io import BytesIO
from pathlib import Path
import re
import secrets
import warnings
from PIL import Image, ImageOps, UnidentifiedImageError
from .dominio import ErroNegocio

MAX_FOTO = 5 * 1024 * 1024
PADRAO_FOTO = re.compile(r"^/api/fotos/([a-f0-9]{48}\.jpg)$")


class ArmazenamentoFotos:
    def __init__(self, pasta):
        self.pasta = Path(pasta)

    def caminho(self, referencia):
        match = PADRAO_FOTO.fullmatch(referencia or "")
        if not match:
            raise ErroNegocio("Foto indisponível nesta versão.", 404)
        return self.pasta / match[1]

    def salvar(self, arquivo):
        if arquivo is None or arquivo.mimetype not in {"image/jpeg", "image/png", "image/webp"}:
            raise ErroNegocio(
                "Envie uma foto JPG, PNG ou WebP.", campos={"foto": "Imagem obrigatória."}
            )
        dados = arquivo.read(MAX_FOTO + 1)
        if not dados or len(dados) > MAX_FOTO:
            raise ErroNegocio("A foto deve ter conteúdo e no máximo 5 MB.", 413)
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(BytesIO(dados)) as img:
                    if (
                        img.format not in {"JPEG", "PNG", "WEBP"}
                        or img.width * img.height > 20000000
                    ):
                        raise ValueError("Formato ou dimensões inválidos")
                    img.load()
                    normal = ImageOps.exif_transpose(img).convert("RGB")
                    normal.thumbnail((4096, 4096))
                    buffer = BytesIO()
                    normal.save(buffer, format="JPEG", quality=90)
                    conteudo = buffer.getvalue()
        except (
            UnidentifiedImageError,
            OSError,
            ValueError,
            Image.DecompressionBombError,
            Image.DecompressionBombWarning,
        ):
            raise ErroNegocio(
                "Não foi possível validar esta foto.",
                campos={"foto": "Imagem inválida ou muito grande."},
            )
        if len(conteudo) > MAX_FOTO:
            raise ErroNegocio("A foto processada excede 5 MB. Envie uma imagem menor.", 413)
        self.pasta.mkdir(parents=True, exist_ok=True)
        referencia = f"/api/fotos/{secrets.token_hex(24)}.jpg"
        destino = self.caminho(referencia)
        try:
            with destino.open("xb") as saida:
                saida.write(conteudo)
        except OSError:
            destino.unlink(missing_ok=True)
            raise ErroNegocio("Não foi possível salvar a foto. Tente novamente.", 503)
        return referencia

    def excluir(self, referencia):
        self.caminho(referencia).unlink(missing_ok=True)
