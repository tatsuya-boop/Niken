import {getAudioData, getVideoMetadata} from '@remotion/media-utils';
import {type CalculateMetadataFunction, Composition, staticFile} from 'remotion';
import {type MargoProps, MargoPropsSchema} from './MargoMain';
import {resolveVideoTemplateComponent} from './propertyVideoRegistry';

const FPS = 30;

type UploadedVideo = {
  id: string;
  filename: string;
  editOrder: number;
};

type MetadataJson = {
  uploadedVideos: UploadedVideo[];
};

type ClipDurations = {
  video: number;
  audio: number;
  timeline: number;
  videoStart: number;
  audioStart: number;
};

const existsInPublic = async (src: string, abortSignal: AbortSignal) => {
  try {
    const res = await fetch(staticFile(src), {method: 'HEAD', signal: abortSignal});
    return res.ok;
  } catch {
    return false;
  }
};

const getAppealDurationInFrames = async (src: string) => {
  try {
    const audio = await getAudioData(src);
    return Math.max(1, Math.ceil(audio.durationInSeconds * FPS));
  } catch {
    return 5 * FPS;
  }
};

const getVideoDurationInFrames = async (src: string) => {
  try {
    const vMeta = await getVideoMetadata(src);
    return Math.max(1, Math.ceil(vMeta.durationInSeconds * FPS));
  } catch {
    return 5 * FPS;
  }
};

const calculateMetadata: CalculateMetadataFunction<MargoProps> = async ({
  props,
  abortSignal,
}) => {
  const materialBase = `materials/${props.userName}/${props.propertyName}`;
  const response = await fetch(staticFile(`${materialBase}/metadata.json`), {
    signal: abortSignal,
  });
  const json = (await response.json()) as MetadataJson;

  const sorted = [...json.uploadedVideos].sort((a, b) => a.editOrder - b.editOrder);

  const clipBasics = await Promise.all(
    sorted.map(async (v) => {
      const videoUrl = staticFile(`${materialBase}/${v.filename}`);
      const audioUrl = staticFile(`${materialBase}/voiceovers/voiceover-${v.id}.wav`);

      let vDur = 0;
      let aDur = 0;

      try {
        const vMeta = await getVideoMetadata(videoUrl);
        vDur = vMeta.durationInSeconds;
      } catch {
        vDur = 5;
      }

      try {
        const audioExists = await fetch(audioUrl, {method: 'HEAD'});
        if (audioExists.ok) {
          const aData = await getAudioData(audioUrl);
          aDur = aData.durationInSeconds;
        }
      } catch {
        aDur = 0;
      }

      const videoFrames = Math.max(1, Math.ceil(vDur * FPS));
      const audioFrames = Math.max(0, Math.ceil(aDur * FPS));

      return {
        video: videoFrames,
        audio: audioFrames,
        timeline: Math.max(videoFrames, audioFrames),
      };
    })
  );

  const customerAppealMp4Exists = await existsInPublic('顧客訴求動画.mp4', abortSignal);
  const vendorAppealMp4Exists = await existsInPublic('業者訴求動画.mp4', abortSignal);

  const customerAppeal = customerAppealMp4Exists
    ? await getVideoDurationInFrames(staticFile('顧客訴求動画.mp4'))
    : await getAppealDurationInFrames(staticFile('顧客訴求音声.wav'));

  const vendorAppeal = vendorAppealMp4Exists
    ? await getVideoDurationInFrames(staticFile('業者訴求動画.mp4'))
    : await getAppealDurationInFrames(staticFile('業者訴求音声.wav'));

  const includeCustomerAfterFirst = props.appealPlacement !== 'both-at-end';

  const videoStarts: number[] = [];
  let cursor = 0;

  if (sorted.length === 0) {
    cursor = customerAppeal + vendorAppeal;
  } else {
    for (let i = 0; i < sorted.length; i++) {
      videoStarts[i] = cursor;
      cursor += clipBasics[i].timeline;
      if (i === 0 && includeCustomerAfterFirst) {
        cursor += customerAppeal;
      }
    }

    if (!includeCustomerAfterFirst) {
      cursor += customerAppeal;
    }

    cursor += vendorAppeal;
  }

  const timelineEnd = cursor;

  const audioStarts: number[] = [];
  let prevAudioEnd = 0;
  for (let i = 0; i < clipBasics.length; i++) {
    const start = Math.max(videoStarts[i] ?? 0, prevAudioEnd);
    audioStarts[i] = start;
    prevAudioEnd = start + clipBasics[i].audio;
  }

  const durations: ClipDurations[] = clipBasics.map((b, i) => ({
    ...b,
    videoStart: videoStarts[i] ?? 0,
    audioStart: audioStarts[i] ?? 0,
  }));

  return {
    durationInFrames: Math.max(timelineEnd, prevAudioEnd),
    props: {
      ...props,
      calculatedDurations: durations,
      appealDurations: {customer: customerAppeal, vendor: vendorAppeal},
      appealVideoSrcs: {
        customer: customerAppealMp4Exists ? '顧客訴求動画.mp4' : undefined,
        vendor: vendorAppealMp4Exists ? '業者訴求動画.mp4' : undefined,
      },
    },
  };
};

const PropertyVideoComposition: React.FC<MargoProps> = (props) => {
  const Component = resolveVideoTemplateComponent(props.templateName);
  return <Component {...props} />;
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="SPCourtMejiro401"
      component={PropertyVideoComposition}
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
