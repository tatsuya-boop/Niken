import { useEffect, useMemo, useState } from 'react';
import {
  Series,
  AbsoluteFill,
  OffthreadVideo,
  Audio,
  staticFile,
  continueRender,
  delayRender,
  useVideoConfig,
  interpolate,
  useCurrentFrame,
  spring,
  Sequence,
  Freeze,
} from 'remotion';
import { z } from 'zod';
import { NikenAppeal } from '../NikenAppeal';

type UploadedVideo = {
  id: string;
  filename: string;
  editOrder: number;
  overlayText?: string | null;
  voiceoverText?: string | null;
};

type MetadataJson = {
  uploadedVideos: UploadedVideo[];
  property: {
    name: string;
    number?: string | number;
    propertyNumber?: string | number;
    propertyNo?: string | number;
    code?: string | number;
    bgMusic: { title: string };
  };
};

export const MargoPropsSchema = z.object({
  userName: z.string(),
  propertyName: z.string(),
  effectSoundSrc: z.string().optional(),
  bgMusicSrc: z.string().nullable().optional(),
  appealPlacement: z.enum(['split', 'both-at-end']).optional(),
  calculatedDurations: z.array(z.object({
    video: z.number(),
    audio: z.number(),
    timeline: z.number(),
    videoStart: z.number(),
    audioStart: z.number(),
  })).optional(),
  appealDurations: z.object({ customer: z.number(), vendor: z.number() }).optional(),
  appealVideoSrcs: z.object({ customer: z.string().optional(), vendor: z.string().optional() }).optional(),
});

export type MargoProps = z.infer<typeof MargoPropsSchema>;

export const MargoMain: React.FC<MargoProps> = ({
  userName,
  propertyName,
  effectSoundSrc,
  bgMusicSrc,
  appealPlacement,
  calculatedDurations,
  appealDurations,
  appealVideoSrcs,
}) => {
  const [data, setData] = useState<MetadataJson | null>(null);
  const [handle] = useState(() => delayRender('Loading_Data'));
  const materialBase = `materials/${userName}/${propertyName}`;

  useEffect(() => {
    fetch(staticFile(`${materialBase}/metadata.json`))
      .then((res) => res.json())
      .then((json) => {
        setData(json as MetadataJson);
        continueRender(handle);
      })
      .catch(() => continueRender(handle));
  }, [handle, materialBase]);

  const sortedVideos = useMemo(() => {
    if (!data) return [];
    return [...data.uploadedVideos].sort((a, b) => a.editOrder - b.editOrder);
  }, [data]);

  const introOffset = calculatedDurations?.[0]?.videoStart ?? 0;
  const introSfxSrc = staticFile(effectSoundSrc ?? '効果音/効果音1.WAV');
  const metadataBgmPath = data ? `materials/bgMusics/${data.property.bgMusic.title}.mp3` : null;
  const resolvedBgmSrc = bgMusicSrc ?? metadataBgmPath;
  const bgmPath = bgMusicSrc === null || !resolvedBgmSrc ? null : staticFile(resolvedBgmSrc);
  const propertyNumberRaw = data?.property.number ?? data?.property.propertyNumber ?? data?.property.propertyNo ?? data?.property.code;
  const propertyNumber = propertyNumberRaw == null ? '' : String(propertyNumberRaw).trim().padStart(4, '0');
  const propertyLabel = propertyNumber ? `物件番号:${propertyNumber}` : '';

  const sequences = useMemo(() => {
    const items: Array<{ type: 'video'; id: string; durationInFrames: number; videoDurationInFrames: number; video: UploadedVideo } | { type: 'appeal'; id: 'customer' | 'vendor'; durationInFrames: number }> = [];
    if (!calculatedDurations || !appealDurations || sortedVideos.length === 0) return items;

    items.push({ type: 'video', id: sortedVideos[0].id, durationInFrames: calculatedDurations[0].timeline, videoDurationInFrames: calculatedDurations[0].video, video: sortedVideos[0] });
    if (appealPlacement !== 'both-at-end') {
      items.push({ type: 'appeal', id: 'customer', durationInFrames: appealDurations.customer });
    }
    for (let i = 1; i < sortedVideos.length; i++) {
      items.push({ type: 'video', id: sortedVideos[i].id, durationInFrames: calculatedDurations[i].timeline, videoDurationInFrames: calculatedDurations[i].video, video: sortedVideos[i] });
    }
    if (appealPlacement === 'both-at-end') {
      items.push({ type: 'appeal', id: 'customer', durationInFrames: appealDurations.customer });
    }
    items.push({ type: 'appeal', id: 'vendor', durationInFrames: appealDurations.vendor });
    return items;
  }, [appealDurations, appealPlacement, calculatedDurations, sortedVideos]);

  if (!data || !calculatedDurations || !appealDurations) return null;

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      <Audio src={introSfxSrc} volume={0.4} />
      {bgmPath && (
        <Sequence from={introOffset}>
          <Audio src={bgmPath} volume={0.15} loop />
        </Sequence>
      )}
      {sortedVideos.map((v, i) => {
        const d = calculatedDurations[i];
        if (!d || d.audio <= 0) return null;
        return (
          <Sequence key={`vo-${v.id}`} from={d.audioStart} durationInFrames={d.audio}>
            <Audio src={staticFile(`${materialBase}/voiceovers/voiceover-${v.id}.wav`)} volume={1} />
          </Sequence>
        );
      })}
      <Series>
        {introOffset > 0 && <Series.Sequence durationInFrames={introOffset}><AbsoluteFill /></Series.Sequence>}
        {sequences.map((seq, index) => {
          if (seq.type === 'video') {
            const isFirstVideo = sequences.findIndex(s => s.type === 'video') === index;
            return (
              <Series.Sequence key={`video-${seq.id}`} durationInFrames={seq.durationInFrames}>
                <Scene
                  video={seq.video}
                  materialBase={materialBase}
                  propertyLabel={propertyLabel}
                  durationInFrames={seq.durationInFrames}
                  videoDurationInFrames={seq.videoDurationInFrames}
                  isFirstScene={isFirstVideo}
                  voiceoverText={seq.video.voiceoverText}
                />
              </Series.Sequence>
            );
          }
          const isCustomer = seq.id === 'customer';
          const appealVideoSrc = isCustomer ? appealVideoSrcs?.customer : appealVideoSrcs?.vendor;
          return (
            <Series.Sequence key={`appeal-${seq.id}`} durationInFrames={seq.durationInFrames}>
              {appealVideoSrc ? (
                <OffthreadVideo src={staticFile(appealVideoSrc)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <NikenAppeal variant={seq.id} text={isCustomer ? '動画で探す、新しいお部屋探し\n不動産ポータルサイトNiken' : '“見られる物件”に変える\n動画作成無料代行 × 掲載無料 \n不動産ポータルサイトNiken'} />
              )}
            </Series.Sequence>
          );
        })}
      </Series>
    </AbsoluteFill>
  );
};

const Scene: React.FC<{ 
  video: UploadedVideo; 
  materialBase: string; 
  propertyLabel: string; 
  durationInFrames: number; 
  videoDurationInFrames: number; 
  isFirstScene: boolean;
  voiceoverText?: string | null;
}> = ({ video, materialBase, propertyLabel, durationInFrames, videoDurationInFrames, isFirstScene, voiceoverText }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lastVideoFrame = Math.max(0, videoDurationInFrames - 1);
  const videoSrc = staticFile(`${materialBase}/${video.filename}`);

  // --- タイピング & 消去ロジック ---
  const typingSpeed = 7; // 1秒あたりの文字数
  const pauseFrames = fps * 1.0; // 文末で表示を維持する時間（1秒後に消える）

  const { currentDisplayText, shouldShowText, showCursorAtThisFrame } = useMemo(() => {
    if (!voiceoverText) return { currentDisplayText: '', shouldShowText: false, showCursorAtThisFrame: false };

    // 句読点で分割
    const sentences = voiceoverText.split(/([。！？!?])/g).reduce((acc: string[], cur, i) => {
      if (i % 2 === 0) acc.push(cur);
      else acc[acc.length - 1] += cur;
      return acc;
    }, []).filter(s => s.trim() !== '');

    let elapsedFrames = 0;
    let targetSentence = "";
    let relativeChars = 0;
    let isVisible = false;
    let isTyping = false;

    for (const sentence of sentences) {
      const typingFrames = Math.ceil((sentence.length / typingSpeed) * fps);
      const totalSentenceFrames = typingFrames + pauseFrames;

      if (frame < elapsedFrames + totalSentenceFrames) {
        const framesInThisSentence = frame - elapsedFrames;
        targetSentence = sentence;
        
        if (framesInThisSentence < typingFrames) {
          // タイピング中
          relativeChars = Math.floor((framesInThisSentence / typingFrames) * sentence.length);
          isVisible = true;
          isTyping = true;
        } else {
          // ポーズ中（文末まで表示）
          relativeChars = sentence.length;
          isVisible = true;
          isTyping = false;
        }
        break;
      }
      // totalSentenceFramesを過ぎたらisVisible=falseのまま次のループへ（＝消える）
      elapsedFrames += totalSentenceFrames;
    }

    return {
      currentDisplayText: targetSentence.substring(0, relativeChars),
      shouldShowText: isVisible,
      showCursorAtThisFrame: isTyping
    };
  }, [voiceoverText, frame, fps]);

  const isCursorBlinking = Math.floor(frame / (fps / 4)) % 2 === 0;

  return (
    <AbsoluteFill>
      {/* ビデオ表示 */}
      {frame < videoDurationInFrames ? (
        <OffthreadVideo src={videoSrc} muted trimAfter={Math.max(1, videoDurationInFrames)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <Freeze frame={lastVideoFrame}>
          <OffthreadVideo src={videoSrc} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </Freeze>
      )}

      {/* タイピングテキスト表示 (位置を下げて配置) */}
      {shouldShowText && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-end', // 下揃えに変更
          paddingBottom: '300px', // 物件情報より上に配置するためのマージン
          paddingLeft: '10%',
          paddingRight: '10%',
          zIndex: 10,
          pointerEvents: 'none',
        }}>
          <div style={{ 
            color: 'white',
            fontSize: 56, 
            fontFamily: 'monospace',
            lineHeight: '1.4',
            textAlign: 'center',
            whiteSpace: 'pre-wrap',
            textShadow: '0 4px 25px rgba(0,0,0,1)',
          }}>
            {currentDisplayText}
            <span style={{ 
              display: 'inline-block', 
              width: '18px', 
              height: '56px', 
              backgroundColor: 'white',
              marginLeft: '10px',
              verticalAlign: 'middle',
              opacity: (showCursorAtThisFrame && isCursorBlinking) ? 1 : 0 
            }} />
          </div>
        </div>
      )}

      {/* 物件情報ラベル */}
      <div style={{ 
        position: 'absolute', 
        bottom: 100, 
        left: '50%', 
        transform: 'translateX(-50%)', 
        backgroundColor: 'rgba(0, 0, 0, 0.4)', 
        backdropFilter: 'blur(10px)', 
        padding: '15px 40px', 
        borderRadius: '10px', 
        color: 'white', 
        fontSize: 40, 
        whiteSpace: 'pre-line', 
        textAlign: 'center',
        zIndex: 12
      }}>
        {propertyLabel}
      </div>

      {/* 既存の overlayText (タイトルアニメーション) */}
      {video.overlayText && (
        <div style={{ position: 'absolute', top: isFirstScene ? 400 : 150, width: '100%', textAlign: 'center', display: 'flex', justifyContent: 'center', padding: '0 50px', flexWrap: 'wrap', zIndex: 11 }}>
          {isFirstScene ? (
            (() => {
              const spr = spring({ frame, fps, config: { stiffness: 180, damping: 12, mass: 1.2 } });
              const scale = interpolate(spr, [0, 1], [0.3, 1]);
              const opacity = interpolate(spr, [0, 0.4], [0, 1]);
              const commonStyle: React.CSSProperties = { fontSize: 140, fontWeight: 900, lineHeight: 1.1, whiteSpace: 'pre-line', position: 'absolute', width: '100%', left: 0, top: 0, opacity, transform: `scale(${scale})` };
              return (
                <div style={{ position: 'relative', width: '100%', height: 300 }}>
                  <div style={{ ...commonStyle, color: 'black', WebkitTextStroke: '12px black', textShadow: '0 15px 30px rgba(0,0,0,0.8)', zIndex: 1 }}>{video.overlayText.toUpperCase()}</div>
                  <div style={{ ...commonStyle, color: 'white', filter: 'blur(12px)', zIndex: 2 }}>{video.overlayText.toUpperCase()}</div>
                  <div style={{ ...commonStyle, background: 'linear-gradient(to bottom, #fff6af 0%, #ffdf7e 40%, #c49a3f 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', zIndex: 3 }}>{video.overlayText.toUpperCase()}</div>
                </div>
              );
            })()
          ) : (
            video.overlayText.toUpperCase().split('').map((char, i) => {
              const spr = spring({ frame, fps, config: { stiffness: 100, damping: 15 }, delay: i * 2 });
              const commonCharStyle: React.CSSProperties = { color: 'white', fontSize: 100, fontWeight: 900, display: 'inline-block', opacity: spr, transform: `translateY(${interpolate(spr, [0, 1], [50, 0])}px)` };
              if (char === '\n') return <div key={i} style={{ width: '100%', height: 0 }} />;
              return <span key={i} style={commonCharStyle}>{char === ' ' ? '\u00A0' : char}</span>;
            })
          )}
        </div>
      )}
    </AbsoluteFill>
  );
};
