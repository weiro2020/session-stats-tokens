# stats-web · session-stats dashboard

Dashboard web para visualizar consumo de APIs LLM desde session-stats.

## Stack

- **Backend**: FastAPI + uvicorn (:8091 loopback)
- **Frontend**: Jinja2 templates + vanilla JS + Chart.js 4.x (vendorizado)
- **DB**: SQLite (read-only, desde `session_history.db`)

## Endpoints

| Ruta | Descripción |
|---|---|
| `/` | Dashboard con gráficos |
| `/sessions` | Tabla paginada de sesiones |
| `/models` | Ranking de modelos por costo |
| `/healthz` | Healthcheck |
| `/api/summary` | Totales globales (JSON) |
| `/api/timeseries?range=30d&bucket=day` | Serie temporal (JSON) |
| `/api/models?limit=20` | Ranking modelos (JSON) |
| `/api/sessions?limit=50&offset=0` | Sesiones paginadas (JSON) |
| `/api/sources` | Totales por fuente (JSON) |

## Operación diaria

```bash
# Estado del servicio
systemctl status session-stats-web

# Logs
tail -f /var/log/session-stats-web.log
tail -f /var/log/nginx/stats.dev0p.com.access.log

# Healthcheck
curl http://127.0.0.1:8091/healthz
```

## Troubleshooting

- **502 Bad Gateway**: el backend no corre. Verificar `systemctl status session-stats-web`.
- **401 Unauthorized**: credenciales Basic Auth incorrectas. Regenerar con `htpasswd -nb stats <nueva-pass>` y copiar a `/etc/nginx/.htpasswd-stats`.
- **DB no disponible**: `session_history.db` no existe o no es legible. Verificar permisos.

## Notas

- El Basic Auth está en nginx, no en la app.
- Chart.js está vendorizado localmente — no depende de CDN externo.
- Todas las conexiones a SQLite son read-only (`PRAGMA query_only=ON`).
