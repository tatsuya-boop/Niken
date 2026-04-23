# Remotion video

※ `音声生成` / `動画生成` / `動画確認` は **ターミナルでそのまま打つコマンドではなく**、npm scripts です。実行は必ず `npm run` を付けます:
```bash
npm run "音声生成"
npm run "動画生成"
npm run "動画確認"
```

<p align="center">
  <a href="https://github.com/remotion-dev/logo">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://github.com/remotion-dev/logo/raw/main/animated-logo-banner-dark.apng">
      <img alt="Animated Remotion Logo" src="https://github.com/remotion-dev/logo/raw/main/animated-logo-banner-light.gif">
    </picture>
  </a>
</p>

Welcome to your Remotion project!

## Commands

**Install Dependencies**

```console
npm i
```

**Start Preview**

```console
npm run dev
```

## かんたん操作（素材選択つき）

エンジニア以外でも、ターミナル上で `public/materials/<user>/<property>`（`metadata.json` があるものだけ）を選んで実行できます。

```bash
# ナレーション音声を生成（Voicebox / Gemini）
npm run "音声生成"

# 完成動画を生成して保存（metadata.json と同じ階層に 完成動画.mp4）
npm run "動画生成"

# Remotion Studio を起動して確認（素材選択 + テンプレート選択）
npm run "動画確認"
```

## Materials / Voiceover（Voicebox / Gemini）

`public/materials/<user>/<property>/metadata.json` の `uploadedVideos[].voiceoverText` から、ナレーション音声を生成して素材フォルダに保存できます。

※ いちばん簡単なのは `npm run "音声生成"` です（OSに応じて Python コマンドを自動で選びます）。
実行時にエンジン（Voicebox / Gemini 3.1 Flash）を選択できます。
Gemini を選んだ場合は Voicebox のプロフィール選択は行わず、そのまま生成します。

前提:
- Voicebox を使う場合: Voicebox アプリ（API）が起動していること（既定: `http://127.0.0.1:17493`）
- Gemini を使う場合: `GOOGLE_API_KEY`（または `GEMINI_API_KEY`）が設定されていること
- Python が使えること（Mac/Linux: `python3`、Windows: `py` または `python`）

Gemini 利用時に `CERTIFICATE_VERIFY_FAILED` が出る場合:
- `.env.local` に `SSL_CERT_FILE=/path/to/cacert.pem` か `GEMINI_CA_BUNDLE=/path/to/cacert.pem` を設定
- 一時回避のみ: `.env.local` に `GEMINI_INSECURE=1`（証明書検証を無効化）

生成（プロジェクトルートで実行推奨）:
```bash
# Mac/Linux
python3 "音声生成/generate_voiceovers_from_metadata.py"

# Windows（どちらか）
py -3 "音声生成/generate_voiceovers_from_metadata.py"
# または
python "音声生成/generate_voiceovers_from_metadata.py"
```

`metadata.json` を直接指定することもできます:
```bash
# Mac/Linux
python3 "音声生成/generate_voiceovers_from_metadata.py" \
  public/materials/tanakatatsuya/SPCourtMejiro401/metadata.json

# Windows（例: py -3）
py -3 "音声生成/generate_voiceovers_from_metadata.py" ^
  public/materials/tanakatatsuya/SPCourtMejiro401/metadata.json
```

短縮指定（`materials` 以降の深さが同じ前提）:
```bash
# Mac/Linux
python3 "音声生成/generate_voiceovers_from_metadata.py" \
  tanakatatsuya/SPCourtMejiro401

# Windows（例: py -3）
py -3 "音声生成/generate_voiceovers_from_metadata.py" ^
  tanakatatsuya/SPCourtMejiro401
```

出力先:
- `public/materials/<user>/<property>/voiceovers/voiceover-<videoId>.wav`

主なオプション:
- `--engine voicebox` / `--engine gemini`: 生成エンジンを指定
- `--profile-id <id>`: Voicebox のプロフィールを固定（未指定なら対話で選択）
- `--qwen 0.6b` / `--qwen 1.7b`: Qwen 0.6B / 1.7B を選択（未指定なら対話で選択）
- `--gemini-model <model-id>`: Gemini のモデルID（既定: `gemini-3.1-flash-tts-preview`）
- `--gemini-voice <voice-name>`: Gemini の voiceName（既定: `Autonoe`）
- `--force`: 既存の音声があっても上書き生成

Remotion 取り込み:
- `voiceoverText` があり、対応する `voiceovers/voiceover-<videoId>.wav` が存在する場合のみ自動で合成します
- 元動画の音声は `muted`（無音）です

**Render video**

完成動画は、対象の `metadata.json` と同じ階層に `完成動画.mp4` として保存します。

```bash
# 例: public/materials/tanakatatsuya/SPCourtMejiro401/metadata.json の場合
npm run render:completed -- tanakatatsuya/SPCourtMejiro401
```

または `metadata.json` を直接指定:

```bash
npm run render:completed -- public/materials/tanakatatsuya/SPCourtMejiro401/metadata.json
```

※ すでに `完成動画.mp4` がある場合は `完成動画.<timestamp>.mp4` に退避してから書き出します。

## 編集して保存（おすすめ手順）

1) `metadata.json` を編集  
`public/materials/<user>/<property>/metadata.json` の以下を編集します（例）:
- `uploadedVideos[].editOrder`（並び順）
- `uploadedVideos[].overlayText`（テロップ）
- `uploadedVideos[].voiceoverText`（ナレーション原稿）
- `property`（物件名/BGMなど）

2) プレビューで確認  
```bash
npm run dev
```
Remotion Studio で Composition `SPCourtMejiro401` を開き、Props に `userName` / `propertyName` を指定して確認します。

3) 書き出して保存  
上の「Render video」のコマンドで、`metadata.json` と同じ階層に `完成動画.mp4` が生成されます。

## 物件ごとに MargoMain.tsx をコピーして編集する

共通の `src/MargoMain.tsx` とは別に、物件専用の TSX を作って個別編集できます。  
配置ルール:

- `src/編集指示/MargoMain_<propertyName>.tsx`

作成例:

```bash
mkdir -p "src/編集指示"
cp src/MargoMain.tsx "src/編集指示/MargoMain_SPCourtMejiro401.tsx"
```

`src/propertyVideoRegistry.ts` が `src/編集指示` を自動スキャンするため、手動登録は不要です。

`npm run "動画確認"` / `npm run "動画生成"` 実行時に、`src/編集指示` 直下の TSX から使用テンプレートを選択できます。

自動作成:

```bash
# 対話選択で作成
npm run "動画テンプレ作成"

# 直接指定で作成
npm run "動画テンプレ作成" -- tanakatatsuya/SPCourtMejiro401

# 既存ファイルを上書きして再作成
npm run "動画テンプレ作成" -- tanakatatsuya/SPCourtMejiro401 --force
```

**Upgrade Remotion**

```console
npx remotion upgrade
```

## Docs

Get started with Remotion by reading the [fundamentals page](https://www.remotion.dev/docs/the-fundamentals).

## Help

We provide help on our [Discord server](https://discord.gg/6VzzNDwUwV).

## Issues

Found an issue with Remotion? [File an issue here](https://github.com/remotion-dev/remotion/issues/new).

## License

Note that for some entities a company license is needed. [Read the terms here](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md).
