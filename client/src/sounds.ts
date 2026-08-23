// 提示音:Web Audio 合成,无需音频文件
// - 落子声:短促"嗒"声(双方每步移动都播放)
// - 将军声:两声上扬警示音

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext();
    // 浏览器策略:需用户交互后才能播放
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** 落子提示音:清脆的棋子"嗒"声(高频脆响 + 低频棋盘共鸣) */
export function playMoveSound(): void {
  const ac = getCtx();
  if (!ac || ac.state !== 'running') return;
  const t = ac.currentTime;
  // 轻微随机音高,连落多子时更自然
  const detune = 0.92 + Math.random() * 0.16;

  // 脆响:高频短促瞬态,模拟棋子磕碰的"嗒"
  const click = ac.createOscillator();
  const clickGain = ac.createGain();
  click.type = 'triangle';
  click.frequency.setValueAtTime(2300 * detune, t);
  click.frequency.exponentialRampToValueAtTime(900 * detune, t + 0.03);
  clickGain.gain.setValueAtTime(0.5, t);
  clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  click.connect(clickGain).connect(ac.destination);
  click.start(t);
  click.stop(t + 0.06);

  // 共鸣:低频"嘧"声,模拟棋子落在木棋盘上
  const body = ac.createOscillator();
  const bodyGain = ac.createGain();
  body.type = 'sine';
  body.frequency.setValueAtTime(340 * detune, t);
  body.frequency.exponentialRampToValueAtTime(180 * detune, t + 0.07);
  bodyGain.gain.setValueAtTime(0.28, t);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  body.connect(bodyGain).connect(ac.destination);
  body.start(t);
  body.stop(t + 0.1);
}

/** 将军警示音(两声上扬) */
export function playCheckSound(): void {
  const ac = getCtx();
  if (!ac || ac.state !== 'running') return;
  const t = ac.currentTime;
  [523, 784].forEach((freq, i) => {
    const start = t + i * 0.18;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.22, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.16);
    osc.connect(gain).connect(ac.destination);
    osc.start(start);
    osc.stop(start + 0.18);
  });
}
