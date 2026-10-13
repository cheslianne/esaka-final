#!/bin/sh
set -e

python init_db.py
python seed_admin.py
python seed_aew.py
python seed_provincial.py
python seed_municipal.py
python seed_darfo.py
python seed_farmers.py
python seed_buyers.py
python seed_planting_intents.py
python seed_alert_thresholds.py

if [ "${RUN_ETL_ON_STARTUP:-false}" = "true" ]; then
    echo "RUN_ETL_ON_STARTUP=true; loading market prices and forecasts..."
    (python init_market_data.py || echo "Market data initialization failed") &
fi

exec uvicorn src.main:app --host 0.0.0.0 --port "${PORT:-8000}"
