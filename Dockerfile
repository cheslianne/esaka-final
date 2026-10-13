FROM python:3.11-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV CMDSTAN=/opt/cmdstan/cmdstan-2.33.1

RUN apt-get update && apt-get install -y --no-install-recommends \
	build-essential \
	libgomp1 \
	&& rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Prophet 1.1.5 ships an incomplete CmdStan directory that takes precedence
# over the fully compiled installation below.
RUN rm -rf /usr/local/lib/python3.11/site-packages/prophet/stan_model/cmdstan-2.33.1

# Manual ETL runs execute in this API container, so it needs the same
# compiled Prophet backend as the dedicated scheduler worker.
RUN python -c "from pathlib import Path; import cmdstanpy; ok=cmdstanpy.install_cmdstan(version='2.33.1', dir='/opt/cmdstan', verbose=True); path=Path('/opt/cmdstan/cmdstan-2.33.1'); assert ok and (path/'bin'/'cmdstan').exists(), f'Incomplete CmdStan installation at {path}'; print(path)"
RUN python -c "import cmdstanpy; cmdstanpy.set_cmdstan_path('/opt/cmdstan/cmdstan-2.33.1'); from prophet import Prophet; Prophet(stan_backend='CMDSTANPY', yearly_seasonality=False, weekly_seasonality=False, daily_seasonality=False); print('Prophet CmdStan backend ready')"

COPY src ./src
COPY data ./data
COPY init_db.py init_market_data.py start.sh ./
COPY seed_admin.py seed_aew.py seed_alert_thresholds.py seed_buyers.py seed_darfo.py seed_farmers.py seed_municipal.py seed_planting_intents.py seed_provincial.py ./
COPY uploads ./uploads

RUN sed -i 's/\r$//' start.sh && chmod +x start.sh

EXPOSE 8000

CMD ["./start.sh"]
