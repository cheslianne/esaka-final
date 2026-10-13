# eSaka
backend, database

## Database deployment

Set `DATABASE_URL` to the connection string provided by the hosted PostgreSQL
service. The application uses this variable first, so on Railway it should be
set as a reference to the PostgreSQL service's `DATABASE_URL` variable. The
older `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` variables
remain supported for local development, but stale values for them cannot
override `DATABASE_URL`.

For the separate Railway frontend service, set `API_BASE_URL` to the backend
service's public HTTPS URL (not the PostgreSQL internal hostname). The frontend
container proxies `/api` requests to this backend and exposes the API to browser
code at the frontend's own origin, keeping the HTTP-only session cookie
first-party. Set `RUN_ETL_ON_STARTUP=true` on the backend when provisioning a
new database so the bundled market-price seed data and forecasts are loaded
before the API starts.

## Frontend session and preferences

The frontend authenticates with an HTTP-only, Secure `esaka_access_token`
cookie. HTTPS responses mark the cookie `SameSite=None`; production browser API
calls use the frontend-origin proxy to avoid third-party cookie restrictions.
Authenticated write requests validate their `Origin`; `ALLOWED_ORIGINS` must
include the deployed frontend origin. The login response contains account
display data only; access tokens are not returned to JavaScript or saved in
browser storage. The theme preference is stored locally and is independent of
the authentication session.

The system administrator dashboard opens to
`/dashboards/system-admin.html#/dashboard`; user management remains a separate
view at `/dashboards/system-admin.html#/user-management`. Other routes include
`/dashboards/system-admin.html#/add-account` and
`/dashboards/system-admin.html#/user-profile`. Hash routing preserves direct
links and browser history without requiring additional static-host rewrites.
Account names accept Unicode letters and common name punctuation; account
usernames and phone numbers are validated on both frontend and backend. New
accounts collect birthdates, while existing accounts without one remain
supported. Profile settings load and save first name, last name, and birthdate
through the authenticated API rather than reconstructing them from local labels.
