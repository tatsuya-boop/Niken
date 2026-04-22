import base64
import json
import os
import re
import ssl
import urllib.error
import urllib.parse
import urllib.request
import wave


DEFAULT_MODEL = os.environ.get("GEMINI_TTS_MODEL", "gemini-3.1-flash-tts-preview")
DEFAULT_VOICE = os.environ.get("GEMINI_TTS_VOICE", "Autonoe")
DEFAULT_SAMPLE_RATE = 24000
_RATE_RE = re.compile(r"(?:rate|sampleRate)\s*=\s*(\d+)", re.IGNORECASE)
_TRUE_VALUES = {"1", "true", "yes", "on"}
VOICE_OPTIONS = [
    {"name": "Autonoe", "style": "Friendly"},
    {"name": "Achernar", "style": "Bright"},
    {"name": "Umbriel", "style": "Sincere"},
    {"name": "Algenib", "style": "Reliable"},
]


def _create_ssl_context():
    if str(os.environ.get("GEMINI_INSECURE", "")).strip().lower() in _TRUE_VALUES:
        return ssl._create_unverified_context()

    cafile = os.environ.get("GEMINI_CA_BUNDLE") or os.environ.get("SSL_CERT_FILE")
    if cafile:
        return ssl.create_default_context(cafile=cafile)

    ctx = ssl.create_default_context()
    try:
        import certifi  # type: ignore

        certifi_path = certifi.where()
        if certifi_path and os.path.isfile(certifi_path):
            ctx.load_verify_locations(cafile=certifi_path)
    except Exception:
        pass
    return ctx


def _is_dns_error(reason):
    text = str(reason or "").lower()
    return (
        "nodename nor servname provided" in text
        or "name or service not known" in text
        or "temporary failure in name resolution" in text
    )


def _has_proxy_env():
    keys = [
        "http_proxy",
        "https_proxy",
        "all_proxy",
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
    ]
    return any(os.environ.get(k) for k in keys)


def _open_url(req, timeout, ssl_context):
    try:
        return urllib.request.urlopen(req, timeout=timeout, context=ssl_context)
    except urllib.error.URLError as e:
        # プロキシ経由のDNS失敗っぽい場合は、プロキシ無効で1回だけ再試行
        if _has_proxy_env() and _is_dns_error(e.reason):
            opener = urllib.request.build_opener(
                urllib.request.ProxyHandler({}),
                urllib.request.HTTPSHandler(context=ssl_context),
            )
            return opener.open(req, timeout=timeout)
        raise


def _extract_audio_part(data):
    if not isinstance(data, dict):
        return None

    candidates = data.get("candidates")
    if not isinstance(candidates, list):
        return None

    for c in candidates:
        if not isinstance(c, dict):
            continue
        content = c.get("content")
        if not isinstance(content, dict):
            continue
        parts = content.get("parts")
        if not isinstance(parts, list):
            continue
        for p in parts:
            if not isinstance(p, dict):
                continue
            inline = p.get("inlineData") or p.get("inline_data")
            if isinstance(inline, dict) and inline.get("data"):
                return inline
    return None


def _parse_sample_rate(mime_type):
    if not mime_type:
        return DEFAULT_SAMPLE_RATE
    m = _RATE_RE.search(str(mime_type))
    if not m:
        return DEFAULT_SAMPLE_RATE
    try:
        return int(m.group(1))
    except Exception:
        return DEFAULT_SAMPLE_RATE


def _write_pcm16_wav(out_path, pcm_bytes, sample_rate):
    with wave.open(out_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_bytes)


def _candidate_models(model):
    out = []
    if model:
        out.append(model)
        if "tts" not in model:
            out.append(f"{model}-tts-preview")
    out.extend(
        [
            "gemini-3.1-flash-tts-preview",
            "gemini-2.5-flash-preview-tts",
            "gemini-2.5-pro-preview-tts",
        ]
    )
    unique = []
    seen = set()
    for m in out:
        if not m or m in seen:
            continue
        seen.add(m)
        unique.append(m)
    return unique


def _request_generate(base_url, api_key, model, text, voice_name, timeout):

    payload = {
        "contents": [{"parts": [{"text": text}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {
                        "voiceName": voice_name,
                    }
                }
            },
        },
    }

    # 互換性のため、リクエスト形式を2通り試す
    endpoint_names = ["generateContent", "generate_content"]
    last_error = None
    ssl_context = _create_ssl_context()
    models = _candidate_models(model)

    for current_model in models:
        for endpoint_name in endpoint_names:
            endpoint = (
                base_url.rstrip("/")
                + f"/v1beta/models/{urllib.parse.quote(current_model, safe='')}:{endpoint_name}"
            )
            body_payload = dict(payload)
            body_payload["model"] = current_model
            req = urllib.request.Request(
                endpoint,
                data=json.dumps(body_payload).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "x-goog-api-key": api_key,
                },
                method="POST",
            )
            try:
                with _open_url(req, timeout=timeout, ssl_context=ssl_context) as resp:
                    body = resp.read().decode("utf-8", errors="ignore")
                return json.loads(body)
            except urllib.error.HTTPError as e:
                detail = ""
                try:
                    detail = e.read().decode("utf-8", errors="ignore")
                except Exception:
                    pass
                # モデル違いの 404 は次候補へフォールバックする
                if e.code == 404:
                    last_error = RuntimeError(
                        f"Gemini API エラー: HTTP 404 Not Found (model={current_model})"
                        + (f"\n{detail}" if detail else "")
                    )
                    continue
                err = RuntimeError(
                    f"Gemini API エラー: HTTP {e.code} {e.reason}"
                    + (f"\n{detail}" if detail else "")
                )
                # 404以外はモデル切替で解消しないため即時終了
                raise err
            except urllib.error.URLError as e:
                reason = str(e.reason)
                if "CERTIFICATE_VERIFY_FAILED" in reason:
                    err = RuntimeError(
                        "Gemini API に接続できません: 証明書検証に失敗しました。"
                        " .env.local に SSL_CERT_FILE=/path/to/cacert.pem "
                        "または GEMINI_CA_BUNDLE=/path/to/cacert.pem を設定してください。"
                        " 一時回避として GEMINI_INSECURE=1 も利用できます。"
                    )
                elif _is_dns_error(e.reason):
                    err = RuntimeError(
                        "Gemini API に接続できません: DNS解決に失敗しました。"
                        " プロキシ設定（HTTP_PROXY / HTTPS_PROXY）またはネットワークを確認してください。"
                    )
                else:
                    err = RuntimeError(f"Gemini API に接続できません: {e.reason}")
                raise err
            except Exception as e:
                raise RuntimeError(f"Gemini API 呼び出しに失敗しました: {e}")

    if last_error:
        raise last_error
    raise RuntimeError("Gemini API 呼び出しに失敗しました。")


def generate_audio(
    text,
    out_path,
    api_key=None,
    model=DEFAULT_MODEL,
    voice_name=DEFAULT_VOICE,
    base_url="https://generativelanguage.googleapis.com",
    timeout=120,
):
    key = (
        api_key
        or os.environ.get("GOOGLE_API_KEY")
        or os.environ.get("GEMINI_API_KEY")
    )
    if not key:
        raise RuntimeError(
            "Gemini 用 API キーがありません。"
            " GOOGLE_API_KEY か GEMINI_API_KEY を設定してください。"
        )

    payload = _request_generate(
        base_url=base_url,
        api_key=key,
        model=model,
        text=text,
        voice_name=voice_name,
        timeout=timeout,
    )
    inline = _extract_audio_part(payload)
    if not inline:
        raise RuntimeError("Gemini API レスポンスに音声データが見つかりませんでした。")

    b64 = inline.get("data")
    mime = (inline.get("mimeType") or inline.get("mime_type") or "").lower()
    if not b64:
        raise RuntimeError("Gemini API レスポンスの音声データが空です。")

    try:
        raw = base64.b64decode(b64)
    except Exception as e:
        raise RuntimeError(f"音声データのデコードに失敗しました: {e}") from e

    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    if "wav" in mime or "wave" in mime:
        with open(out_path, "wb") as f:
            f.write(raw)
        return

    # PCMとして返る場合はWAV化して保存
    sample_rate = _parse_sample_rate(mime)
    _write_pcm16_wav(out_path, raw, sample_rate)
