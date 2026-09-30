#!/usr/bin/env python3
"""Simulador de la FPGA: publica la senal SERMO por MQTT.

Herramienta de DESARROLLO. Ocupa el lugar de la FPGA, que es el dispositivo
que en el reactor real avisa que arranco o termino una operacion (ver
docs/decisions/0004-representacion-sermo.md). Sin ella no hay forma de probar
RF04 (tiempo real) ni de generar operaciones nuevas.

    docker compose exec backend python /scripts/mqtt/fpga.py start
    docker compose exec backend python /scripts/mqtt/fpga.py status
    docker compose exec backend python /scripts/mqtt/fpga.py stop

Este script YA NO escribe en la base. Antes (cuando era
`scripts/db/simulator.py`) abria la operacion e insertaba las muestras el
mismo; ahora solo publica la senal, y es el backend el que abre la operacion y
arranca la toma de datos al recibirla. Es a proposito: asi el camino que se
prueba en desarrollo es el mismo que va a correr en el reactor, en vez de uno
paralelo que saltea el modulo que nos interesa validar.

Consecuencia practica: el backend tiene que estar levantado para que `start`
haga algo. Si no lo esta, el mensaje queda RETENIDO en el broker y el backend
lo recibe apenas arranca -- que es exactamente lo que pasaria si se reiniciara
el servidor durante un ensayo.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import UTC, datetime

import aiomqtt
from sqlalchemy.exc import SQLAlchemyError

from app.config.settings import get_settings

settings = get_settings()

# Identificador propio: compartir el del backend haria que el broker los
# desconecte mutuamente en un bucle.
CLIENT_ID = "fpga-simulada"


def build_payload(sermo: bool, args: argparse.Namespace) -> str:
    """Arma el mensaje segun docs/architecture/mqtt-protocol.md."""
    if args.format == "short":
        # Forma minima, la que probablemente emita un dispositivo embebido.
        # Sirve para verificar que el backend la acepta igual que el JSON.
        return "1" if sermo else "0"

    message: dict = {
        "sermo": sermo,
        "timestamp": datetime.now(UTC).isoformat(),
        "source": CLIENT_ID,
    }

    # Los metadatos del ensayo solo tienen sentido al arrancar, y la FPGA real
    # seguramente no los mande (ver ADR 0004). Se incluyen aca para poder
    # probar el camino en el que si llegan.
    if sermo:
        operation = {
            key: value
            for key, value in (
                ("name", args.name),
                ("operator", args.operator),
                ("notes", args.notes),
            )
            if value
        }
        if operation:
            message["operation"] = operation

    return json.dumps(message, ensure_ascii=False)


async def publish(sermo: bool, args: argparse.Namespace) -> int:
    payload = build_payload(sermo, args)
    try:
        async with aiomqtt.Client(
            hostname=settings.mqtt_host,
            port=settings.mqtt_port,
            username=settings.mqtt_username,
            password=settings.mqtt_password,
            identifier=CLIENT_ID,
        ) as client:
            # retain=True: el ultimo valor queda guardado en el broker, asi un
            # backend que arranca despues sabe el estado sin esperar a la
            # proxima transicion. Es la misma razon por la que el frontend
            # puede pedir el estado inicial por REST y no quedarse en blanco.
            await client.publish(
                settings.mqtt_topic_sermo,
                payload=payload,
                qos=settings.mqtt_qos,
                retain=True,
            )
    except aiomqtt.MqttError as error:
        print(
            f"No se pudo publicar en {settings.mqtt_host}:{settings.mqtt_port}: {error}",
            file=sys.stderr,
        )
        return 1

    print(f"Publicado en '{settings.mqtt_topic_sermo}': {payload}")
    print(
        "El backend abre la operacion y arranca la toma de datos al recibirlo."
        if sermo
        else "El backend detiene la toma de datos y cierra la operacion al recibirlo."
    )
    return 0


async def read_retained(timeout: float) -> str | None:
    """Lee el mensaje retenido del topico SERMO, si hay alguno.

    Suscribirse alcanza: el broker entrega el retenido de inmediato. Si no
    llega nada en `timeout` segundos es que no hay ninguno publicado.
    """
    try:
        async with aiomqtt.Client(
            hostname=settings.mqtt_host,
            port=settings.mqtt_port,
            username=settings.mqtt_username,
            password=settings.mqtt_password,
            identifier=f"{CLIENT_ID}-status",
        ) as client:
            await client.subscribe(settings.mqtt_topic_sermo, qos=settings.mqtt_qos)
            async with asyncio.timeout(timeout):
                async for message in client.messages:
                    payload = message.payload
                    if isinstance(payload, (bytes, bytearray)):
                        return bytes(payload).decode("utf-8", errors="replace")
                    return str(payload)
    except TimeoutError:
        return None
    return None


def db_status() -> str:
    """Estado segun la base: la proyeccion de la senal que dejo el backend.

    Se muestra junto con el retenido para poder detectar el desacuerdo entre
    los dos, que es el sintoma de que el backend no esta recibiendo la senal.
    """
    from sqlalchemy import func, select

    from app.db.session import SessionLocal
    from app.domains.historicals.models import Operation
    from app.domains.reactor_data.models import ReactorSample
    from app.domains.reactor_state.repository import find_open_operation

    with SessionLocal() as session:
        total = session.scalar(select(func.count()).select_from(Operation))
        operation = find_open_operation(session)
        if operation is None:
            return f"Operaciones en la base: {total}\nSin operacion abierta."

        samples = session.scalar(
            select(func.count())
            .select_from(ReactorSample)
            .where(ReactorSample.operation_id == operation.id)
        )
        return (
            f"Operaciones en la base: {total}\n"
            f"Operacion abierta: {operation.id} - {operation.name}\n"
            f"  operador: {operation.operator}\n"
            f"  desde:    {operation.started_at.isoformat()}\n"
            f"  muestras: {samples}"
        )


async def cmd_status(args: argparse.Namespace) -> int:
    retained = await read_retained(args.timeout)
    print("--- Senal en el broker (mensaje retenido) ---")
    print(retained if retained is not None else "(no hay mensaje retenido)")
    print()
    print("--- Estado en la base (lo que hizo el backend) ---")
    try:
        print(db_status())
    except SQLAlchemyError as error:
        # Base caida o sin migrar. Es informacion util para el diagnostico,
        # no un motivo para no haber mostrado el retenido de arriba.
        print(f"No se pudo consultar la base: {error}", file=sys.stderr)
        return 1
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="fpga.py",
        description="Emula a la FPGA: publica la senal SERMO por MQTT.",
    )
    parser.add_argument(
        "--format",
        choices=("json", "short"),
        default="json",
        help="forma del payload: JSON completo (default) o solo '1'/'0'",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    start = subparsers.add_parser("start", help="publica SERMO = true (arranca la operacion)")
    start.add_argument("--name", default=None, help="nombre del ensayo (opcional)")
    start.add_argument("--operator", default=None, help="operador responsable (opcional)")
    start.add_argument("--notes", default=None, help="observaciones (opcional)")
    start.set_defaults(func=lambda args: publish(True, args))

    stop = subparsers.add_parser("stop", help="publica SERMO = false (cierra la operacion)")
    stop.set_defaults(func=lambda args: publish(False, args))

    status = subparsers.add_parser(
        "status", help="muestra el retenido del broker y el estado en la base"
    )
    status.add_argument(
        "--timeout",
        type=float,
        default=3.0,
        help="segundos a esperar el mensaje retenido (default 3)",
    )
    status.set_defaults(func=cmd_status)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return asyncio.run(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
