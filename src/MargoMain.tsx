import { useEffect, useState } from 'react';
import { Series, AbsoluteFill, OffthreadVideo, Audio, staticFile, continueRender, delayRender, useVideoConfig, interpolate, useCurrentFrame, spring } from 'remotion';
import { z } from 'zod';

export const MargoPropsSchema = z.object({
  userName: z.string(),
  propertyName: z.string(),
  calculatedDurations: z.array(z.number()).optional(), 
});

export type MargoProps = z.infer<typeof MargoPropsSchema>;

export const MargoMain: React.FC<MargoProps> = ({ userName, propertyName, calculatedDurations }) => {
  const [data, setData] = useState<any>(null);
  const [handle] = useState(() => delayRender('Loading_Data'));
  const materialBase = `materials/${userName}/${propertyName}`;

  useEffect(() => {
    fetch(staticFile(`${materialBase}/metadata.json`))
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        continueRender(handle);
      })
      .catch(() => continueRender(handle));
  }, [handle, materialBase]);

  if (!data || !calculatedDurations) return null;

  const bgmPath = staticFile(`materials/bgMusics/${data.property.bgMusic.title}.mp3`);
  const sortedVideos = [...data.uploadedVideos].sort((a, b) => a.editOrder - b.editOrder);

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      <Audio src={bgmPath} volume={0.15} loop />
      <Series>
        {sortedVideos.map((video, index) => (
          <Series.Sequence key={video.id} durationInFrames={calculatedDurations[index]}>
            <Scene video={video} materialBase={materialBase} />
          </Series.Sequence>
        ))}
      </Series>
      {/* 物件名表示 */}
      <div style={{ position: 'absolute', bottom: 100, left: '50%', transform: 'translateX(-50%)', backgroundColor: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', padding: '15px 40px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.2)', zIndex: 100 }}>
        <div style={{ color: 'white', fontSize: 40, fontWeight: 300, letterSpacing: '0.2em' }}>{data.property.name}</div>
      </div>
    </AbsoluteFill>
  );
};

const Scene: React.FC<{ video: any; materialBase: string }> = ({ video, materialBase }) => {
  const [audioExists, setAudioExists] = useState(false);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const voUrl = staticFile(`${materialBase}/voiceovers/voiceover-${video.id}.wav`);

  useEffect(() => {
    fetch(voUrl, { method: 'HEAD' })
      .then((res) => setAudioExists(res.ok))
      .catch(() => setAudioExists(false));
  }, [voUrl]);

  return (
    <AbsoluteFill>
      {audioExists && <Audio src={voUrl} volume={1} />}
      <OffthreadVideo src={staticFile(`${materialBase}/${video.filename}`)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
    </AbsoluteFill>
  );
};