#!/usr/bin/env python3
"""Small bridge that lets the Node runner launch official Camoufox.

The official Camoufox package is Python-first. Its remote-server entrypoint
does not accept CLI options, so this shim reads a JSON launch config from an
environment variable and forwards it to camoufox.server.launch_server().
"""

from __future__ import annotations

import base64
import json
import os
import signal
import subprocess
import sys
from pathlib import Path
from typing import Any


def _load_config() -> dict:
    encoded = os.environ.get("OPENPEEC_CAMOUFOX_CONFIG_B64", "")
    if not encoded:
        return {}
    return json.loads(base64.b64decode(encoded).decode("utf-8"))


def _camoufox_launch_file() -> Path:
    from camoufox.pkgman import INSTALL_DIR, LAUNCH_FILE, OS_NAME, Version

    Version.from_path()
    if OS_NAME == "mac":
        return INSTALL_DIR / "Camoufox.app" / "Contents" / "MacOS" / "camoufox"
    return INSTALL_DIR / LAUNCH_FILE[OS_NAME]


def check() -> int:
    try:
        import camoufox  # noqa: F401
    except ModuleNotFoundError:
        print(
            "Camoufox is not installed. Run `pnpm runner:install-camoufox`.",
            file=sys.stderr,
        )
        return 2

    try:
        launch_file = _camoufox_launch_file()
    except Exception as exc:
        print(
            f"Camoufox browser binaries are not ready: {exc}. "
            "Run `pnpm runner:install-camoufox`.",
            file=sys.stderr,
        )
        return 3

    if not launch_file.exists():
        print(
            f"Camoufox executable was not found at {launch_file}. "
            "Run `pnpm runner:install-camoufox`.",
            file=sys.stderr,
        )
        return 3

    print(str(launch_file))
    return 0


def _drop_none(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _drop_none(item) for key, item in value.items() if item is not None}
    if isinstance(value, list):
        return [_drop_none(item) for item in value]
    return value


def _launch_server(config: dict) -> int:
    from camoufox.server import LAUNCH_SCRIPT, get_nodejs, to_camel_case_dict
    from camoufox.utils import launch_options

    nodejs = get_nodejs()
    options = _drop_none(to_camel_case_dict(launch_options(**config)))
    encoded = base64.b64encode(json.dumps(options).encode("utf-8")).decode("utf-8")
    process = subprocess.Popen(  # nosec
        [nodejs, str(LAUNCH_SCRIPT)],
        cwd=Path(nodejs).parent / "package",
        stdin=subprocess.PIPE,
        text=True,
    )

    def stop_child(signum: int, _frame: Any) -> None:
        if process.poll() is None:
            process.terminate()
        raise SystemExit(128 + signum)

    signal.signal(signal.SIGTERM, stop_child)
    signal.signal(signal.SIGINT, stop_child)

    if process.stdin:
        process.stdin.write(encoded)
        process.stdin.close()

    return process.wait()


def main() -> int:
    if "--check" in sys.argv:
        return check()

    try:
        import camoufox  # noqa: F401
    except ModuleNotFoundError:
        print(
            "Camoufox is not installed. Run `pnpm runner:install-camoufox`.",
            file=sys.stderr,
        )
        return 2

    return _launch_server(_load_config())


if __name__ == "__main__":
    raise SystemExit(main())
