import json
import os
import sqlite3
import threading
import time
import urllib.error
import urllib.request
import urllib.parse


DEFAULT_BASE_URL = "http://127.0.0.1:17493"

GENERATE_ENDPOINT = "/generate"
PROFILES_ENDPOINT = "/profiles"
TASKS_ACTIVE_ENDPOINT = "/tasks/active"
GENERATIONS_ENDPOINT = "/generations"


def detect_data_root():
    env = os.environ.get("VOICEBOX_DATA_ROOT")
    if env:
        return env

    home = os.path.expanduser("~")
    candidates = [
        os.path.join(home, "Library", "Application Support", "sh.voicebox.app"),
        os.path.join(home, "Library", "Application Support", "Voicebox"),
        os.path.join(home, "Library", "Application Support", "voicebox"),
        os.path.join(home, "Desktop", "voicebox"),
    ]
    for p in candidates:
        if os.path.isdir(p):
            return p
    return candidates[-1]


def detect_profiles_dir(data_root):
    direct = os.path.join(data_root, "profiles")
    legacy = os.path.join(data_root, "data", "profiles")
    if os.path.isdir(direct):
        return direct
    return legacy


def _load_profile_names_from_db(data_root):
    db_path = os.path.join(data_root, "voicebox.db")
    if not os.path.isfile(db_path):
        return {}
    try:
        con = sqlite3.connect(db_path)
    except Exception:
        return {}
    try:
        cur = con.cursor()
        cur.execute("SELECT id, name FROM profiles")
        rows = cur.fetchall()
        return {str(pid): str(name) for pid, name in rows if pid and name}
    except Exception:
        return {}
    finally:
        try:
            con.close()
        except Exception:
            pass


def _fetch_profiles_from_api(base_url):
    url = base_url + PROFILES_ENDPOINT
    with urllib.request.urlopen(url, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    if isinstance(data, list):
        profiles = data
    elif isinstance(data, dict):
        profiles = data.get("profiles") or data.get("items") or []
    else:
        profiles = []

    normalized = []
    for p in profiles:
        if not isinstance(p, dict):
            continue
        pid = p.get("id") or p.get("profile_id")
        name = p.get("name") or p.get("title") or "(no name)"
        if pid:
            normalized.append({"id": pid, "name": name})
    return normalized


def choose_profile_id_interactive(
    profiles_dir,
    data_root,
    base_url=DEFAULT_BASE_URL,
):
    def choose_from_api():
        try:
            profiles = _fetch_profiles_from_api(base_url)
        except Exception as e:
            print(f"エラー: Voicebox API から profiles を取得できません: {e}")
            return None

        if not profiles:
            print("エラー: profiles が見つかりませんでした（/profiles）。")
            return None

        print("使用するプロフィールを選択してください（API /profiles）：")
        for i, p in enumerate(profiles, start=1):
            print(f"{i}. {p['name']} ({p['id']})")

        while True:
            choice = input("番号を入力: ").strip()
            if choice.isdigit():
                idx = int(choice)
                if 1 <= idx <= len(profiles):
                    return profiles[idx - 1]["id"]
            print("無効な入力です。もう一度入力してください。")

    if not os.path.isdir(profiles_dir):
        print(f"⚠️  {profiles_dir} が見つかりません。Voicebox API から取得します。")
        return choose_from_api()

    profile_ids = [
        d
        for d in os.listdir(profiles_dir)
        if os.path.isdir(os.path.join(profiles_dir, d))
        and not d.startswith(".")
        and not d.startswith("._")
    ]
    if not profile_ids:
        print(f"⚠️  {profiles_dir} にプロフィールがありません。Voicebox API から取得します。")
        return choose_from_api()

    names_by_id = _load_profile_names_from_db(data_root)
    items = []
    for pid in profile_ids:
        display_name = names_by_id.get(pid) or pid
        items.append({"id": pid, "name": display_name})
    items.sort(key=lambda x: (x["name"], x["id"]))

    print("使用するプロフィールを選択してください：")
    for i, p in enumerate(items, start=1):
        if p["name"] == p["id"]:
            print(f"{i}. {p['id']}")
        else:
            print(f"{i}. {p['name']} ({p['id']})")

    while True:
        choice = input("番号を入力: ").strip()
        if choice.isdigit():
            idx = int(choice)
            if 1 <= idx <= len(items):
                return items[idx - 1]["id"]
        print("無効な入力です。もう一度入力してください。")


def fetch_default_profile_id(base_url=DEFAULT_BASE_URL):
    try:
        profiles = _fetch_profiles_from_api(base_url)
    except Exception as e:
        print(f"⚠️  プロファイル一覧の取得に失敗しました: {e}")
        return None

    if not profiles:
        print("⚠️  プロファイルが見つかりませんでした。")
        return None
    return profiles[0]["id"]


def _voicebox_get_json(base_url, path, timeout=30):
    url = base_url + path
    with urllib.request.urlopen(url, timeout=timeout) as resp:
        body = resp.read().decode("utf-8", errors="ignore")
    return json.loads(body)


def _resolve_audio_path_from_generation(obj):
    if not isinstance(obj, dict):
        return None

    audio_path = obj.get("audio_path")
    if audio_path:
        return audio_path

    versions = obj.get("versions")
    active_version_id = obj.get("active_version_id")
    if isinstance(versions, list):
        for v in versions:
            if not isinstance(v, dict):
                continue
            if active_version_id and v.get("id") != active_version_id:
                continue
            ap = v.get("audio_path") or v.get("path") or v.get("file_path")
            if ap:
                return ap
        for v in versions:
            if not isinstance(v, dict):
                continue
            ap = v.get("audio_path") or v.get("path") or v.get("file_path")
            if ap:
                return ap

    if isinstance(versions, dict):
        if active_version_id and active_version_id in versions:
            v = versions.get(active_version_id)
            if isinstance(v, dict):
                ap = v.get("audio_path") or v.get("path") or v.get("file_path")
                if ap:
                    return ap
        for v in versions.values():
            if isinstance(v, dict):
                ap = v.get("audio_path") or v.get("path") or v.get("file_path")
                if ap:
                    return ap

    return None


def _wait_for_generation_local_db(data_root, gen_id, timeout_sec=300, poll_interval=1.0):
    db_path = os.path.join(data_root, "voicebox.db")
    if not os.path.isfile(db_path):
        return None

    start = time.time()
    while True:
        try:
            con = sqlite3.connect(db_path, timeout=1)
            try:
                cur = con.cursor()
                cur.execute(
                    "SELECT status, audio_path, error FROM generations WHERE id = ?",
                    (str(gen_id),),
                )
                row = cur.fetchone()
                if row:
                    status, audio_path, error = row
                    if error:
                        raise RuntimeError(str(error))

                    if audio_path:
                        return {"id": str(gen_id), "status": status, "audio_path": audio_path}

                    if status and str(status).lower() in {"failed", "error"}:
                        raise RuntimeError(f"generation failed: {gen_id}")

                    cur.execute(
                        "SELECT audio_path FROM generation_versions WHERE generation_id = ? "
                        "ORDER BY created_at DESC LIMIT 1",
                        (str(gen_id),),
                    )
                    v = cur.fetchone()
                    if v and v[0]:
                        return {"id": str(gen_id), "status": status, "audio_path": v[0]}
            finally:
                try:
                    con.close()
                except Exception:
                    pass
        except sqlite3.OperationalError as e:
            if "locked" not in str(e).lower():
                raise

        if time.time() - start > timeout_sec:
            raise RuntimeError("Voicebox の生成待ちがタイムアウトしました。")
        time.sleep(poll_interval)


def _wait_for_generation_http(base_url, gen_id, timeout_sec=300, poll_interval=1.0):
    start = time.time()
    while True:
        paths = [
            f"{GENERATE_ENDPOINT}/{gen_id}/status",
            f"{GENERATIONS_ENDPOINT}/{gen_id}",
            f"/generation/{gen_id}",
        ]

        last_exc = None
        gen = None
        for p in paths:
            try:
                gen = _voicebox_get_json(base_url, p, timeout=30)
                break
            except urllib.error.HTTPError as e:
                last_exc = e
                if e.code == 404:
                    continue
                raise
        if gen is None and last_exc is not None:
            raise last_exc

        if isinstance(gen, dict):
            if gen.get("error"):
                raise RuntimeError(str(gen["error"]))

            audio_path = _resolve_audio_path_from_generation(gen)
            if audio_path:
                return gen

            status = gen.get("status")
            if status and str(status).lower() in {"failed", "error"}:
                raise RuntimeError(json.dumps(gen, ensure_ascii=False))

            if status and str(status).lower() in {"complete", "completed", "done", "success"}:
                return gen

        if time.time() - start > timeout_sec:
            raise RuntimeError("Voicebox の生成待ちがタイムアウトしました。")
        time.sleep(poll_interval)


def _wait_for_generation(data_root, base_url, gen_id, timeout_sec=300, poll_interval=1.0):
    local = _wait_for_generation_local_db(
        data_root,
        gen_id,
        timeout_sec=timeout_sec,
        poll_interval=poll_interval,
    )
    if local is not None:
        return local
    return _wait_for_generation_http(base_url, gen_id, timeout_sec=timeout_sec, poll_interval=poll_interval)


def _download_generation_audio(base_url, gen_id, out_path):
    endpoints = [
        f"{GENERATE_ENDPOINT}/{gen_id}/audio",
        f"{GENERATE_ENDPOINT}/{gen_id}/download",
        f"{GENERATIONS_ENDPOINT}/{gen_id}/audio",
        f"{GENERATIONS_ENDPOINT}/{gen_id}/download",
        f"{GENERATIONS_ENDPOINT}/{gen_id}/file",
        f"/generation/{gen_id}/audio",
    ]
    for ep in endpoints:
        url = base_url + ep
        try:
            with urllib.request.urlopen(url, timeout=60) as resp:
                content_type = resp.headers.get("Content-Type", "")
                data = resp.read()
            if not data:
                continue
            if "application/json" in content_type:
                continue
            with open(out_path, "wb") as f:
                f.write(data)
            return True
        except Exception:
            continue
    return False


def _poll_tasks_active(base_url, stop_event):
    url = base_url + TASKS_ACTIVE_ENDPOINT
    while not stop_event.is_set():
        try:
            with urllib.request.urlopen(url, timeout=5) as resp:
                body = resp.read().decode("utf-8", errors="ignore")
            try:
                data = json.loads(body)
            except Exception:
                data = None

            if isinstance(data, list):
                count = len(data)
            elif isinstance(data, dict) and "tasks" in data and isinstance(data["tasks"], list):
                count = len(data["tasks"])
            else:
                count = None

            if count is not None:
                print(f"⏳ Voicebox生成中... active_tasks={count}")
            else:
                print("⏳ Voicebox生成中...")
        except Exception:
            pass

        stop_event.wait(3)


def cancel_generation(base_url, gen_id):
    gen_id = str(gen_id)
    candidates = [
        ("POST", f"{GENERATE_ENDPOINT}/{gen_id}/cancel"),
        ("POST", f"{GENERATE_ENDPOINT}/{gen_id}/stop"),
        ("DELETE", f"{GENERATE_ENDPOINT}/{gen_id}"),
        ("POST", f"{GENERATIONS_ENDPOINT}/{gen_id}/cancel"),
        ("DELETE", f"{GENERATIONS_ENDPOINT}/{gen_id}"),
        ("POST", f"/generation/{gen_id}/cancel"),
        ("DELETE", f"/generation/{gen_id}"),
    ]

    for method, path in candidates:
        url = base_url + path
        req = urllib.request.Request(url, method=method)
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                _ = resp.read()
            return True
        except urllib.error.HTTPError as e:
            # 404/405 は "そのAPIが無い" だけなので次を試す
            if e.code in {404, 405}:
                continue
        except Exception:
            continue
    return False


def generate_audio(
    text,
    out_path,
    profile_id,
    *,
    base_url=DEFAULT_BASE_URL,
    data_root=None,
    language="ja",
    voice_id=None,
    engine=None,
    model_id=None,
    model_size=None,
    instruct=None,
    seed=None,
):
    if data_root is None:
        data_root = detect_data_root()

    base_payload = {
        "text": text,
        "language": language,
        "profile_id": profile_id,
    }

    def with_optionals(p):
        if voice_id:
            p["voice_id"] = voice_id
        if engine:
            p["engine"] = engine
        if model_id:
            p["model_id"] = model_id
        if model_size:
            p["model_size"] = model_size
        if instruct:
            p["instruct"] = instruct
        if seed is not None:
            p["seed"] = seed
        return p

    payload_variants = [with_optionals(dict(base_payload)), dict(base_payload)]

    url = base_url + GENERATE_ENDPOINT
    content_type = ""
    body = b""

    stop_event = threading.Event()
    poller = threading.Thread(target=_poll_tasks_active, args=(base_url, stop_event), daemon=True)
    poller.start()

    try:
        for payload in payload_variants:
            data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                url,
                data=data,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=None) as resp:
                    content_type = resp.headers.get("Content-Type", "")
                    body = resp.read()
                break
            except urllib.error.HTTPError as e:
                try:
                    err_body = e.read().decode("utf-8", errors="ignore")
                except Exception:
                    err_body = str(e)
                # 422 のときは payload を最小化して再試行
                if e.code == 422 and payload != payload_variants[-1]:
                    continue
                raise RuntimeError(f"{e.code} {e.reason} {err_body}")
    finally:
        stop_event.set()
        try:
            poller.join(timeout=1)
        except Exception:
            pass

    if "application/json" not in content_type:
        with open(out_path, "wb") as f:
            f.write(body)
        return True

    try:
        obj = json.loads(body.decode("utf-8"))
    except Exception as e:
        raise RuntimeError(f"Invalid JSON response: {e}")

    gen_id = obj.get("id") if isinstance(obj, dict) else None
    audio_path = _resolve_audio_path_from_generation(obj)
    if not audio_path and gen_id:
        try:
            gen = _wait_for_generation(data_root, base_url, gen_id)
        except KeyboardInterrupt:
            cancel_generation(base_url, gen_id)
            raise
        audio_path = _resolve_audio_path_from_generation(gen)

    if not audio_path and gen_id:
        ok = _download_generation_audio(base_url, gen_id, out_path)
        if ok:
            return True

    if not audio_path:
        raise RuntimeError(json.dumps(obj, ensure_ascii=False))

    candidates = []
    if os.path.isabs(audio_path):
        candidates.append(audio_path)
    else:
        candidates.append(audio_path)
        if data_root:
            candidates.append(os.path.join(data_root, audio_path))

    found = None
    for p in candidates:
        if p and os.path.exists(p):
            found = p
            break

    if not found:
        raise RuntimeError(
            "audio_path が見つかりません。"
            "VOICEBOX_DATA_ROOT を設定してください。"
            f" audio_path={audio_path}"
        )

    with open(found, "rb") as src, open(out_path, "wb") as dst:
        dst.write(src.read())
    return True
