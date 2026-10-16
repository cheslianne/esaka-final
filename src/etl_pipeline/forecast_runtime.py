import os
import shutil
from pathlib import Path

import prophet


def ensure_forecast_runtime():
    """Select and validate CmdStan before constructing a Prophet model."""
    import cmdstanpy

    bundled_cmdstan_path = (
        Path(prophet.__file__).resolve().parent
        / "stan_model"
        / "cmdstan-2.33.1"
    )
    if bundled_cmdstan_path.exists() and not (bundled_cmdstan_path / "makefile").is_file():
        shutil.rmtree(bundled_cmdstan_path)

    configured_path = os.getenv("CMDSTAN")
    if configured_path and Path(configured_path).exists():
        cmdstanpy.set_cmdstan_path(configured_path)

    try:
        path = Path(cmdstanpy.cmdstan_path())
    except ValueError as error:
        raise RuntimeError(
            "CmdStan is not installed; rebuild the image with a working "
            "CmdStan installation."
        ) from error

    cmdstan_binary = path / "bin" / "cmdstan"
    if not cmdstan_binary.exists():
        raise RuntimeError(
            f"CmdStan installation is incomplete: missing executable {cmdstan_binary}."
        )

    cmdstanpy.set_cmdstan_path(str(path))
    print(f"Forecast runtime ready: CmdStan {path}")