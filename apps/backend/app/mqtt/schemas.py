# Payload del mensaje SERMO y su parseo tolerante.
#
# SUPUESTO: la forma exacta del mensaje que publica la FPGA todavia no esta
# confirmada con quien la programa. Por eso `parse_sermo_payload()` acepta dos
# formas: el JSON documentado en docs/architecture/mqtt-protocol.md y un
# payload minimo de un solo valor ("1"/"0", "on"/"off", "true"/"false"), que es
# lo que suele emitir un dispositivo embebido al que se le pide simplicidad.
# Aceptar ambas hoy evita que un desacuerdo de formato bloquee el desarrollo;
# cuando el contrato se confirme, se puede restringir (ver ADR 0004).
from __future__ import annotations

import json
from datetime import datetime

from pydantic import BaseModel, ValidationError

from app.core.exceptions import DomainError


class InvalidSermoPayloadError(DomainError):
    """El mensaje recibido en el topico SERMO no es interpretable."""


class OperationMetadata(BaseModel):
    """Datos opcionales del ensayo que arranca.

    La FPGA real casi seguro NO los envie: es un dispositivo que senaliza
    "el reactor opera", no el sistema que sabe como se llama el ensayo ni
    quien lo conduce. Se acepta igual porque el simulador si los manda, y
    porque deja abierta la puerta a que otro publicador los agregue sin
    cambiar el contrato. Cuando faltan, el backend genera un nombre por
    defecto (ver ReactorStateService).
    """

    name: str | None = None
    operator: str | None = None
    notes: str | None = None


class SermoSignal(BaseModel):
    """Mensaje del topico SERMO ya normalizado."""

    sermo: bool
    # Instante en que la FPGA detecto el cambio. Puede no venir; en ese caso
    # el backend usa su propio reloj. No se usa para ordenar mensajes: el
    # orden lo garantiza el broker sobre una unica conexion.
    timestamp: datetime | None = None
    source: str | None = None
    operation: OperationMetadata | None = None


# Valores aceptados en la forma corta, en minusculas.
_TRUTHY = {"1", "true", "on", "yes", "sermo", "operacion", "operando"}
_FALSY = {"0", "false", "off", "no", "detenido", "parado"}


def parse_sermo_payload(payload: bytes | str) -> SermoSignal:
    """Convierte el payload crudo del broker en un SermoSignal.

    Lanza InvalidSermoPayloadError si no se puede interpretar. El llamador
    debe descartar el mensaje y seguir escuchando: un payload invalido no es
    razon para cortar la suscripcion, porque dejaria de verse la proxima
    transicion valida.
    """
    if isinstance(payload, bytes):
        try:
            text = payload.decode("utf-8")
        except UnicodeDecodeError as error:
            raise InvalidSermoPayloadError(f"payload no es UTF-8: {payload!r}") from error
    else:
        text = payload

    text = text.strip()
    if not text:
        # Un payload vacio retenido es como el broker borra un mensaje
        # retenido. No es un error ni es "SERMO = false": es "no se sabe".
        raise InvalidSermoPayloadError("payload vacio (borrado del mensaje retenido)")

    # Forma corta antes que JSON: "1" y "0" tambien son JSON valido, pero
    # como numeros, y el significado que queremos es el de la forma corta.
    normalized = text.lower()
    if normalized in _TRUTHY:
        return SermoSignal(sermo=True)
    if normalized in _FALSY:
        return SermoSignal(sermo=False)

    try:
        data = json.loads(text)
    except json.JSONDecodeError as error:
        raise InvalidSermoPayloadError(f"payload no reconocido: {text!r}") from error

    if not isinstance(data, dict):
        raise InvalidSermoPayloadError(f"se esperaba un objeto JSON, llego {type(data).__name__}")

    try:
        return SermoSignal.model_validate(data)
    except ValidationError as error:
        raise InvalidSermoPayloadError(f"JSON sin campo `sermo` valido: {text!r}") from error
