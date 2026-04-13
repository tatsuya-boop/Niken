import { AbsoluteFill, Audio, staticFile, Img } from 'remotion';

export const NikenAppeal: React.FC<{
  variant: 'customer' | 'vendor';
  text: string;
}> = ({ variant, text }) => {
  const logo = staticFile('NikenLogo.png');
  const audioSrc = variant === 'customer' ? staticFile('顧客訴求音声.wav') : staticFile('業者訴求音声.wav');

  return (
    <AbsoluteFill>
      <Audio src={audioSrc} volume={1} />
      <AbsoluteFill
        style={{
          background:
            variant === 'customer'
              ? 'radial-gradient(1100px 1100px at 15% 15%, rgba(110, 231, 255, 0.75), rgba(255,255,255,0) 55%), radial-gradient(900px 900px at 85% 75%, rgba(255, 180, 230, 0.55), rgba(255,255,255,0) 60%), linear-gradient(180deg, #f7fbff 0%, #eef5ff 60%, #ffffff 100%)'
              : 'radial-gradient(1100px 1100px at 15% 15%, rgba(255, 214, 140, 0.75), rgba(255,255,255,0) 55%), radial-gradient(900px 900px at 85% 75%, rgba(150, 255, 210, 0.55), rgba(255,255,255,0) 60%), linear-gradient(180deg, #fbfffb 0%, #f2fff8 60%, #ffffff 100%)',
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage:
            'radial-gradient(circle at 10% 10%, rgba(255,255,255,0.7) 0, rgba(255,255,255,0) 35%), radial-gradient(circle at 90% 80%, rgba(255,255,255,0.55) 0, rgba(255,255,255,0) 40%)',
          opacity: 0.65,
        }}
      />

      <AbsoluteFill
        style={{
          padding: 90,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            width: 820,
            borderRadius: 36,
            padding: '70px 64px 64px',
            backgroundColor: 'rgba(255,255,255,0.72)',
            border: '1px solid rgba(0,0,0,0.06)',
            boxShadow: '0 30px 90px rgba(0,0,0,0.12)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 34,
          }}
        >
          <Img src={logo} style={{ width: 320, height: 320, objectFit: 'contain' }} />

          <div
            style={{
              color: '#0b1020',
              fontSize: variant === 'customer' ? 54 : 48,
              lineHeight: 1.22,
              fontWeight: 900,
              letterSpacing: '0.01em',
              whiteSpace: 'pre-wrap',
              textAlign: 'center',
              fontFamily:
                'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif',
            }}
          >
            {text}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
