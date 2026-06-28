# session-stats

## ⚠️ `session_history.db` y `session_history.json` están en `.gitignore`

Cualquier operación git destructiva (`rebase`, `stash pop`, `reset --hard`) los puede borrar sin aviso.

**Antes de esas operaciones, siempre:**
```bash
cp session_history.db /tmp/session_history.db.bak
```

**Si ya se borró:** restaurar desde `db_backups/` + `session-stats --capture-all`.
