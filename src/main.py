from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.core.config import settings
from src.models.report_submission import ReportSubmission
from src.models.report_validation_history import ReportValidationHistory
from src.api.routes import raw_plant_reports
from src.api.routes import etl_run_log
from src.api.routes.alert_thresholds import router as alert_thresholds_router
from src.api.routes.market_price import router as market_price_router
from src.api.routes.market_price_forecast import (
    router as market_price_forecast_router
)
from src.api.routes import (
    users,
    auth,
    farmers,
    planting_intents,
    offtake_requests,
    buyer_registry,
    buyer_status,
    buyers,
    forecasts,
    price_data,
    raw_plant_reports,
    report_planting_intents,
    report_submission,
    audit_logs,
    email,
    public_stats,
    aew_dashboard,
    da_rfo_dashboard,
)


app = FastAPI(
    title="eSaka API",
    description="Intelligent Supply-Demand Analytics and Geospatial Market Intelligence Platform",
    version="1.0.0"
)


# =========================================================
# CORS
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=list({
        *(
            origin.strip()
            for origin in settings.allowed_origins.split(",")
            if origin.strip()
        ),
        "http://localhost:5500",
        "http://127.0.0.1:5500",
    }),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# ROUTES
# =========================================================

app.include_router(
    auth.router,
    prefix="/api/auth",
    tags=["Authentication"]
)

app.include_router(
    users.router,
    prefix="/api/users",
    tags=["Users"]
)

app.include_router(
    farmers.router,
    prefix="/api/farmers",
    tags=["Farmers"]
)

app.include_router(
    planting_intents.router,
    prefix="/api/planting-intents",
    tags=["Planting Intents"]
)

app.include_router(
    offtake_requests.router,
    prefix="/api/offtake-requests",
    tags=["Offtake Requests"]
)

app.include_router(
    aew_dashboard.router,
    prefix="/api/aew/dashboard",
    tags=["AEW Dashboard"]
)

app.include_router(
    da_rfo_dashboard.router,
    prefix="/api/da-rfo/dashboard",
    tags=["DA-RFO Dashboard"]
)

app.include_router(
    buyer_registry.router,
    prefix="/api/buyer-registry",
    tags=["Buyer Registry"]
)

app.include_router(
    buyer_status.router,
    prefix="/api/buyer-status",
    tags=["Buyer Status"]
)

app.include_router(
    buyers.router,
    prefix="/api/buyers",
    tags=["Buyers"]
)

app.include_router(
    forecasts.router,
    prefix="/api/forecasts",
    tags=["Forecasts"]
)

app.include_router(
    price_data.router,
    prefix="/api/price-data",
    tags=["Price Data"]
)

app.include_router(
    raw_plant_reports.router,
    prefix="/api/raw-plant-reports",
    tags=["Raw Plant Reports"]
)

app.include_router(
    report_planting_intents.router,
    prefix="/api/report-planting-intents",
    tags=["Report Planting Intents"]
)

app.include_router(
    audit_logs.router,
    prefix="/api/audit-logs",
    tags=["Audit Logs"]
)

app.include_router(
    email.router,
    prefix="/api/email",
    tags=["Email"]
)

app.include_router(
    public_stats.router,
    prefix="/api/public",
    tags=["Public"]
)

app.include_router(
    report_submission.router,
    prefix="/api/report-submissions",
    tags=["Report Submissions"]
)


app.include_router(
    etl_run_log.router,
    prefix="/api/etl-run-log",
    tags=["ETL Run Log"]
)

app.include_router(
    alert_thresholds_router,
    prefix="/api/alert-thresholds",
    tags=["Alert Thresholds"]
)

app.include_router(market_price_router)

app.include_router(
    market_price_forecast_router
)



# =========================================================
# ROOT
# =========================================================

@app.get("/")
def root():
    return {
        "message": "Welcome to eSaka API",
        "docs": "/docs",
        "redoc": "/redoc"
    }


# =========================================================
# HEALTH
# =========================================================

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "version": "1.0.0"
    }