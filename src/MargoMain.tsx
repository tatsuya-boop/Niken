import { useEffect, useMemo, useState } from 'react';
import { Series, AbsoluteFill, OffthreadVideo, Audio, staticFile, continueRender, delayRender, useVideoConfig, interpolate, useCurrentFrame, spring, Sequence, Freeze } from 'remotion';
import { z } from 'zod';
import { NikenAppeal } from './NikenAppeal';

type UploadedVideo = {
  id: string;
  filename: string;
  editOrder: number;
  overlayText?: string | null;
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

export const MargoMain: React.FC<MargoProps> = ({ userName, propertyName, effectSoundSrc, calculatedDurations, appealDurations, appealVideoSrcs }) => {
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
  const bgmPath = data ? staticFile(`materials/bgMusics/${data.property.bgMusic.title}.mp3`) : null;
  const propertyTitle = data?.property.name ?? '';
  const propertyNumberRaw = data?.property.number ?? data?.property.propertyNumber ?? data?.property.propertyNo ?? data?.property.code;
  const propertyNumber = propertyNumberRaw == null ? '' : String(propertyNumberRaw).trim().padStart(4, '0');
  const propertyLabel = propertyNumber ? `${propertyTitle}\n物件番号:${propertyNumber}` : propertyTitle;

  const sequences = useMemo(() => {
    const items: Array<{ type: 'video'; id: string; durationInFrames: number; videoDurationInFrames: number; video: UploadedVideo } | { type: 'appeal'; id: 'customer' | 'vendor'; durationInFrames: number }> = [];
    if (!calculatedDurations || !appealDurations || sortedVideos.length === 0) return items;

    items.push({ type: 'video', id: sortedVideos[0].id, durationInFrames: calculatedDurations[0].timeline, videoDurationInFrames: calculatedDurations[0].video, video: sortedVideos[0] });
    items.push({ type: 'appeal', id: 'customer', durationInFrames: appealDurations.customer });
    for (let i = 1; i < sortedVideos.length; i++) {
      items.push({ type: 'video', id: sortedVideos[i].id, durationInFrames: calculatedDurations[i].timeline, videoDurationInFrames: calculatedDurations[i].video, video: sortedVideos[i] });
    }
    items.push({ type: 'appeal', id: 'vendor', durationInFrames: appealDurations.vendor });
    return items;
  }, [appealDurations, calculatedDurations, sortedVideos]);

  if (!data || !calculatedDurations || !appealDurations || !bgmPath) return null;

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      <Audio src={introSfxSrc} volume={0.4} />
      <Sequence from={introOffset}>
        <Audio src={bgmPath} volume={0.15} loop />
      </Sequence>
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

const Scene: React.FC<{ video: UploadedVideo; materialBase: string; propertyLabel: string; durationInFrames: number; videoDurationInFrames: number; isFirstScene: boolean }> = ({ video, materialBase, propertyLabel, durationInFrames, videoDurationInFrames, isFirstScene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lastVideoFrame = Math.max(0, videoDurationInFrames - 1);
  const videoSrc = staticFile(`${materialBase}/${video.filename}`);

  return (
    <AbsoluteFill>
      <OffthreadVideo src={videoSrc} muted trimAfter={Math.max(1, videoDurationInFrames)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      {durationInFrames > videoDurationInFrames && (
        <Sequence from={videoDurationInFrames} durationInFrames={durationInFrames - videoDurationInFrames}>
          <Freeze frame={lastVideoFrame}><OffthreadVideo src={videoSrc} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></Freeze>
        </Sequence>
      )}
      {video.overlayText && (
        <div style={{ position: 'absolute', top: 150, width: '100%', textAlign: 'center', display: 'flex', justifyContent: 'center', padding: '0 50px', flexWrap: 'wrap' }}>
          {isFirstScene ? (
            (() => {
              const spr = spring({ frame, fps, config: { stiffness: 180, damping: 12, mass: 1.2 } });
              const scale = interpolate(spr, [0, 1], [0.3, 1]);
              const opacity = interpolate(spr, [0, 0.4], [0, 1]);

              const commonStyle: React.CSSProperties = {
                fontSize: 140,
                fontWeight: 900,
                lineHeight: 1.1,
                whiteSpace: 'pre-line',
                position: 'absolute',
                width: '100%',
                left: 0,
                top: 0,
                opacity,
                transform: `scale(${scale})`,
              };

              return (
                <div style={{ position: 'relative', width: '100%', height: 300 }}>
                  {/* レイヤー1: 強い影と縁取り */}
                  <div style={{
                    ...commonStyle,
                    color: 'black',
                    WebkitTextStroke: '12px black',
                    textShadow: '0 15px 30px rgba(0,0,0,0.8)',
                    zIndex: 1,
                  }}>
                    {video.overlayText.toUpperCase()}
                  </div>
                  {/* レイヤー2: 白い光（グロー） */}
                  <div style={{
                    ...commonStyle,
                    color: 'white',
                    filter: 'blur(12px)',
                    zIndex: 2,
                  }}>
                    {video.overlayText.toUpperCase()}
                  </div>
                  {/* レイヤー3: 金色グラデーション本体 */}
                  <div style={{
                    ...commonStyle,
                    background: 'linear-gradient(to bottom, #fff6af 0%, #ffdf7e 40%, #c49a3f 100%)',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    zIndex: 3,
                  }}>
                    {video.overlayText.toUpperCase()}
                  </div>
                </div>
              );
            })()
          ) : (
            video.overlayText.toUpperCase().split('').map((char, i) => {
              const spr = spring({ frame, fps, config: { stiffness: 100, damping: 15 }, delay: i * 2 });
              const commonCharStyle: React.CSSProperties = {
                color: 'white',
                fontSize: 100,
                fontWeight: 900,
                display: 'inline-block',
                opacity: spr,
                transform: `translateY(${interpolate(spr, [0, 1], [50, 0])}px)`,
              };

              if (char === '\n') {
                return <div key={i} style={{ width: '100%', height: 0 }} />;
              }

              return (
                <span key={i} style={commonCharStyle}>
                  {char === ' ' ? '\u00A0' : char}
                </span>
              );
            })
          )}
        </div>
      )}
      <div style={{ position: 'absolute', bottom: 100, left: '50%', transform: 'translateX(-50%)', backgroundColor: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(10px)', padding: '15px 40px', borderRadius: '10px', color: 'white', fontSize: 40, whiteSpace: 'pre-line', textAlign: 'center' }}>{propertyLabel}</div>
    </AbsoluteFill>
  );
};