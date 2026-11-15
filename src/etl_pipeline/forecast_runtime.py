import os
import shutil
from pathlib import Path

import prophet


def ensure_forecast_runtime():
    """Select and validate CmdStan on both Linux Docker and local Windows."""
    import cmdstanpy

    stan_model_dir = Path(prophet.__file__).resolve().parent / "stan_model"

    # 1. Railway / Docker environment (uses ENV CMDSTAN=/opt/cmdstan/cmdstan-2.33.1)
    configured_path = os.getenv("CMDSTAN")
    if configured_path and Path(configured_path).exists():
        bundled_233 = stan_model_dir / "cmdstan-2.33.1"
        if bundled_233.exists() and not (bundled_233 / "makefile").is_file():
            shutil.rmtree(bundled_233, ignore_errors=True)
        cmdstanpy.set_cmdstan_path(configured_path)
        print(f"Forecast runtime ready: CmdStan {configured_path}")
        return

    # 2. Local Windows environment (uses CmdStan bundled inside the Prophet wheel)
    if stan_model_dir.exists():
        for candidate in sorted(stan_model_dir.glob("cmdstan-*"), reverse=True):
            if (candidate / "bin").is_dir():
                cmdstanpy.set_cmdstan_path(str(candidate))
                print(f"Forecast runtime ready: bundled CmdStan {candidate}")
                return

    # 3. Fallback to default cmdstanpy path if installed separately
    try:
        path = Path(cmdstanpy.cmdstan_path())
        print(f"Forecast runtime ready: CmdStan {path}")
    except ValueError:
        print("Using Prophet default Stan backend.")