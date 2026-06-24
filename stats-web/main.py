import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SCRIPT_DIR))

import sqlite3
import datetime
from fastapi import FastAPI, Request, Query
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from stats_common import DB_PATH, get_monthly_data, recalculate_historical_cost

app = FastAPI(title="session-stats dashboard")

templates = Jinja2Templates(directory=str(SCRIPT_DIR / "stats-web/templates"))
app.mount("/static", StaticFiles(directory=str(SCRIPT_DIR / "stats-web/static")), name="static")
app.mount("/vendor", StaticFiles(directory=str(SCRIPT_DIR / "stats-web/vendor")), name="vendor")


def _db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA query_only=ON")
    return conn


def _today():
    return datetime.date.today().isoformat()


def _days_ago(n):
    return (datetime.date.today() - datetime.timedelta(days=n)).isoformat()


# --- HTML Pages ---

@app.get("/healthz")
def healthz():
    if DB_PATH.exists():
        conn = _db()
        conn.execute("SELECT 1")
        conn.close()
        return {"status": "ok"}
    return JSONResponse({"status": "error", "msg": "DB not found"}, status_code=503)


@app.get("/", response_class=HTMLResponse)
def dashboard(request: Request):
    return templates.TemplateResponse("dashboard.html", {"request": request})


@app.get("/sessions", response_class=HTMLResponse)
def sessions_page(request: Request):
    return templates.TemplateResponse("sessions.html", {"request": request})


@app.get("/models", response_class=HTMLResponse)
def models_page(request: Request):
    return templates.TemplateResponse("models.html", {"request": request})


# --- API Endpoints ---

@app.get("/api/summary")
def api_summary():
    hist = recalculate_historical_cost()
    conn = _db()

    cost_7d = conn.execute(
        "SELECT COALESCE(SUM(cost),0) FROM sessions WHERE source != 'legacy' AND date >= ?",
        (_days_ago(7),)
    ).fetchone()[0]

    cost_30d = conn.execute(
        "SELECT COALESCE(SUM(cost),0) FROM sessions WHERE source != 'legacy' AND date >= ?",
        (_days_ago(30),)
    ).fetchone()[0]

    total_cache = conn.execute(
        "SELECT COALESCE(SUM(cache_tokens),0) FROM sessions WHERE source != 'legacy'"
    ).fetchone()[0]

    conn.close()

    return {
        "total_sessions": hist["total_sessions"],
        "total_requests": hist["total_requests"],
        "total_input_tokens": hist["total_input"],
        "total_output_tokens": hist["total_output"],
        "total_cache_tokens": total_cache,
        "total_cost": round(hist["total_cost"], 2),
        "cost_7d": round(cost_7d, 2),
        "cost_30d": round(cost_30d, 2),
        "last_updated": datetime.datetime.now().isoformat(timespec="minutes"),
    }


@app.get("/api/timeseries")
def api_timeseries(
    range: str = Query("30d", regex=r"^(7d|30d|90d|all)$"),
    bucket: str = Query("day", regex=r"^(day|week|month)$"),
):
    date_from = None if range == "all" else _days_ago(int(range.replace("d", "")))

    conn = _db()
    if bucket == "month":
        rows = conn.execute("""
            SELECT strftime('%Y-%m-01', date) as period,
                   COUNT(*) as sessions,
                   COALESCE(SUM(requests),0) as requests,
                   COALESCE(SUM(input_tokens),0) as input_tokens,
                   COALESCE(SUM(output_tokens),0) as output_tokens,
                   COALESCE(SUM(cache_tokens),0) as cache_tokens,
                   COALESCE(SUM(cost),0) as cost
            FROM sessions
            WHERE source != 'legacy'""" + (" AND date >= ?" if date_from else "") + """
            GROUP BY period ORDER BY period ASC
        """, ([date_from] if date_from else [])).fetchall()
    elif bucket == "week":
        rows = conn.execute("""
            SELECT date(date, 'weekday 1') as period,
                   COUNT(*) as sessions,
                   COALESCE(SUM(requests),0) as requests,
                   COALESCE(SUM(input_tokens),0) as input_tokens,
                   COALESCE(SUM(output_tokens),0) as output_tokens,
                   COALESCE(SUM(cache_tokens),0) as cache_tokens,
                   COALESCE(SUM(cost),0) as cost
            FROM sessions
            WHERE source != 'legacy'""" + (" AND date >= ?" if date_from else "") + """
            GROUP BY period ORDER BY period ASC
        """, ([date_from] if date_from else [])).fetchall()
    else:
        rows = conn.execute("""
            SELECT DATE(date) as period,
                   COUNT(*) as sessions,
                   COALESCE(SUM(requests),0) as requests,
                   COALESCE(SUM(input_tokens),0) as input_tokens,
                   COALESCE(SUM(output_tokens),0) as output_tokens,
                   COALESCE(SUM(cache_tokens),0) as cache_tokens,
                   COALESCE(SUM(cost),0) as cost
            FROM sessions
            WHERE source != 'legacy'""" + (" AND date >= ?" if date_from else "") + """
            GROUP BY period ORDER BY period ASC
        """, ([date_from] if date_from else [])).fetchall()

    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/models")
def api_models(limit: int = Query(20, ge=1, le=200)):
    conn = _db()
    rows = conn.execute("""
        SELECT model,
               COALESCE(SUM(requests),0) as requests,
               COALESCE(SUM(input_tokens),0) as input_tokens,
               COALESCE(SUM(output_tokens),0) as output_tokens,
               COALESCE(SUM(cache_tokens),0) as cache_tokens,
               COALESCE(SUM(cost),0) as cost
        FROM model_usage
        GROUP BY model
        ORDER BY cost DESC
        LIMIT ?
    """, (limit,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/sessions")
def api_sessions(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    source: str = Query(None),
):
    conn = _db()

    where = "WHERE source != 'legacy'"
    params = []
    if source:
        where += " AND source = ?"
        params.append(source)

    total = conn.execute(
        f"SELECT COUNT(*) FROM sessions {where}", params
    ).fetchone()[0]

    rows = conn.execute(
        f"SELECT id, source, date, requests, input_tokens, output_tokens, cache_tokens, cost "
        f"FROM sessions {where} ORDER BY date DESC, timestamp DESC LIMIT ? OFFSET ?",
        params + [limit, offset]
    ).fetchall()

    conn.close()
    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "sessions": [dict(r) for r in rows],
    }


@app.get("/api/sources")
def api_sources():
    conn = _db()
    total_cost = conn.execute(
        "SELECT COALESCE(SUM(cost),0) FROM sessions WHERE source != 'legacy'"
    ).fetchone()[0]

    rows = conn.execute("""
        SELECT source,
               COUNT(*) as sessions,
               COALESCE(SUM(requests),0) as requests,
               COALESCE(SUM(cost),0) as cost
        FROM sessions
        WHERE source != 'legacy'
        GROUP BY source
        ORDER BY cost DESC
    """).fetchall()

    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d["percentage"] = round((d["cost"] / total_cost * 100) if total_cost > 0 else 0, 1)
        result.append(d)
    return result


@app.exception_handler(Exception)
def global_exception(request: Request, exc: Exception):
    return JSONResponse({"error": str(exc)}, status_code=500)
