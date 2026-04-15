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
  calculatedDurations: z
    .array(
      z.object({
        video: z.number(),
        audio: z.number(),
        timeline: z.number(),
        videoStart: z.number(),
        audioStart: z.number(),
      })
    )
    .optional(),
  appealDurations: z
    .object({
      customer: z.number(),
      vendor: z.number(),
    })
    .optional(),
  appealVideoSrcs: z
    .object({
      customer: z.string().optional(),
      vendor: z.string().optional(),
    })
    .optional(),
});

export type MargoProps = z.infer<typeof MargoPropsSchema>;

export const MargoMain: React.FC<MargoProps> = ({ userName, propertyName, calculatedDurations, appealDurations, appealVideoSrcs }) => {
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

  const bgmPath = data ? staticFile(`materials/bgMusics/${data.property.bgMusic.title}.mp3`) : null;
  const propertyTitle = data?.property.name ?? '';
  const propertyNumberRaw =
    data?.property.number ??
    data?.property.propertyNumber ??
    data?.property.propertyNo ??
    data?.property.code;
  const propertyNumber = propertyNumberRaw == null ? '' : String(propertyNumberRaw).trim().padStart(4, '0');
  const propertyLabel = propertyNumber
    ? `${propertyTitle}\n物件番号:${propertyNumber}`
    : propertyTitle;

  const sequences = useMemo(() => {
    const items: Array<
      | {
          type: 'video';
          id: string;
          durationInFrames: number;
          videoDurationInFrames: number;
          video: UploadedVideo;
        }
      | { type: 'appeal'; id: 'customer' | 'vendor'; durationInFrames: number }
    > = [];

    if (!calculatedDurations || !appealDurations) return items;

    if (sortedVideos.length === 0) {
      items.push({ type: 'appeal', id: 'customer', durationInFrames: appealDurations.customer });
      items.push({ type: 'appeal', id: 'vendor', durationInFrames: appealDurations.vendor });
      return items;
    }

    items.push({
      type: 'video',
      id: sortedVideos[0].id,
        durationInFrames: calculatedDurations[0].timeline,
      videoDurationInFrames: calculatedDurations[0].video,
      video: sortedVideos[0],
    });
    items.push({ type: 'appeal', id: 'customer', durationInFrames: appealDurations.customer });

    for (let i = 1; i < sortedVideos.length; i++) {
      items.push({
        type: 'video',
        id: sortedVideos[i].id,
        durationInFrames: calculatedDurations[i].timeline,
        videoDurationInFrames: calculatedDurations[i].video,
        video: sortedVideos[i],
      });
    }

    items.push({ type: 'appeal', id: 'vendor', durationInFrames: appealDurations.vendor });
    return items;
  }, [appealDurations, calculatedDurations, sortedVideos]);

  const voiceoverStarts = useMemo(() => {
    // Safety net: serialize voiceovers so they never overlap.
    let prevAudioEnd = 0;
    return calculatedDurations?.map((d) => {
      const start = Math.max(d.videoStart, prevAudioEnd);
      prevAudioEnd = start + d.audio;
      return start;
    }) ?? [];
  }, [calculatedDurations]);

  const appealMp4Intervals = useMemo(() => {
    let from = 0;
    const intervals: Array<{ from: number; to: number }> = [];
    for (const seq of sequences) {
      if (seq.type === 'appeal') {
        const src = seq.id === 'customer' ? appealVideoSrcs?.customer : appealVideoSrcs?.vendor;
        if (src) {
          intervals.push({ from, to: from + seq.durationInFrames });
        }
      }
      from += seq.durationInFrames;
    }
    return intervals;
  }, [appealVideoSrcs?.customer, appealVideoSrcs?.vendor, sequences]);

  const frame = useCurrentFrame();
  const bgmVolume = useMemo(() => {
    const base = 0.15;
    for (const itv of appealMp4Intervals) {
      if (frame >= itv.from && frame < itv.to) return 0;
    }
    return base;
  }, [appealMp4Intervals, frame]);

  if (!data || !calculatedDurations || !appealDurations || !bgmPath) return null;

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      <Audio src={bgmPath} volume={bgmVolume} loop />
      {sortedVideos.map((v, i) => {
        const d = calculatedDurations[i];
        if (!d || d.audio <= 0) return null;
        const voUrl = staticFile(`${materialBase}/voiceovers/voiceover-${v.id}.wav`);
        return (
          <Sequence key={`vo-${v.id}`} from={voiceoverStarts[i] ?? d.audioStart} durationInFrames={d.audio}>
            <Audio src={voUrl} volume={1} />
          </Sequence>
        );
      })}
      <Series>
        {sequences.map((seq) => {
          if (seq.type === 'video') {
            return (
              <Series.Sequence key={`video-${seq.id}`} durationInFrames={seq.durationInFrames}>
                <Scene
                  video={seq.video}
                  materialBase={materialBase}
                  propertyLabel={propertyLabel}
                  durationInFrames={seq.durationInFrames}
                  videoDurationInFrames={seq.videoDurationInFrames}
                />
              </Series.Sequence>
            );
          }

          const isCustomer = seq.id === 'customer';
          const appealVideoSrc = isCustomer ? appealVideoSrcs?.customer : appealVideoSrcs?.vendor;
          if (appealVideoSrc) {
            return (
              <Series.Sequence key={`appeal-mp4-${seq.id}`} durationInFrames={seq.durationInFrames}>
                <AbsoluteFill>
                  <OffthreadVideo
                    src={staticFile(appealVideoSrc)}
                    // 音声は mp4 側のみを使う（BGM は上で同区間ミュート）
                    muted={false}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </AbsoluteFill>
              </Series.Sequence>
            );
          }
          return (
            <Series.Sequence key={`appeal-${seq.id}`} durationInFrames={seq.durationInFrames}>
              <NikenAppeal
                variant={seq.id}
                text={
                  isCustomer
                    ? '動画で探す、新しいお部屋探し\n不動産ポータルサイトNiken'
                    : '“見られる物件”に変える\n動画作成無料代行 × 掲載無料 \n不動産ポータルサイトNiken'
                }
              />
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
}> = ({ video, materialBase, propertyLabel, durationInFrames, videoDurationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const holdFrames = Math.max(0, durationInFrames - videoDurationInFrames);
  const lastVideoFrame = Math.max(0, videoDurationInFrames - 1);
  const videoSrc = staticFile(`${materialBase}/${video.filename}`);

  return (
    <AbsoluteFill>
      <OffthreadVideo
        src={videoSrc}
        muted
        // `trimAfter` is exclusive; subtracting 1 caused a 1-frame black gap at cuts.
        trimAfter={Math.max(1, videoDurationInFrames)}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      {holdFrames > 0 ? (
        <Sequence from={videoDurationInFrames} durationInFrames={holdFrames}>
          <Freeze frame={lastVideoFrame}>
            <OffthreadVideo
              src={videoSrc}
              muted
              trimAfter={Math.max(1, videoDurationInFrames)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </Freeze>
        </Sequence>
      ) : null}
      {video.overlayText && (
        <div style={{ position: 'absolute', top: 150, width: '100%', textAlign: 'center', display: 'flex', justifyContent: 'center', flexWrap: 'wrap', padding: '0 50px' }}>
          {video.overlayText.toUpperCase().split('').map((char: string, i: number) => {
            const spr = spring({ frame, fps, config: { stiffness: 100, damping: 15 }, delay: i * 2 });
            if (char === '\n') return <div key={i} style={{ width: '100%' }} />;
            return (
              <span key={i} style={{ color: 'white', fontSize: 100, lineHeight: 1.1, fontWeight: 900, letterSpacing: '0.1em', textShadow: '0 10px 20px rgba(0,0,0,0.6)', fontFamily: 'Helvetica, Arial, sans-serif', display: 'inline-block', opacity: spr, transform: `translateY(${interpolate(spr, [0, 1], [50, 0])}px)`, whiteSpace: char === ' ' ? 'pre' : 'normal' }}>
                {char === ' ' ? '\u00A0' : char}
              </span>
            );
          })}
        </div>
      )}
      {/* 物件名表示 */}
      <div style={{ position: 'absolute', bottom: 100, left: '50%', transform: 'translateX(-50%)', backgroundColor: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', padding: '15px 40px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.2)', zIndex: 100 }}>
        <div style={{ color: 'white', fontSize: 40, fontWeight: 300, letterSpacing: '0.2em', whiteSpace: 'pre-line', textAlign: 'center' }}>{propertyLabel}</div>
      </div>
    </AbsoluteFill>
  );
};
