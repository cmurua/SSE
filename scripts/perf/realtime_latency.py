#!/usr/bin/env python3
"""Mide la latencia de realtime.samples con N clientes WebSocket a la vez.

Herramienta de MEDICION (tarea 3.8, RNF01: 2 s o menos). Abre N conexiones a
/realtime/ws, cada una suscripta a las mismas variables, y para cada muestra
recibida calcula `hora de llegada - timestamp de la muestra`. El timestamp se
fija al LEER la muestra, antes del INSERT, asi que la cifra incluye guardarla
en la base, el reparto y la red: es una cota superior de "desde el INSERT".

    docker compose exec backend python /scripts/perf/realtime_latency.py --clients 100
    docker compose exec backend python /scripts/perf/realtime_latency.py --clients 1,10,50,100 --seconds 60

Requisitos: el backend levantado y el reactor operando (scripts/mqtt/fpga.py
start); si no, el servidor cierra con 4409 y el script lo informa.

Supone que el reloj de este proceso y el del backend son el mismo: corre en el
contenedor del backend, en la misma maquina. Medir desde otra maquina exige
relojes sincronizados (NTP).

No mide el render en el navegador: para eso esta el medidor de la pantalla de
tiempo real (abrir /realtime?latencia, ver docs/architecture/overview.md).
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import statistics
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime

# Mismo limite que el RNF01.
LIMIT_MS = 2000.0


@dataclass
class ClientResult:
    latencies_ms: list[float] = field(default_factory=list)
    close_code: int | None = None
    error: str | None = None


def parse_timestamp(value: str) -> float:
    """Epoch en segundos de un timestamp ISO del backend ("...Z")."""
    return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()


class Barrier:
    """Arranque comun: la medicion empieza cuando todos se conectaron (o
    fallaron), para medir con la carga completa y no el pico del handshake."""

    def __init__(self, parties: int):
        self.pending = parties
        self.ready = asyncio.Event()
        self.go = asyncio.Event()
        self.start = 0.0
        self.deadline = 0.0

    def arrived(self) -> None:
        self.pending -= 1
        if self.pending == 0:
            self.ready.set()


async def run_client(url: str, variables: list[str], barrier: Barrier, result: ClientResult) -> None:
    import websockets

    arrived = False
    try:
        async with websockets.connect(url, max_queue=None) as ws:
            await ws.send(json.dumps({"type": "subscribe", "variables": variables}))
            barrier.arrived()
            arrived = True
            await barrier.go.wait()
            while (remaining := barrier.deadline - time.time()) > 0:
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
                except TimeoutError:
                    break
                received = time.time()
                event = json.loads(raw)
                if event.get("type") != "sample":
                    continue
                sent = parse_timestamp(event["data"]["timestamp"])
                # Las muestras que quedaron en cola mientras se conectaban los
                # demas no cuentan: medirian la espera, no la latencia.
                if sent < barrier.start:
                    continue
                result.latencies_ms.append((received - sent) * 1000)
    except websockets.ConnectionClosed as closed:
        result.close_code = closed.rcvd.code if closed.rcvd else None
    except Exception as error:  # noqa: BLE001 - se informa, no se oculta
        result.error = f"{type(error).__name__}: {error}"
    finally:
        if not arrived:
            barrier.arrived()


def percentile(values: list[float], q: float) -> float:
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round(q / 100 * (len(ordered) - 1))))
    return ordered[index]


async def measure(base_url: str, token: str, clients: int, seconds: int, variables: list[str]):
    url = f"{base_url}/realtime/ws?access_token={token}"
    barrier = Barrier(clients)
    results = [ClientResult() for _ in range(clients)]
    tasks = [asyncio.create_task(run_client(url, variables, barrier, r)) for r in results]

    await barrier.ready.wait()
    barrier.start = time.time()
    barrier.deadline = barrier.start + seconds
    barrier.go.set()
    await asyncio.gather(*tasks)
    return results


def report(clients: int, results: list[ClientResult]) -> dict:
    latencies = [ms for r in results for ms in r.latencies_ms]
    closed = [r.close_code for r in results if r.close_code is not None]
    errors = [r.error for r in results if r.error]
    row = {
        "clients": clients,
        "samples": len(latencies),
        "closed": len(closed),
        "close_codes": sorted(set(closed)),
        "errors": len(errors),
    }
    if latencies:
        row |= {
            "p50": statistics.median(latencies),
            "p95": percentile(latencies, 95),
            "p99": percentile(latencies, 99),
            "max": max(latencies),
            "over_limit": sum(ms > LIMIT_MS for ms in latencies),
        }
    if errors:
        row["first_error"] = errors[0]
    return row


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--clients", default="1,10,50,100", help="cantidades a medir, separadas por coma"
    )
    parser.add_argument("--seconds", type=int, default=60, help="duracion de cada medicion")
    parser.add_argument("--variables", default="POTM4,LOGA1", help="IDs del catalogo (max 2)")
    parser.add_argument("--base-url", default="ws://localhost:8000/api/v1")
    parser.add_argument("--json", action="store_true", help="salida en JSON")
    args = parser.parse_args()

    counts = [int(c) for c in args.clients.split(",")]
    variables = [v for v in args.variables.split(",") if v]

    os.environ.setdefault("ACCESS_TOKEN_EXPIRE_MINUTES", "120")
    from app.core.security import create_access_token

    token = create_access_token("perf-realtime-latency")

    rows = []
    for count in counts:
        print(f"Midiendo con {count} cliente(s) durante {args.seconds} s...", file=sys.stderr)
        results = asyncio.run(measure(args.base_url, token, count, args.seconds, variables))
        rows.append(report(count, results))
        if 4409 in rows[-1]["close_codes"]:
            print("El servidor cerro con 4409: el reactor no esta operando.", file=sys.stderr)
            break

    if args.json:
        print(json.dumps(rows, indent=2))
        return 0

    print(f"\nLatencia toma de la muestra -> llegada al cliente (ms), limite {LIMIT_MS:.0f} ms")
    print(f"{'clientes':>8} {'muestras':>9} {'p50':>7} {'p95':>7} {'p99':>7} {'max':>7} {'>2s':>5} {'cortados':>9}")
    for row in rows:
        if "p50" not in row:
            print(f"{row['clients']:>8} {row['samples']:>9}  sin muestras {row.get('first_error', row['close_codes'])}")
            continue
        print(
            f"{row['clients']:>8} {row['samples']:>9} {row['p50']:>7.1f} {row['p95']:>7.1f}"
            f" {row['p99']:>7.1f} {row['max']:>7.1f} {row['over_limit']:>5} {row['closed']:>9}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
