import { getVideoMetadata, getAudioData } from '@remotion/media-utils';
import { type CalculateMetadataFunction, Composition, staticFile } from 'remotion';
import { MargoMain, type MargoProps, MargoPropsSchema } from './MargoMain';

const FPS = 30;

type UploadedVideo = {
  id: string;
  filename: string;
  editOrder: number;
};

type MetadataJson = {
  uploadedVideos: UploadedVideo[];
};

const getAppealDurationInFrames = async (src: string) => {
  try {
    const audio = await getAudioData(src);
    return Math.max(1, Math.ceil(audio.durationInSeconds * FPS));
  } catch {
    return 5 * FPS;
  }
};

const calculateMetadata: CalculateMetadataFunction<MargoProps> = async ({
  props,
  abortSignal,
}) => {
  const materialBase = `materials/${props.userName}/${props.propertyName}`;
  const response = await fetch(staticFile(`${materialBase}/metadata.json`), { signal: abortSignal });
  const json = (await response.json()) as MetadataJson;

  const sorted = [...json.uploadedVideos].sort((a, b) => a.editOrder - b.editOrder);

  const durations = await Promise.all(
    sorted.map(async (v) => {
      const videoUrl = staticFile(`${materialBase}/${v.filename}`);
      const audioUrl = staticFile(`${materialBase}/voiceovers/voiceover-${v.id}.wav`);
      
      let vDur = 0;
      let aDur = 0;

      // 動画の尺取得
      try {
        const vMeta = await getVideoMetadata(videoUrl);
        vDur = vMeta.durationInSeconds;
      } catch { vDur = 5; }
      
      // 音声の存在チェックと尺取得
      try {
        const audioExists = await fetch(audioUrl, { method: 'HEAD' });
        if (audioExists.ok) {
          const aData = await getAudioData(audioUrl);
          aDur = aData.durationInSeconds;
        }
      } catch { aDur = 0; }

      // 音声がなくても動画の長さで計算される
      return Math.ceil(Math.max(vDur, aDur) * FPS);
    })
  );

  const customerAppeal = await getAppealDurationInFrames(staticFile('顧客訴求音声.wav'));
  const vendorAppeal = await getAppealDurationInFrames(staticFile('業者訴求音声.wav'));

  return { 
    durationInFrames: durations.reduce((a, b) => a + b, 0) + customerAppeal + vendorAppeal,
    props: { 
      ...props,
      calculatedDurations: durations,
      appealDurations: { customer: customerAppeal, vendor: vendorAppeal },
    } 
  };
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="SPCourtMejiro401"
      component={MargoMain}
      durationInFrames={1}
      calculateMetadata={calculateMetadata}
      fps={FPS}
      width={1080}
      height={1920}
      schema={MargoPropsSchema}
      defaultProps={{
        userName: 'tanakatatsuya',
        propertyName: 'SPCourtMejiro401',
      }}
    />
  );
};
