#!/usr/bin/env python3
"""Оновлює data/results.json і data/insights.json для сайту на GitHub Pages (запускає GitHub раз на 10 хв).

Лежить у tools/ поруч із копією server.py. Один запит до Liquipedia на всі стадії й плей-оф.
Попередні результати (data/prev-results.json з опублікованого сайту або data/results.json з репозиторію)
стають «попереднім знімком»: зламана чи неповна сторінка Liquipedia не зітре вже відомі результати.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import server  # noqa: E402

server.ROOT, server.WEB, server.DATA = REPO, os.path.join(REPO, "web"), os.path.join(REPO, "data")


def main():
    data = server.DATA
    os.makedirs(os.path.join(data, "cache"), exist_ok=True)
    prev = None
    for name in ("prev-results.json", "results.json"):
        try:
            with open(os.path.join(data, name), encoding="utf-8") as f:
                prev = server._normalize_payload(json.load(f))
        except (OSError, ValueError):
            prev = None
        if prev:
            break
    if prev:
        server._write_json_atomic(os.path.join(data, "cache", "all.json"), prev)
    res = server.get_all_results(force=True)
    if res.get("stale") and not prev:
        print("Liquipedia недоступна і попередніх даних немає:", res.get("error"))
    with open(os.path.join(data, "results.json"), "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False)
    with open(os.path.join(data, "insights.json"), "w", encoding="utf-8") as f:
        json.dump(server.get_insights(), f, ensure_ascii=False)
    for tmp in ("prev-results.json",):
        try:
            os.remove(os.path.join(data, tmp))
        except OSError:
            pass
    print("Результати на", res.get("fetchedAt"), "· застарілі" if res.get("stale") else "· свіжі", res.get("error") or "")


if __name__ == "__main__":
    main()
