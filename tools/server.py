#!/usr/bin/env python3
"""cs2predict: локальний сервер без залежностей (лише стандартна бібліотека Python 3).

- Віддає сторінки з web/ і дані з data/ (крім data/cache/).
- GET  /api/results?stage=all|stage1 -> результати з Liquipedia + ручні виправлення.
  Знімок віддається одразу; якщо він старший за 170 с, оновлення йде у фоні ("refreshing": true).
  force=1 оновлює одразу, поки сторінка чекає.
- GET  /api/card?stage=all|stage1[&profile=me|<id>|all] -> збережені картки (профіль «Я» за замовчуванням).
- POST /api/card?stage=stage1[&profile=<id>]             -> зберегти картку: «Я» — у data/my-cards.json,
  інші профілі — у data/profiles.json.
- GET  /api/profiles                 -> список профілів [{id, name}] («Я» завжди перший).
- POST /api/profiles {action: create|rename|delete, id?, name?} -> керування профілями.
  Зіпсований data/profiles.json сервер не перезаписує: GET /api/profiles віддає лише «Я» і поле "error",
  а все, що мало б змінити цей файл, отримує 503 з тим самим поясненням.
- GET  /api/insights                 -> AI-аналіз (data/ai/) і борди експертів (data/analysts/) усіх стадій.
- GET  /api/version                  -> відбиток файлів даних.

Слухає лише 127.0.0.1, тобто сайт доступний тільки з цього Mac. /api/ і файли з data/ віддає лише на
запит із заголовком Host 127.0.0.1:порт або localhost:порт (чужа сторінка їх не прочитає), інакше — 403.
"""
import datetime
import gzip
import hashlib
import json
import os
import re
import secrets
import shutil
import sys
import tempfile
import threading
import time
import unicodedata
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")
WEB = os.path.join(ROOT, "web")
PORT = int(os.environ.get("CS2P_PORT", "8765"))

# Сторінки Liquipedia для кожної стадії.
STAGE_PAGES = {
    "stage1": "PGL/2026/Singapore/Stage 1",
    "stage2": "PGL/2026/Singapore/Stage 2",
    "stage3": "PGL/2026/Singapore/Stage 3",
}
# Плей-оф: сітка на 8 команд — на головній сторінці турніру (так у мейджорів на Liquipedia) або на підсторінці.
# Обидві назви йдуть у той самий єдиний запит, що й стадії, — окремих запитів до Liquipedia немає.
PLAYOFF_PAGES = ("PGL/2026/Singapore", "PGL/2026/Singapore/Playoffs")
RESULT_KEYS = tuple(STAGE_PAGES) + ("playoffs",)
CARD_STAGES = ("stage1", "stage2", "stage3", "playoffs")
SWISS_SLOTS = (("p30", 2), ("adv", 6), ("p03", 2))
PLAYOFF_SLOTS = (("qf", 4), ("sf", 2))
API = "https://liquipedia.net/counterstrike/api.php"
SOURCE = "Liquipedia (CC-BY-SA 3.0)"
# Без особистих даних (див. PLAN.md, розділ 10).
USER_AGENT = "cs2predict/0.1 (personal non-commercial Pick'Em tracker; low volume)"
CACHE_SECONDS = 170          # сторінка питає раз на 180 с: до того часу знімок уже має застаріти
MIN_GAP_SECONDS = 2.5        # ліміт Liquipedia: не більше 1 запиту за 2 с
MAX_BODY = 65536             # найбільша картка, яку приймає POST /api/card

_lock = threading.Lock()         # стан кешу в _mem
_fetch_lock = threading.Lock()   # одночасно йде не більше одного запиту до Liquipedia
_cards_lock = threading.Lock()   # читання й запис data/my-cards.json
# payload: останній знімок; stamp: коли ПОЧАВСЯ останній запит (monotonic); done: коли він завершився;
# refreshing: чи йде фонове оновлення; thread: фоновий потік (тести чекають на нього).
_mem = {"payload": None, "stamp": None, "done": None, "refreshing": False, "thread": None}
_last_request = [0.0]
# Пауза після «забагато запитів» (HTTP 429/503): 5, 10, далі 15 хв або скільки просить Retry-After.
# Кнопка «Оновити» її не обходить. Скидається після першої вдалої відповіді.
BACKOFF_STEPS = (300, 600, 900)
_backoff = {"until": 0.0, "n": 0}
_sleep = time.sleep


def _now_iso():
    """Поточний час в ISO 8601 зі зміщенням через двокрапку: 2026-11-24T14:52:01+02:00."""
    return datetime.datetime.now().astimezone().isoformat(timespec="seconds")


_OLD_TS = re.compile(r"^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)([+-]\d{2})(\d{2})$")


def _iso_fix(ts):
    """Відмітки старих версій ('…+0200') -> ISO 8601 з двокрапкою ('…+02:00')."""
    if isinstance(ts, str):
        m = _OLD_TS.match(ts.strip())
        if m:
            return "%s%s:%s" % m.groups()
    return ts


def _write_json_atomic(path, obj):
    """Запис через тимчасовий файл і os.replace: перерваний запис не псує старий файл."""
    folder = os.path.dirname(path)
    os.makedirs(folder, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix="." + os.path.basename(path) + ".", suffix=".tmp", dir=folder)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=1)
            f.flush()
            os.fsync(f.fileno())
        os.chmod(tmp, 0o644)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


# ---------------------------------------------------------------- wikitext ---

_COMMENT = re.compile(r"<!--.*?(?:-->|\Z)", re.S)


def _strip_comments(text):
    """Прибирає <!-- коментарі --> (незакритий коментар, як і в MediaWiki, тягнеться до кінця)."""
    return _COMMENT.sub("", text or "")


def _templates(text, name):
    """Знаходить усі шаблони {{name ...}} з урахуванням вкладених дужок."""
    out = []
    pat = re.compile(r"\{\{\s*" + re.escape(name) + r"\s*[|}\n]")
    for m in pat.finditer(text):
        start = m.start()
        depth, i = 0, start
        while i < len(text) - 1:
            two = text[i:i + 2]
            if two == "{{":
                depth += 1
                i += 2
                continue
            if two == "}}":
                depth -= 1
                i += 2
                if depth == 0:
                    out.append((start, text[start + 2:i - 2]))
                    break
                continue
            i += 1
    return out


def _params(body):
    """Ділить тіло шаблону на параметри за | на нульовій глибині."""
    parts, depth, cur, i = [], 0, [], 0
    while i < len(body):
        two = body[i:i + 2]
        if two in ("{{", "[["):
            depth += 1
            cur.append(two)
            i += 2
            continue
        if two in ("}}", "]]"):
            depth -= 1
            cur.append(two)
            i += 2
            continue
        ch = body[i]
        if ch == "|" and depth == 0:
            parts.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
        i += 1
    parts.append("".join(cur))
    res = {}
    for p in parts[1:]:
        if "=" in p:
            k, v = p.split("=", 1)
            res[k.strip()] = v.strip()
    return res


def _int(v):
    try:
        return int(str(v).strip())
    except (TypeError, ValueError):
        return 0


def _team(v):
    m = re.search(r"\{\{\s*TeamOpponent\s*\|([^|}]*)", v or "")
    t = m.group(1).strip().lower() if m else ""
    if t.startswith("team="):                    # іменований варіант {{TeamOpponent|team=…}}
        t = t[5:].strip()
    return t if t and t not in ("tbd", "tba") else None


_LOSS = ("FF", "DQ", "L")


def _opp_status(v):
    """Особливий рахунок суперника з {{TeamOpponent|id|score=W}}: 'W', 'FF', 'DQ', 'L' або None."""
    found = _templates(v or "", "TeamOpponent")
    if not found:
        return None
    s = _params(found[0][1]).get("score", "").strip().upper()
    return s if s in ("W",) + _LOSS else None


def _walkover_side(prm, winner):
    """Хто переміг технічно: walkover=1|2, інакше score=W проти FF/DQ/L. '1', '2' або None."""
    wo = (prm.get("walkover") or "").strip().upper()
    if wo in ("1", "2"):
        return wo
    s1, s2 = _opp_status(prm.get("opponent1")), _opp_status(prm.get("opponent2"))
    if s1 == "W" and s2 != "W":
        return "1"
    if s2 == "W" and s1 != "W":
        return "2"
    if s1 in _LOSS and s2 not in _LOSS:
        return "2"
    if s2 in _LOSS and s1 not in _LOSS:
        return "1"
    if wo in ("W",) + _LOSS and winner in ("1", "2"):
        return winner
    return None


# Зміщення часових поясів із шаблонів {{Abbr/XXX}}. CST трактуємо як американський (-06:00).
TZ_OFFSETS = {
    "SGT": "+08:00", "CET": "+01:00", "CEST": "+02:00", "EET": "+02:00", "EEST": "+03:00",
    "UTC": "+00:00", "GMT": "+00:00", "CST": "-06:00", "CDT": "-05:00", "EST": "-05:00",
    "EDT": "-04:00", "PST": "-08:00", "PDT": "-07:00", "KST": "+09:00",
    "WET": "+00:00", "WEST": "+01:00", "BST": "+01:00", "MSK": "+03:00", "JST": "+09:00",
    "HKT": "+08:00", "AEST": "+10:00", "AEDT": "+11:00", "BRT": "-03:00", "MST": "-07:00",
    "MDT": "-06:00",
}
_MONTHS = {m: i + 1 for i, m in enumerate((
    "january", "february", "march", "april", "may", "june", "july", "august", "september",
    "october", "november", "december"))}
_MONTHS.update({m[:3]: n for m, n in list(_MONTHS.items())})
_MONTHS["sept"] = 9
_DATE = re.compile(
    r"^([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})"
    r"(?:\s*(?:-|–|—|,)?\s*(\d{1,2}):(\d{2}))?"
    r"\s*(?:\{\{\s*[Aa]bbr/([A-Za-z]+)\s*\}\}|([A-Za-z]{2,5}))?\s*$")


def date_iso(raw):
    """'November 24, 2026 - 12:05 {{Abbr/SGT}}' -> '2026-11-24T12:05:00+08:00'.

    Без часового поясу — UTC (як рахує Liquipedia). Без часу, з невідомим поясом чи датою — None."""
    m = _DATE.match((raw or "").strip()) if isinstance(raw, str) else None
    if not m or m.group(4) is None:
        return None
    month = _MONTHS.get(m.group(1).lower())
    offset = TZ_OFFSETS.get((m.group(6) or m.group(7) or "UTC").upper())
    if not month or offset is None:
        return None
    try:
        d = datetime.datetime(int(m.group(3)), month, int(m.group(2)), int(m.group(4)), int(m.group(5)))
    except ValueError:
        return None
    return d.strftime("%Y-%m-%dT%H:%M:%S") + offset


def parse_seeds(wikitext):
    """Сіди стадії зі списку SwissStandings: tiebreaker=16 означає сід 1 (як на сторінках Liquipedia 2024–2026)."""
    wikitext = _strip_comments(wikitext)
    found = _templates(wikitext, "SwissStandings")
    if found:
        ents = re.findall(r"\{\{\s*TeamOpponent\s*\|([^|}]*)\|\s*tiebreaker\s*=\s*(\d+)\s*\}\}", found[0][1])
        if ents:
            top = max(int(t) for _, t in ents)
            return [{"id": (i.strip().lower() or None), "seed": top + 1 - int(t)} for i, t in ents]
    # Старіший формат (2024–2025): {{SwissTableLeague |teamN=... |temp_tieN=...}}
    found = _templates(wikitext, "SwissTableLeague")
    if found:
        prm = _params(found[0][1])
        teams = {int(k[4:]): v.strip().lower() for k, v in prm.items() if re.fullmatch(r"team\d+", k)}
        ties = {int(k[8:]): _int(v) for k, v in prm.items() if re.fullmatch(r"temp_tie\d+", k)}
        if teams and len(ties) == len(teams):
            top = max(ties.values())
            return sorted(({"id": teams[n] or None, "seed": top + 1 - ties[n]} for n in teams),
                          key=lambda x: x["seed"])
    return []


def parse_stage(wikitext):
    wikitext = _strip_comments(wikitext)
    rounds = [(m.start(), int(m.group(1)))
              for m in re.finditer(r"====\s*Round\s+(\d)\s*====", wikitext)]

    def round_at(pos):
        r = None
        for p, n in rounds:
            if p <= pos:
                r = n
        return r

    matches = []
    for pos, body in _templates(wikitext, "Match"):
        m = _parse_match(body)
        m["round"] = round_at(pos)
        matches.append(m)
    return matches


def _parse_match(body):
    """Тіло шаблону {{Match …}} -> матч: команди, Bo, карти, переможець, дата (без раунду)."""
    prm = _params(body)
    a, b = _team(prm.get("opponent1")), _team(prm.get("opponent2"))
    maps, slots = [], 0
    for k in sorted((k for k in prm if re.fullmatch(r"map\d+", k)), key=lambda k: int(k[3:])):
        slots = max(slots, int(k[3:]))       # оголошені карти серії, навіть ще порожні
        mp = _templates("{{" + prm[k] + "}}", "Map")
        if not mp:
            continue
        q = _params(mp[0][1])
        s1 = _int(q.get("t1t")) + _int(q.get("t1ct"))
        s2 = _int(q.get("t2t")) + _int(q.get("t2ct"))
        for kk, vv in q.items():             # овертайми: o1t1t, o1t1ct, o2t2t, …
            if re.fullmatch(r"o\d+t1(t|ct)", kk):
                s1 += _int(vv)
            elif re.fullmatch(r"o\d+t2(t|ct)", kk):
                s2 += _int(vv)
        win = q.get("winner", "")
        fin = q.get("finished", "") == "true"
        if win not in ("1", "2") and fin and s1 != s2:
            win = "1" if s1 > s2 else "2"
        maps.append({"map": q.get("map") or None, "s1": s1, "s2": s2,
                     "finished": fin, "winner": win if win in ("1", "2") else None})
    series = max(slots, _int(prm.get("bestof")))
    finished = prm.get("finished", "") == "true"
    winner = prm.get("winner", "")
    w1 = sum(1 for m in maps if m["winner"] == "1")
    w2 = sum(1 for m in maps if m["winner"] == "2")
    need = series // 2 + 1 if series else 0
    # Редактори іноді забувають finished=true, хоча серію вже вирішено за картами. Виводимо це лише
    # за більшістю карт усієї серії (Bo3 — 2 карти), тож 1-0 у Bo3 лишається незавершеним.
    decided = bool(need) and max(w1, w2) >= need
    inferred = False
    if not finished and decided:
        finished, inferred = True, True
    # Технічна перемога (walkover / forfeit): карти переможця не дають.
    walkover = False
    side = _walkover_side(prm, winner) if w1 == w2 else None
    if side:
        walkover = True
        if not finished:                     # Liquipedia теж вважає такий матч завершеним
            finished, inferred = True, True
        if winner not in ("1", "2"):
            winner = side
    if winner not in ("1", "2") and finished and w1 != w2:
        winner = "1" if w1 > w2 else "2"
    win_id = a if winner == "1" else b if winner == "2" else None
    done = bool(finished and win_id)
    raw_date = prm.get("date") or ""
    return {
        "a": a, "b": b,
        "bestOf": series or None,
        "finished": done,
        "inferred": inferred and done,
        "walkover": walkover and done,
        "winner": win_id if finished else None,
        "date": re.sub(r"\{\{\s*[Aa]bbr/([A-Za-z]+)\s*\}\}", r"\1", raw_date).strip() or None,
        "dateISO": date_iso(raw_date),
        "maps": [m for m in maps if m["map"] or m["s1"] or m["s2"]],
    }


_PO_SHAPE = {(1, 1), (1, 2), (1, 3), (1, 4), (2, 1), (2, 2), (3, 1)}


def parse_playoffs(wikitext):
    """Сітка на 8 команд {{Bracket|Bracket/8|R1M1={{Match…}}…}} -> 7 матчів з round (1 — чвертьфінали,
    2 — півфінали, 3 — фінал) і slot (R1M1 і R1M2 ведуть у перший півфінал). [] — такої сітки немає."""
    wikitext = _strip_comments(wikitext)
    for _, body in _templates(wikitext, "Bracket"):
        found = []
        for k, v in _params(body).items():
            km = re.fullmatch(r"R(\d+)M(\d+)", k)
            t = _templates(v, "Match") if km else None
            if not t:
                continue
            x = _parse_match(t[0][1])
            x["round"], x["slot"] = int(km.group(1)), int(km.group(2))
            found.append(x)
        if len(found) == 7 and {(x["round"], x["slot"]) for x in found} == _PO_SHAPE:
            return sorted(found, key=lambda x: (x["round"], x["slot"]))
    return []


def _empty_playoffs():
    return {"revision": None, "matches": []}


def _playoffs_from_pages(pages, old):
    """Плей-оф з першої сторінки, де є сітка на 8 команд -> (дані, помилка). Сітки ще немає — порожньо, без помилки."""
    for title in PLAYOFF_PAGES:
        page = pages.get(title)
        if not page or not isinstance(page[0], str) or page[0].lstrip()[:9].upper() == "#REDIRECT":
            continue
        try:
            matches = parse_playoffs(page[0])
        except Exception:  # noqa: BLE001 — зламана розмітка не має валити сервер
            return None, "Liquipedia: не вдалося розібрати сітку плей-оф"
        if matches:
            was, now = _finished_count(old), sum(1 for m in matches if m["finished"])
            if now < was:
                return None, "Liquipedia: зіграних матчів плей-оф стало менше (%d → %d)" % (was, now)
            return {"revision": page[1], "page": title, "matches": matches}, None
    return _empty_playoffs(), None


# ------------------------------------------------------------------ fetch ---

def _pages_from_api(data, titles):
    """Відповідь API (formatversion=2, redirects=1) -> {запитана назва: (wikitext, timestamp)}.

    Нормалізовані й перенаправлені назви зводимо назад до запитаних; відсутніх сторінок у словнику немає."""
    if not isinstance(data, dict):
        raise ValueError("неочікувана відповідь API")
    if data.get("error"):
        err = data["error"]
        raise ValueError(err.get("info") or err.get("code") if isinstance(err, dict) else err)
    q = data.get("query")
    if not isinstance(q, dict):
        raise ValueError("у відповіді API немає query")
    hop = {}
    for n in (q.get("normalized") or []) + (q.get("redirects") or []):
        if isinstance(n, dict) and n.get("from") and n.get("to"):
            hop[n["from"]] = n["to"]
    pages = q.get("pages") or []
    if isinstance(pages, dict):                  # formatversion=1
        pages = list(pages.values())
    found = {}
    for p in pages:
        if not isinstance(p, dict) or p.get("missing") or p.get("invalid") or not p.get("revisions"):
            continue
        rev = p["revisions"][0]
        content = ((rev.get("slots") or {}).get("main") or {}).get("content", rev.get("content"))
        if isinstance(content, str):
            found[p.get("title")] = (content, rev.get("timestamp"))
    out = {}
    for t in titles:
        cur, seen = t, set()
        while cur in hop and cur not in seen:
            seen.add(cur)
            cur = hop[cur]
        if cur in found:
            out[t] = found[cur]
    return out


def _fetch_pages(titles):
    """Один запит до Liquipedia на кілька сторінок: {запитана назва: (wikitext, timestamp)}."""
    q = urllib.parse.urlencode({
        "action": "query", "prop": "revisions", "rvprop": "content|timestamp",
        "rvslots": "main", "titles": "|".join(titles), "format": "json", "formatversion": "2",
        "redirects": "1",
    })
    wait = MIN_GAP_SECONDS - (time.monotonic() - _last_request[0])
    if wait > 0:
        _sleep(wait)
    req = urllib.request.Request(API + "?" + q, headers={
        "User-Agent": USER_AGENT, "Accept-Encoding": "gzip"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read()
            if r.headers.get("Content-Encoding") == "gzip":
                raw = gzip.decompress(raw)
    finally:
        _last_request[0] = time.monotonic()
    return _pages_from_api(json.loads(raw), titles)


def _empty_stage():
    return {"revision": None, "matches": [], "seeds": []}


def _finished_count(stage):
    return sum(1 for m in (stage or {}).get("matches") or [] if isinstance(m, dict) and m.get("finished"))


def _snapshot_path():
    return os.path.join(DATA, "cache", "all.json")


def _normalize_payload(p):
    """Знімок (зокрема від старішої версії сервера) -> поточна форма. None, якщо це не знімок."""
    if not isinstance(p, dict) or not isinstance(p.get("stages"), dict):
        return None
    out = {"source": p.get("source") or SOURCE, "fetchedAt": _iso_fix(p.get("fetchedAt")),
           "stale": bool(p.get("stale")), "error": p.get("error"), "stages": {}}
    for key in STAGE_PAGES:
        st = p["stages"].get(key)
        if not isinstance(st, dict):
            out["stages"][key] = _empty_stage()
            continue
        ms = [m for m in st.get("matches") or [] if isinstance(m, dict)]
        for m in ms:
            m.setdefault("inferred", False)
            m.setdefault("walkover", False)
            m.setdefault("maps", [])
            if "dateISO" not in m:
                m["dateISO"] = date_iso(m.get("date"))
        clean = {"revision": st.get("revision"), "matches": ms, "seeds": st.get("seeds") or []}
        if st.get("error"):
            clean["error"] = st["error"]
        out["stages"][key] = clean
    po = p["stages"].get("playoffs")
    if isinstance(po, dict):
        ms = [m for m in po.get("matches") or [] if isinstance(m, dict) and m.get("round")]
        for m in ms:
            m.setdefault("inferred", False)
            m.setdefault("walkover", False)
            m.setdefault("maps", [])
        clean = {"revision": po.get("revision"), "matches": ms}
        for k in ("page", "error"):
            if po.get(k):
                clean[k] = po[k]
        out["stages"]["playoffs"] = clean
    else:
        out["stages"]["playoffs"] = _empty_playoffs()
    return out


def _load_snapshot_file():
    try:
        with open(_snapshot_path(), encoding="utf-8") as f:
            return _normalize_payload(json.load(f))
    except (OSError, ValueError):
        return None


def _stage_from_page(page, old):
    """Нова стадія зі сторінки або (None, помилка), якщо сторінці не можна вірити."""
    if page is None or not isinstance(page[0], str):
        return None, "Liquipedia: сторінку стадії не знайдено"
    text, ts = page
    if text.lstrip()[:9].upper() == "#REDIRECT":
        return None, "Liquipedia: сторінку стадії перенесено"
    try:
        matches, seeds = parse_stage(text), parse_seeds(text)
    except Exception:  # noqa: BLE001 — зламана розмітка не має валити сервер
        return None, "Liquipedia: не вдалося розібрати сторінку стадії"
    if not matches:
        return None, "Liquipedia: на сторінці стадії немає матчів"
    was, now = _finished_count(old), sum(1 for m in matches if m["finished"])
    if now < was:
        return None, "Liquipedia: зіграних матчів стало менше (%d → %d)" % (was, now)
    return {"revision": ts, "matches": matches, "seeds": seeds}, None


def _build_payload(pages, prev):
    """Знімок з відповіді Liquipedia. Стадія, якій не можна вірити, лишається з попереднього знімка."""
    prev_stages = (prev or {}).get("stages") or {}
    payload = {"source": SOURCE, "fetchedAt": _now_iso(), "stale": False, "error": None, "stages": {}}
    failed = 0
    for key, title in STAGE_PAGES.items():
        old = prev_stages.get(key) if isinstance(prev_stages.get(key), dict) else None
        st, err = _stage_from_page(pages.get(title), old)
        if err:
            failed += 1
            if old and (old.get("matches") or old.get("seeds")):
                st = json.loads(json.dumps(old))
                err += "; показую попередні дані"
            else:
                st = _empty_stage()
            st["error"] = err
        payload["stages"][key] = st
    old = prev_stages.get("playoffs") if isinstance(prev_stages.get("playoffs"), dict) else None
    po, err = _playoffs_from_pages(pages, old)
    if err:
        keep = bool(old and old.get("matches"))
        po = json.loads(json.dumps(old)) if keep else _empty_playoffs()
        po["error"] = err + ("; показую попередні дані" if keep else "")
    payload["stages"]["playoffs"] = po
    if failed == len(STAGE_PAGES):
        payload.update(stale=True, error="Liquipedia: жодну стадію не оновлено",
                       fetchedAt=(prev or {}).get("fetchedAt"))
    return payload


def _failed_payload(prev, exc):
    """Liquipedia не відповіла: лишаємо попередній знімок і позначаємо його застарілим."""
    if prev:
        payload = json.loads(json.dumps(prev))
    else:
        payload = {"source": SOURCE, "fetchedAt": None, "stages": {k: _empty_stage() for k in STAGE_PAGES}}
        payload["stages"]["playoffs"] = _empty_playoffs()
    payload["stale"] = True
    payload["error"] = "Liquipedia недоступна: %s" % (str(exc) or exc.__class__.__name__)
    return payload


def _backoff_delay(exc):
    """Скільки секунд не питати Liquipedia після цієї помилки (0 — помилка не про перевантаження)."""
    if getattr(exc, "code", None) not in (429, 503):
        return 0
    step = BACKOFF_STEPS[min(_backoff["n"], len(BACKOFF_STEPS) - 1)]
    try:
        asked = int((exc.headers or {}).get("Retry-After") or 0)
    except (TypeError, ValueError, AttributeError):
        asked = 0
    return max(step, min(asked, 3600))


def _refresh(reuse_after=None):
    """Оновлює знімок одним запитом до Liquipedia (не більше одного запиту одночасно).

    reuse_after: якщо інший запит завершився після цього моменту (monotonic), повторно не питаємо."""
    with _fetch_lock:
        with _lock:
            done = _mem["done"]
            if reuse_after is not None and done is not None and done >= reuse_after and _mem["payload"]:
                return _mem["payload"]
            prev = _mem["payload"]
            _mem["stamp"] = time.monotonic()     # вік знімка рахуємо від ПОЧАТКУ запиту
        if prev is None:
            prev = _load_snapshot_file()
        left = _backoff["until"] - time.monotonic()
        if left > 0:                              # Liquipedia просила почекати — не питаємо
            payload = _failed_payload(prev, RuntimeError(
                "забагато запитів, наступна спроба через %d хв" % max(1, int(left + 59) // 60)))
        else:
            payload = None
        try:
            if payload is None:
                payload = _build_payload(_fetch_pages(list(STAGE_PAGES.values()) + list(PLAYOFF_PAGES)), prev)
                _backoff.update(until=0.0, n=0)
        except Exception as e:  # noqa: BLE001 — мережа, HTTP 4xx/5xx, зламаний JSON
            sys.stderr.write("%s Liquipedia: %s\n" % (time.strftime("%H:%M:%S"), e))
            delay = _backoff_delay(e)
            if delay:
                _backoff.update(until=time.monotonic() + delay, n=_backoff["n"] + 1)
                sys.stderr.write("%s Liquipedia: пауза %d хв\n" % (time.strftime("%H:%M:%S"), delay // 60))
            payload = _failed_payload(prev, e)
        else:
            if not payload["stale"]:
                try:
                    _write_json_atomic(_snapshot_path(), payload)
                except OSError as e:
                    sys.stderr.write("%s кеш не записано: %s\n" % (time.strftime("%H:%M:%S"), e))
        with _lock:
            _mem["payload"] = payload
            _mem["done"] = time.monotonic()
        return payload


def _start_refresh_locked():
    """Запускає фонове оновлення, якщо воно ще не йде (викликати під _lock)."""
    if _mem["refreshing"]:
        return
    _mem["refreshing"] = True
    asked = time.monotonic()

    def run():
        try:
            _refresh(reuse_after=asked)
        except Exception as e:  # noqa: BLE001 — запобіжник: потік не має падати мовчки
            sys.stderr.write("%s фонове оновлення: %s\n" % (time.strftime("%H:%M:%S"), e))
        finally:
            with _lock:
                _mem["refreshing"] = False

    t = threading.Thread(target=run, name="cs2p-refresh", daemon=True)
    _mem["thread"] = t
    t.start()


def _snapshot_for_request():
    """(знімок, refreshing): віддаємо одразу те, що є; застарілий знімок оновлюємо у фоні."""
    asked = time.monotonic()
    with _lock:
        payload = _mem["payload"]
        if payload is None:                      # перший запит після старту: знімок із диска
            payload = _load_snapshot_file()
            if payload is not None:
                _mem["payload"] = payload        # stamp лишається None -> оновлюємо у фоні
        if payload is not None:
            if _mem["stamp"] is None or asked - _mem["stamp"] >= CACHE_SECONDS:
                _start_refresh_locked()
            return payload, _mem["refreshing"]
    return _refresh(reuse_after=asked), False    # ні пам'яті, ні файлу: чекаємо на Liquipedia


def get_all_results(force=False, offline=False):
    """Результати всіх стадій (stale-while-revalidate, один запит на всі сторінки) + ручні виправлення.

    offline=True — лише останній збережений знімок, без запитів до Liquipedia (для скриптів, коли сайт вимкнено)."""
    if offline:
        payload = _load_snapshot_file() or _failed_payload(None, RuntimeError("немає збереженого знімка"))
        payload, refreshing = payload, False
    elif force:
        payload, refreshing = _refresh(reuse_after=time.monotonic()), False
    else:
        payload, refreshing = _snapshot_for_request()
    out = json.loads(json.dumps(payload))
    out["refreshing"] = bool(refreshing)
    stages = out.setdefault("stages", {})
    for key in RESULT_KEYS:
        st = stages.get(key)
        if not isinstance(st, dict):
            st = stages[key] = _empty_playoffs() if key == "playoffs" else _empty_stage()
        st["matches"], st["manualApplied"], st["manualErrors"] = _apply_manual(key, st.get("matches") or [])
    return out


def get_results(stage, force=False):
    if stage not in RESULT_KEYS:
        raise ValueError("Невідома стадія")
    allr = get_all_results(force)
    out = dict(allr["stages"][stage])
    errors = [e for e in (allr.get("error"), out.get("error")) if e]
    out.update({"stage": stage, "fetchedAt": allr.get("fetchedAt"), "stale": allr.get("stale"),
                "error": "; ".join(errors) or None, "source": allr.get("source"),
                "refreshing": allr.get("refreshing")})
    return out


# ---------------------------------------------------------- ручні виправлення ---

def _known_ids():
    """Усі id команд із data/teams.json (teams та invited усіх стадій); None, якщо файл не прочитати."""
    try:
        with open(os.path.join(DATA, "teams.json"), encoding="utf-8") as f:
            cfg = json.load(f)
        ids = set()
        for st in (cfg.get("stages") or {}).values():
            for t in (st.get("teams") or []) + (st.get("invited") or []):
                if isinstance(t, dict) and isinstance(t.get("id"), str):
                    ids.add(t["id"].strip().lower())
        return ids
    except Exception:  # noqa: BLE001
        return None


def _manual_entry(e, known):
    """Запис ручного виправлення -> ((round, a, b, winner), None) або (None, причина)."""
    if not isinstance(e, dict):
        return None, "має бути об'єктом {round, a, b, winner}"
    r = e.get("round")
    if isinstance(r, str) and re.fullmatch(r"\s*[0-9]+\s*", r):
        r = int(r)
    if isinstance(r, bool) or not isinstance(r, int) or not 1 <= r <= 5:
        return None, "раунд має бути числом від 1 до 5"
    a, b = e.get("a"), e.get("b")
    if not isinstance(a, str) or not isinstance(b, str) or not a.strip() or not b.strip():
        return None, "потрібні дві команди: a і b"
    a, b = a.strip().lower(), b.strip().lower()
    if a == b:
        return None, "a і b — та сама команда"
    for t in (a, b):
        if known is not None and t not in known:
            return None, "невідома команда «%s»" % t
    w = e.get("winner")
    if w is None or (isinstance(w, str) and not w.strip()):
        w = None
    elif isinstance(w, str) and w.strip().lower() in (a, b):
        w = w.strip().lower()
    else:
        return None, "переможець має бути a або b"
    return (r, a, b, w), None


def _manual_slot(matches, r, a, b):
    """Матч для запису: та сама пара в раунді; далі слот, де є одна з команд, а суперник порожній;
    далі повністю порожній слот. -> (матч, None) або (None, причина). Порожні місця заповнює."""
    rnd = [x for x in matches if x.get("round") == r]
    pair = {a, b}
    for x in rnd:
        if {x.get("a"), x.get("b")} == pair:
            return x, None
    busy = [t for t in (a, b) if any(t in (x.get("a"), x.get("b")) for x in rnd)]
    for x in rnd:
        for have, empty in (("a", "b"), ("b", "a")):
            if x.get(have) in pair and not x.get(empty):
                other = b if x.get(have) == a else a
                if other in busy:
                    return None, "%s уже грає інший матч у раунді %d" % (other, r)
                x[empty], x["manual"] = other, True
                return x, None
    if busy:
        return None, "%s уже грає інший матч у раунді %d" % (busy[0], r)
    for x in rnd:
        if not x.get("a") and not x.get("b"):
            x["a"], x["b"], x["manual"] = a, b, True
            return x, None
    return None, "у раунді %d немає вільного місця для пари" % r


def _apply_manual(stage, matches):
    """Ручні виправлення з data/results/<stage>.manual.json -> (matches, застосовано, [пропущені записи]).

    Зламаний файл чи запис ніколи не ламає /api/results: його пропускаємо й пояснюємо чому."""
    name = stage + ".manual.json"
    path = os.path.join(DATA, "results", name)
    if not os.path.exists(path):
        return matches, 0, []
    try:
        with open(path, encoding="utf-8-sig") as f:      # -sig: файл, збережений з BOM, теж читається
            manual = json.load(f)
    except json.JSONDecodeError as e:
        return matches, 0, ["%s: помилка JSON у рядку %d" % (name, e.lineno)]
    except (OSError, ValueError):
        return matches, 0, ["%s: не вдалося прочитати файл" % name]
    entries = manual.get("matches") if isinstance(manual, dict) else manual
    if not isinstance(entries, list):
        return matches, 0, ['%s: потрібен формат {"matches": [...]}' % name]
    known = _known_ids()
    used, errors = 0, []
    for i, e in enumerate(entries, 1):
        try:
            ok, why = _manual_entry(e, known)
            if why:
                errors.append("Запис %d: %s" % (i, why))
                continue
            r, a, b, w = ok
            label = "Запис %d (раунд %d, %s – %s)" % (i, r, a, b)
            hit, why = _manual_slot(matches, r, a, b)
            if why:
                errors.append("%s: %s" % (label, why))
                continue
            if w:
                if hit.get("winner") != w:
                    hit["walkover"] = False
                hit["winner"], hit["finished"], hit["inferred"], hit["manual"] = w, True, False, True
            used += 1
        except Exception:  # noqa: BLE001
            errors.append("Запис %d: не вдалося застосувати" % i)
    return matches, used, errors


def data_version():
    """Відбиток файлів даних (без кешу): сторінка перераховує все, коли він змінюється."""
    parts = []
    for dirpath, dirs, files in os.walk(DATA):
        dirs[:] = [d for d in dirs if d != "cache"]
        for name in files:
            if name.endswith(".json"):
                p = os.path.join(dirpath, name)
                try:
                    st = os.stat(p)
                except OSError:                  # файл щойно прибрали
                    continue
                parts.append("%s:%d:%d" % (os.path.relpath(p, DATA), st.st_mtime_ns, st.st_size))
    return hashlib.sha1("|".join(sorted(parts)).encode("utf-8")).hexdigest()[:12]


# ------------------------------------------------------------------ картки ---

def _cards_path():
    return os.path.join(DATA, "my-cards.json")


def _load_cards():
    """(картки, зіпсований_файл): зіпсований чи не-об'єкт читається як {}."""
    try:
        with open(_cards_path(), encoding="utf-8") as f:
            cards = json.load(f)
    except FileNotFoundError:
        return {}, False
    except (OSError, ValueError):
        return {}, True
    if not isinstance(cards, dict):
        return {}, True
    return cards, False


def _cards_for_output(cards):
    out = {}
    for k, v in cards.items():
        if isinstance(v, dict) and "savedAt" in v:
            v = dict(v, savedAt=_iso_fix(v["savedAt"]))
        out[k] = v
    return out


def _id_list(v, key, cap):
    """Список різних непорожніх id (не більше cap) -> (список, None) або (None, причина)."""
    if not isinstance(v, list):
        return None, "%s має бути списком" % key
    if len(v) > cap:
        return None, "у %s не більше %d команд" % (key, cap)
    out = []
    for t in v:
        if not isinstance(t, str) or not t.strip() or len(t.strip()) > 64:
            return None, "у %s порожня або неправильна назва команди" % key
        t = t.strip()
        if t in out:
            return None, "у %s двічі «%s»" % (key, t)
        out.append(t)
    return out, None


def validate_card(stage, card):
    """Перевіряє картку з POST -> (чиста картка, None) або (None, причина). Неповна картка — нормально."""
    if not isinstance(card, dict):
        return None, "картка має бути JSON-об'єктом"
    out = {}
    if stage == "playoffs":
        for key, cap in PLAYOFF_SLOTS:
            out[key], err = _id_list(card.get(key), key, cap)
            if err:
                return None, err
        champ = card.get("champion")
        if champ is not None:
            if not isinstance(champ, str) or not champ.strip() or len(champ.strip()) > 64:
                return None, "champion має бути назвою команди або null"
            champ = champ.strip()
        out["champion"] = champ
        return out, None
    where = {}
    for key, cap in SWISS_SLOTS:
        out[key], err = _id_list(card.get(key), key, cap)
        if err:
            return None, err
        for t in out[key]:
            if t in where:
                return None, "«%s» одразу в %s і %s" % (t, where[t], key)
            where[t] = key
    return out, None


# ------------------------------------------------------- AI та експерти ---
# data/ai/<stage>.json і data/analysts/<stage>.json пише рутина Claude Code (/predict-stage);
# сторінка забирає їх одним запитом. Зіпсований файл не ламає відповідь.
INSIGHT_STAGES = ("stage1", "stage2", "stage3", "playoffs")


def _read_json_file(path):
    try:
        with open(path, encoding="utf-8-sig") as f:
            obj = json.load(f)
    except FileNotFoundError:
        return None
    except (OSError, ValueError):
        return {"error": "файл зіпсовано: " + os.path.basename(path)}
    return obj if isinstance(obj, dict) else {"error": "файл має бути JSON-об'єктом: " + os.path.basename(path)}


def get_insights():
    return {st: {"ai": _read_json_file(os.path.join(DATA, "ai", st + ".json")),
                 "analysts": _read_json_file(os.path.join(DATA, "analysts", st + ".json"))}
            for st in INSIGHT_STAGES}


# ---------------------------------------------------------------- профілі ---
# «Я» — як і раніше, картки в data/my-cards.json (їх читають і scripts/recommend.sh, і рутина).
# Інші профілі (друзі тощо) — у data/profiles.json:
#   {"names": {"me": "Я"}, "profiles": [{"id": "p1a2b3c", "name": "Друг"}], "cards": {"p1a2b3c": {"stage1": {...}}}}
# Сховище в пам'яті — це сам вміст файлу. Усе, чого сервер не розуміє (зайві ключі, записи з іншим id
# та їхні картки), він не показує, але й не чіпає: під час запису воно повертається у файл як було.
ME = "me"
MAX_PROFILES = 12
PROFILES_CORRUPT = "Файл data/profiles.json пошкоджено — виправ його або перейменуй; профілі друзів не змінено"
_PROFILE_ID = re.compile(r"p[0-9a-f]{6}")


def _profiles_path():
    return os.path.join(DATA, "profiles.json")


def _is_friend(p):
    """Запис профілю, який сервер розуміє: id на кшталт p1a2b3c і текстове ім'я."""
    return isinstance(p.get("id"), str) and bool(_PROFILE_ID.fullmatch(p["id"])) and isinstance(p.get("name"), str)


def _friends(store):
    """Профілі друзів, які показуємо; решта записів лишається у файлі як є."""
    return [p for p in store["profiles"] if _is_friend(p)]


def _load_profiles():
    """(сховище, зіпсований_файл). Файлу немає — порожнє сховище, це нормально.

    Файл, який не вдалося прочитати чи розібрати, або з іншою будовою — (порожнє сховище, True).
    Такий файл не можна перезаписувати: у ньому чиїсь профілі й картки."""
    empty = {"names": {}, "profiles": [], "cards": {}}
    try:
        with open(_profiles_path(), encoding="utf-8-sig") as f:     # -sig: файл, збережений з BOM, теж читається
            store = json.load(f)
        json.dumps(store, ensure_ascii=False).encode("utf-8")       # і назад має записатися (половинка сурогату — ні)
    except FileNotFoundError:
        return empty, False
    except (OSError, ValueError, RecursionError):
        return empty, True
    if not (isinstance(store, dict)
            and isinstance(store.setdefault("names", {}), dict)
            and isinstance(store.setdefault("profiles", []), list)
            and isinstance(store.setdefault("cards", {}), dict)
            and all(isinstance(p, dict) for p in store["profiles"])
            and all(isinstance(store["cards"].get(p["id"], {}), dict) for p in _friends(store))):
        return empty, True
    return store, False


def profile_list(store):
    me = store["names"].get(ME)
    return [{"id": ME, "name": me if isinstance(me, str) and me else "Я"}] + \
           [{"id": p["id"], "name": p["name"]} for p in _friends(store)]


# Невидимі символи з «видимих» категорій Unicode: заповнювачі хангиль і порожній знак Брайля.
# Коди — числами, щоб у самому файлі не було невидимих символів.
_BLANK = frozenset(map(chr, (0x115F, 0x1160, 0x3164, 0xFFA0, 0x2800)))
_ZWJ, _VS16 = chr(0x200D), chr(0xFE0F)       # zero-width joiner і варіаційний селектор (деталі емодзі)


def _category(ch):
    """Категорія Unicode. Cn — символ, новіший за таблиці цього Python (скажімо, свіже емодзі): вважаємо знаком."""
    cat = unicodedata.category(ch)
    return "So" if cat == "Cn" else cat


def _invisible(ch):
    """Символ, якого не видно: форматувальний (zero-width, зміна напрямку тексту) або порожня «літера»."""
    return _category(ch) == "Cf" or ch in _BLANK


def _emoji_part(ch):
    """Знак (емодзі — теж знаки): лише між такими zero-width joiner щось склеює."""
    return _category(ch)[0] == "S"


def clean_name(name):
    """Ім'я профілю -> (ім'я, None) або (None, причина).

    Будь-які пробіли зводимо до одного, невидимі символи викидаємо (zero-width joiner лишається тільки
    всередині складених емодзі — «родина», «прапор-веселка» тощо), результат — у формі NFC."""
    if not isinstance(name, str):
        return None, "ім'я має бути текстом"
    out = []
    for i, ch in enumerate(name):
        if ch.isspace():
            out.append(" ")
        elif ch == _ZWJ:
            before = [c for c in out[-2:] if c != _VS16][-1:]       # емодзі або емодзі + варіаційний селектор
            if before and _emoji_part(before[0]) and _emoji_part(name[i + 1:i + 2] or " "):
                out.append(ch)
        elif _invisible(ch):
            continue
        elif _category(ch) in ("Cc", "Cs", "Co"):                   # керівні, половинки сурогатів, приватні
            return None, "в імені недозволені символи"
        else:
            out.append(ch)
    name = unicodedata.normalize("NFC", " ".join("".join(out).split()))
    if not name:
        return None, "ім'я порожнє"
    if len(name) > 24:
        return None, "ім'я довше за 24 символи"
    if not any(_category(ch)[0] in "LNPS" for ch in name):
        return None, "в імені немає видимих символів"
    return name, None


def _name_key(name):
    """Ключ для пошуку однакових на вигляд імен: без невидимих символів, NFC, без різниці регістру."""
    name = " ".join("".join(ch for ch in name if not _invisible(ch)).split())
    return unicodedata.normalize("NFC", unicodedata.normalize("NFC", name).casefold())


def _name_taken(store, name, but=None):
    """Чи є вже профіль із таким самим на вигляд іменем (крім профілю but)."""
    key = _name_key(name)
    return any(_name_key(p["name"]) == key and p["id"] != but for p in profile_list(store))


def _profile_exists(store, pid):
    return pid == ME or any(p["id"] == pid for p in _friends(store))


def _new_profile_id(store):
    """Новий id, якого у файлі ще немає ні серед записів профілів (і прихованих теж), ні серед карток."""
    taken = {p["id"] for p in store["profiles"] if isinstance(p.get("id"), str)} | set(store["cards"])
    while True:
        pid = "p" + secrets.token_hex(3)
        if pid not in taken:
            return pid


# ----------------------------------------------------------------- server ---
FORBIDDEN = "Заборонено: запит не з цієї сторінки"


def _inside(path, base):
    base = os.path.realpath(base)
    return path == base or path.startswith(base.rstrip(os.sep) + os.sep)


class Handler(SimpleHTTPRequestHandler):
    timeout = 30                 # клієнт, що оголосив тіло й не надіслав його, не тримає потік вічно

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):
        if "/api/" in (getattr(self, "path", "") or ""):
            sys.stderr.write("%s %s\n" % (time.strftime("%H:%M:%S"), fmt % args))

    def end_headers(self):
        if not getattr(self, "_api", False):
            self.send_header("Cache-Control", "no-cache")    # сторінка завжди перевіряє свіжість файлів
        super().end_headers()

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self._api = True
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":               # на HEAD — лише заголовки
            self.wfile.write(body)

    def _fail(self, where):
        sys.stderr.write("%s %s: %s\n" % (time.strftime("%H:%M:%S"), where, sys.exc_info()[1]))
        if not getattr(self, "_api", False):
            self._json({"error": "Помилка сервера"}, 500)

    # --- статичні файли ---
    def list_directory(self, path):
        self.send_error(404)
        return None

    def _static_target(self, url_path):
        """(URL-шлях файлу всередині web/ чи data/ (крім data/cache/), чи лежить файл у data/) або (None, False)."""
        if url_path in ("/", "/index.html"):
            url_path = "/web/index.html"
        if not (url_path.startswith("/web/") or url_path.startswith("/data/")):
            return None, False
        try:
            real = os.path.realpath(self.translate_path(url_path))
        except (ValueError, OSError):
            return None, False
        if "\x00" in real:                       # open() упав би з ValueError і обірвав з'єднання
            return None, False
        if not (_inside(real, WEB) or _inside(real, DATA)) or _inside(real, os.path.join(DATA, "cache")):
            return None, False
        # data/ — і за адресою, і за справжнім шляхом: /web/../data/… теж веде туди
        return url_path, url_path.startswith("/data/") or _inside(real, DATA)

    def _static(self, head):
        target, private = self._static_target(urllib.parse.urlparse(self.path).path)
        if target is None:
            self.send_error(404)
            return
        if private and not self._same_site():    # у data/ — картки й імена: лише для своєї сторінки
            return self._json({"error": FORBIDDEN}, 403)
        self.path = target
        return super().do_HEAD() if head else super().do_GET()

    def do_HEAD(self):
        self._api = False
        if urllib.parse.urlparse(self.path).path.startswith("/api/"):
            self.send_error(404)
            return
        return self._static(head=True)

    # --- API ---
    def do_GET(self):
        self._api = False
        u = urllib.parse.urlparse(self.path)
        if not u.path.startswith("/api/"):
            return self._static(head=False)
        try:
            if not self._same_site():
                return self._json({"error": FORBIDDEN}, 403)
            return self._get_api(u)
        except Exception:  # noqa: BLE001
            self._fail("GET " + u.path)

    def _get_api(self, u):
        q = urllib.parse.parse_qs(u.query)
        stage = (q.get("stage") or ["all"])[0]
        force = q.get("force") == ["1"]
        if u.path == "/api/results":
            if stage == "all":
                return self._json(get_all_results(force))
            if stage not in RESULT_KEYS:
                return self._json({"error": "Невідома стадія"}, 400)
            return self._json(get_results(stage, force))
        if u.path == "/api/version":
            return self._json({"version": data_version()})
        if u.path == "/api/card":
            if stage != "all" and stage not in CARD_STAGES:
                return self._json({"error": "Невідома стадія"}, 400)
            profile = (q.get("profile") or [ME])[0]
            if profile == ME:                         # «Я»: data/profiles.json навіть не відкриваємо
                cards = _cards_for_output(_load_cards()[0])
                return self._json(cards if stage == "all" else (cards.get(stage) or {}))
            store, corrupt = _load_profiles()
            if profile == "all":                      # картки всіх профілів: {"me": {...}, "p1a2b3c": {...}}
                out = {ME: _cards_for_output(_load_cards()[0])}
                for p in _friends(store):             # зіпсований файл профілів: лишається тільки «Я»
                    out[p["id"]] = _cards_for_output(store["cards"].get(p["id"]) or {})
                if stage != "all":
                    out = {pid: (c.get(stage) or {}) for pid, c in out.items()}
                return self._json(out)
            if corrupt:
                return self._json({"error": PROFILES_CORRUPT}, 503)
            if not _profile_exists(store, profile):
                return self._json({"error": "Невідомий профіль"}, 404)
            cards = _cards_for_output(store["cards"].get(profile) or {})
            return self._json(cards if stage == "all" else (cards.get(stage) or {}))
        if u.path == "/api/profiles":
            store, corrupt = _load_profiles()
            out = {"profiles": profile_list(store)}
            if corrupt:                               # сторінка покаже попередження; друзів не видно, але вони цілі
                out["error"] = PROFILES_CORRUPT
            return self._json(out)
        if u.path == "/api/insights":
            return self._json(get_insights())
        return self._json({"error": "Не знайдено"}, 404)

    def _same_site(self):
        """Host — лише 127.0.0.1:порт або localhost:порт; Origin (якщо є) — та сама адреса з http://.

        Перевіряємо для кожного запиту до /api/ і до файлів із data/. Сторінка з чужого сайту, навіть
        якщо її домен перекинули на 127.0.0.1 (DNS rebinding), приходить зі своїм Host і нічого не отримує.
        Сам сайт і curl у GET заголовка Origin не надсилають, тому без нього — можна."""
        port = self.server.server_address[1]
        hosts = ("127.0.0.1:%d" % port, "localhost:%d" % port)
        if (self.headers.get("Host") or "").strip().lower() not in hosts:
            return False
        origin = self.headers.get("Origin")
        return origin is None or origin.strip().lower() in tuple("http://" + h for h in hosts)

    def do_POST(self):
        self._api = False
        u = urllib.parse.urlparse(self.path)
        try:
            if u.path == "/api/profiles":
                return self._post_profiles()
            return self._post_card(u)
        except Exception:  # noqa: BLE001
            self._fail("POST " + u.path)

    def _json_body(self):
        """Спільні перевірки тіла POST -> (dict, False) або (None, True), коли відповідь уже надіслано."""
        ctype = (self.headers.get("Content-Type") or "").split(";", 1)[0].strip().lower()
        if ctype != "application/json":
            self._reject("Потрібен Content-Type: application/json", 415)
            return None, True
        size = (self.headers.get("Content-Length") or "").strip()
        if not re.fullmatch(r"[0-9]+", size):
            self._json({"error": "Неправильний Content-Length"}, 400)
            return None, True
        if int(size) > MAX_BODY:
            self._json({"error": "Запит завеликий"}, 413)
            return None, True
        body = self.rfile.read(int(size)) if int(size) else b""
        try:
            obj = json.loads(body.decode("utf-8"))
        except (ValueError, RecursionError):
            obj = None
        if not isinstance(obj, dict):
            self._json({"error": "Тіло запиту має бути JSON-об'єктом"}, 400)
            return None, True
        return obj, False

    def _post_profiles(self):
        """POST /api/profiles {action: create|rename|delete, id?, name?} -> {ok, profiles, profile?, version}."""
        if not self._same_site():
            return self._reject(FORBIDDEN, 403)
        req, done = self._json_body()
        if done:
            return None
        action = req.get("action")
        with _cards_lock:
            store, corrupt = _load_profiles()
            if corrupt:                          # зіпсований файл не перезаписуємо: у ньому чиїсь профілі й картки
                return self._json({"error": PROFILES_CORRUPT}, 503)
            if action == "create":
                name, err = clean_name(req.get("name"))
                if err:
                    return self._json({"error": "Погане ім'я: " + err}, 400)
                if len(_friends(store)) + 1 >= MAX_PROFILES:
                    return self._json({"error": "Забагато профілів (максимум %d)" % MAX_PROFILES}, 400)
                if _name_taken(store, name):
                    return self._json({"error": "Профіль «%s» уже є" % name}, 409)
                prof = {"id": _new_profile_id(store), "name": name}
                store["profiles"].append(prof)
            elif action in ("rename", "delete"):
                pid = req.get("id")
                if not isinstance(pid, str) or not _profile_exists(store, pid):
                    return self._json({"error": "Невідомий профіль"}, 404)
                prof = None
                if action == "rename":
                    name, err = clean_name(req.get("name"))
                    if err:
                        return self._json({"error": "Погане ім'я: " + err}, 400)
                    if _name_taken(store, name, but=pid):
                        return self._json({"error": "Профіль «%s» уже є" % name}, 409)
                    if pid == ME:
                        store["names"][ME] = name
                    else:
                        for p in _friends(store):
                            if p["id"] == pid:
                                p["name"] = name
                else:
                    if pid == ME:
                        return self._json({"error": "Профіль «Я» видалити не можна"}, 400)
                    store["profiles"] = [p for p in store["profiles"] if not (_is_friend(p) and p["id"] == pid)]
                    store["cards"].pop(pid, None)
            else:
                return self._json({"error": "Невідома дія"}, 400)
            _write_json_atomic(_profiles_path(), store)
            out = {"ok": True, "profiles": profile_list(store), "version": data_version()}
        if prof:
            out["profile"] = prof
        return self._json(out)

    def _reject(self, msg, code):
        """Відмова на POST: спершу дочитуємо невелике тіло, щоб клієнт побачив відповідь, а не обрив."""
        size = (self.headers.get("Content-Length") or "").strip()
        if re.fullmatch(r"[0-9]+", size) and int(size) <= MAX_BODY:
            self.rfile.read(int(size))
        return self._json({"error": msg}, code)

    def _post_card(self, u):
        if not self._same_site():
            return self._reject(FORBIDDEN, 403)
        if u.path != "/api/card":
            return self._reject("Не знайдено", 404)
        stage = (urllib.parse.parse_qs(u.query).get("stage") or [""])[0]
        if stage not in CARD_STAGES:
            return self._reject("Невідома стадія", 400)
        ctype = (self.headers.get("Content-Type") or "").split(";", 1)[0].strip().lower()
        if ctype != "application/json":
            return self._reject("Потрібен Content-Type: application/json", 415)
        size = (self.headers.get("Content-Length") or "").strip()
        if not re.fullmatch(r"[0-9]+", size):
            return self._json({"error": "Неправильний Content-Length"}, 400)
        if int(size) > MAX_BODY:
            return self._json({"error": "Картка завелика"}, 413)
        body = self.rfile.read(int(size)) if int(size) else b""
        try:
            card = json.loads(body.decode("utf-8"))
        except (ValueError, RecursionError):
            card = None
        if not isinstance(card, dict):
            return self._json({"error": "Картка має бути JSON-об'єктом"}, 400)
        clean, err = validate_card(stage, card)
        if err:
            return self._json({"error": "Погана картка: " + err}, 400)
        clean["savedAt"] = _now_iso()
        profile = (urllib.parse.parse_qs(u.query).get("profile") or [ME])[0]
        if profile != ME:                               # картка друга чи іншого профілю
            with _cards_lock:
                store, corrupt = _load_profiles()
                if corrupt:                      # як і з профілями: зіпсований файл не перезаписуємо
                    return self._json({"error": PROFILES_CORRUPT}, 503)
                if not _profile_exists(store, profile):
                    return self._json({"error": "Невідомий профіль"}, 404)
                store["cards"].setdefault(profile, {})[stage] = clean
                _write_json_atomic(_profiles_path(), store)
                version = data_version()
            return self._json({"ok": True, "savedAt": clean["savedAt"], "version": version})
        path = _cards_path()
        with _cards_lock:
            cards, corrupt = _load_cards()
            if corrupt:                          # не мовчки: старий вміст лишається поруч
                try:
                    shutil.copy2(path, "%s.corrupt-%s" % (path, time.strftime("%Y%m%d-%H%M%S")))
                except OSError:
                    pass
            cards[stage] = clean
            _write_json_atomic(path, _cards_for_output(cards))
        return self._json({"ok": True, "savedAt": clean["savedAt"], "version": data_version()})


def main():
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print("cs2predict працює: http://127.0.0.1:%d  (зупинити: Ctrl+C або закрити вікно)" % PORT)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
