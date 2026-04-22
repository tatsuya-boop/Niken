import argparse
import json
import os
import re
import sys
import time

import gemini_tts_client
import voicebox_client


_JA_TERMINATORS = ("。", "！", "？", "!", "?", "…", ".", "．")
_USER_PROP_RE = re.compile(r"^[^/\\\\]+[/\\\\][^/\\\\]+$")


def _ensure_ja_terminator(text: str) -> str:
    t = (text or "").strip()
    if not t:
        return ""
    if t.endswith(_JA_TERMINATORS):
        return t
    return t + "。"


def _load_metadata(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _voiceover_filename(video_id: str) -> str:
    return f"voiceover-{video_id}.wav"


def _find_metadata_candidates(materials_root: str) -> list[str]:
    root = os.path.abspath(materials_root)
    if not os.path.isdir(root):
        return []

    hits: list[str] = []
    for user in sorted(os.listdir(root)):
        if user.startswith(".") or user.startswith("._"):
            continue
        user_dir = os.path.join(root, user)
        if not os.path.isdir(user_dir):
            continue

        for prop in sorted(os.listdir(user_dir)):
            if prop.startswith(".") or prop.startswith("._"):
                continue
            prop_dir = os.path.join(user_dir, prop)
            if not os.path.isdir(prop_dir):
                continue

            p = os.path.join(prop_dir, "metadata.json")
            if os.path.isfile(p):
                hits.append(p)
    return hits


def _choose_interactive(title: str, items: list[str]) -> str | None:
    if not items:
        return None

    print(title)
    for i, it in enumerate(items, start=1):
        print(f"{i}. {it}")

    while True:
        choice = input("番号を入力: ").strip()
        if not choice:
            return None
        if choice.isdigit():
            idx = int(choice)
            if 1 <= idx <= len(items):
                return items[idx - 1]
        print("無効な入力です。もう一度入力してください。")


def _resolve_metadata_path(arg: str, materials_root: str) -> str:
    s = (arg or "").strip()
    if not s:
        return ""

    # そのままのパス
    if os.path.isfile(s):
        return os.path.abspath(s)

    # materials/... の短縮入力 → public/materials/... を想定
    norm = s.replace("\\", "/")
    if norm.startswith("materials/"):
        candidate = os.path.join(os.path.dirname(materials_root), norm)
        if os.path.isfile(candidate):
            return os.path.abspath(candidate)

    # user/property の短縮入力 → <materials_root>/<user>/<property>/metadata.json
    if _USER_PROP_RE.match(norm):
        user, prop = norm.split("/", 1)
        candidate = os.path.join(materials_root, user, prop, "metadata.json")
        if os.path.isfile(candidate):
            return os.path.abspath(candidate)

    return os.path.abspath(s)


def _choose_qwen_model_interactive() -> tuple[str | None, str | None]:
    options = [
        ("qwen", "0.6B", "Qwen 0.6B"),
        ("qwen", "1.7B", "Qwen 1.7B"),
        (None, None, "Voiceboxデフォルト（指定しない）"),
    ]

    print("使用するモデルを選択してください：")
    for i, (_, _, label) in enumerate(options, start=1):
        print(f"{i}. {label}")

    while True:
        choice = input("番号を入力: ").strip()
        if choice.isdigit():
            idx = int(choice)
            if 1 <= idx <= len(options):
                model_id, model_size, _ = options[idx - 1]
                return model_id, model_size
        print("無効な入力です。もう一度入力してください。")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="metadata.json の voiceoverText を音声化して同階層に保存します。"
    )
    parser.add_argument(
        "metadata_json",
        nargs="?",
        default=None,
        help="対象の metadata.json のパス（省略すると public/materials 配下から選択）",
    )
    parser.add_argument(
        "--materials-root",
        default=os.path.join("public", "materials"),
        help='materials のルート（既定: "public/materials"）',
    )
    parser.add_argument(
        "--engine",
        choices=["voicebox", "gemini"],
        default="voicebox",
        help="音声生成エンジン（voicebox / gemini）",
    )
    parser.add_argument(
        "--profile-id",
        default=None,
        help="Voicebox の profile_id（省略すると対話で選択）",
    )
    parser.add_argument(
        "--base-url",
        default=os.environ.get("VOICEBOX_BASE_URL", voicebox_client.DEFAULT_BASE_URL),
        help="Voicebox API base URL (default: VOICEBOX_BASE_URL or http://127.0.0.1:17493)",
    )
    parser.add_argument(
        "--output-dir",
        default="voiceovers",
        help='出力先フォルダ名（metadata.json と同じ階層に作成。例: "voiceovers"）',
    )
    parser.add_argument(
        "--qwen",
        choices=["0.6b", "1.7b"],
        default=None,
        help="Qwen のモデルサイズを指定（0.6b / 1.7b）。未指定なら対話で選択（voicebox時のみ）",
    )
    parser.add_argument(
        "--gemini-api-key",
        default=os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY"),
        help="Gemini API key（未指定時は GOOGLE_API_KEY / GEMINI_API_KEY を使用）",
    )
    parser.add_argument(
        "--gemini-model",
        default=os.environ.get("GEMINI_TTS_MODEL", gemini_tts_client.DEFAULT_MODEL),
        help="Gemini のモデルID（既定: GEMINI_TTS_MODEL または gemini-3.1-flash-tts-preview）",
    )
    parser.add_argument(
        "--gemini-voice",
        default=os.environ.get("GEMINI_TTS_VOICE", gemini_tts_client.DEFAULT_VOICE),
        help="Gemini の voiceName（既定: GEMINI_TTS_VOICE または Autonoe）",
    )
    parser.add_argument(
        "--gemini-base-url",
        default=os.environ.get("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com"),
        help="Gemini API base URL",
    )
    parser.add_argument(
        "--gemini-request-interval-sec",
        type=float,
        default=float(os.environ.get("GEMINI_REQUEST_INTERVAL_SEC", "20")),
        help="Gemini 連続リクエスト時の待機秒数（既定: 20秒）",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="既存ファイルがあっても上書き生成する",
    )
    parser.add_argument(
        "--no-ensure-punct",
        action="store_true",
        help="末尾の句点補完をしない（日本語向け）",
    )
    args = parser.parse_args()

    materials_root = os.path.abspath(args.materials_root)

    if args.metadata_json is None:
        candidates = _find_metadata_candidates(materials_root)
        chosen = _choose_interactive(
            "音声生成対象の metadata.json を選択してください（public/materials 配下）：",
            candidates,
        )
        if not chosen:
            print("キャンセルしました。")
            return 130
        metadata_path = chosen
    else:
        resolved = _resolve_metadata_path(args.metadata_json, materials_root)
        if os.path.isfile(resolved):
            metadata_path = resolved
        else:
            candidates = _find_metadata_candidates(materials_root)
            chosen = _choose_interactive(
                f"指定パスが見つかりません: {resolved}\n候補から選択してください：",
                candidates,
            )
            if not chosen:
                print("キャンセルしました。")
                return 130
            metadata_path = chosen

    out_dir = os.path.dirname(metadata_path)
    if os.path.isabs(args.output_dir):
        out_voice_dir = args.output_dir
    else:
        out_voice_dir = os.path.join(out_dir, args.output_dir)
    os.makedirs(out_voice_dir, exist_ok=True)

    metadata = _load_metadata(metadata_path)
    uploaded = metadata.get("uploadedVideos") or []
    if not isinstance(uploaded, list):
        print("エラー: metadata.json の uploadedVideos が不正です")
        return 2

    profile_id: str | None = None
    model_id: str | None = None
    model_size: str | None = None
    data_root: str | None = None

    if args.engine == "voicebox":
        data_root = voicebox_client.detect_data_root()
        profiles_dir = voicebox_client.detect_profiles_dir(data_root)

        profile_id = args.profile_id
        if not profile_id:
            profile_id = voicebox_client.choose_profile_id_interactive(
                profiles_dir=profiles_dir,
                data_root=data_root,
                base_url=args.base_url,
            )
        if not profile_id:
            print("エラー: profile_id を取得できませんでした")
            return 2

        if args.qwen == "0.6b":
            model_id, model_size = "qwen", "0.6B"
        elif args.qwen == "1.7b":
            model_id, model_size = "qwen", "1.7B"
        else:
            model_id, model_size = _choose_qwen_model_interactive()
    else:
        if not args.gemini_api_key:
            print("エラー: Gemini の API キーが未設定です（GOOGLE_API_KEY か GEMINI_API_KEY）。")
            return 2

    targets = []
    for v in uploaded:
        if not isinstance(v, dict):
            continue
        vid = v.get("id")
        text = v.get("voiceoverText")
        if not vid or not isinstance(vid, str):
            continue
        if not text or not str(text).strip():
            continue
        targets.append({"id": vid, "text": str(text)})

    if not targets:
        print("voiceoverText がある動画が見つかりませんでした。")
        return 0

    print(f"出力先: {out_voice_dir}")
    print(f"engine: {args.engine}")
    if args.engine == "voicebox":
        print(f"profile_id: {profile_id}")
        print(f"base_url: {args.base_url}")
        if model_id and model_size:
            print(f"model: {model_id} {model_size}")
        else:
            print("model: (default)")
    else:
        print(f"base_url: {args.gemini_base_url}")
        print(f"model: {args.gemini_model}")
        print(f"voice: {args.gemini_voice}")

    ok = 0
    skipped = 0
    failed = 0
    gemini_requests_sent = 0

    for t in targets:
        out_name = _voiceover_filename(t["id"])
        out_path = os.path.join(out_voice_dir, out_name)
        if os.path.exists(out_path) and not args.force:
            print(f"⏭️  既存のためスキップ: {out_name}")
            skipped += 1
            continue

        text = t["text"]
        if not args.no_ensure_punct:
            text = _ensure_ja_terminator(text)

        print(f"🎤 生成: {out_name}")
        try:
            if args.engine == "voicebox":
                voicebox_client.generate_audio(
                    text=text,
                    out_path=out_path,
                    profile_id=profile_id,
                    base_url=args.base_url,
                    data_root=data_root,
                    language="ja",
                    model_id=model_id,
                    model_size=model_size,
                )
            else:
                if gemini_requests_sent > 0 and args.gemini_request_interval_sec > 0:
                    wait_sec = args.gemini_request_interval_sec
                    print(f"⏳ Gemini リクエスト間隔のため {wait_sec:.1f} 秒待機します...")
                    time.sleep(wait_sec)
                gemini_requests_sent += 1
                gemini_tts_client.generate_audio(
                    text=text,
                    out_path=out_path,
                    api_key=args.gemini_api_key,
                    model=args.gemini_model,
                    voice_name=args.gemini_voice,
                    base_url=args.gemini_base_url,
                )
            ok += 1
        except KeyboardInterrupt:
            print("\n中断しました。")
            return 130
        except Exception as e:
            print(f"❌ 失敗: {out_name} ({e})")
            failed += 1

    print(f"完了: ok={ok} skipped={skipped} failed={failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
