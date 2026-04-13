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
# ナレーション音声を生成（Voicebox）
npm run "音声生成"

# 完成動画を生成して保存（metadata.json と同じ階層に 完成動画.mp4）
npm run "動画生成"

# Remotion Studio を起動して確認（userName / propertyName を自動注入）
npm run "動画確認"
```

## Materials / Voiceover（Voicebox）

`public/materials/<user>/<property>/metadata.json` の `uploadedVideos[].voiceoverText` から、Voicebox でナレーション音声を生成して素材フォルダに保存できます。

前提:
- Voicebox アプリ（API）が起動していること（既定: `http://127.0.0.1:17493`）
- `python3` が使えること

生成（プロジェクトルートで実行推奨）:
```bash
python3 "音声生成/generate_voiceovers_from_metadata.py"
```

`metadata.json` を直接指定することもできます:
```bash
python3 "音声生成/generate_voiceovers_from_metadata.py" \
  public/materials/tanakatatsuya/SPCourtMejiro401/metadata.json
```

短縮指定（`materials` 以降の深さが同じ前提）:
```bash
python3 "音声生成/generate_voiceovers_from_metadata.py" \
  tanakatatsuya/SPCourtMejiro401
```

出力先:
- `public/materials/<user>/<property>/voiceovers/voiceover-<videoId>.wav`

主なオプション:
- `--profile-id <id>`: Voicebox のプロフィールを固定（未指定なら対話で選択）
- `--qwen 0.6b` / `--qwen 1.7b`: Qwen 0.6B / 1.7B を選択（未指定なら対話で選択）
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
