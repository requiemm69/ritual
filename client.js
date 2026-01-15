(() => {
  let audioContext = null;
  let isAudioReady = false;
  let noiseNode = null;
  let lpf1 = null, lpf2 = null;
  let panner = null;
  let masterGain = null;
  let bondOscillators = [];
  let bondActive = false;

  const BASE_LP_FREQ = 150;
  const MAX_DISTANCE = 300;

  const workletCode = `
    class BrownNoiseProcessor extends AudioWorkletProcessor {
      constructor() {
        super();
        this.lastOut = 0;
      }
      process(inputs, outputs, parameters) {
        const output = outputs[0];
        if (!output || output.length === 0) return true;
        const channel = output[0];
        for (let i = 0; i < channel.length; i++) {
          const white = Math.random() * 2 - 1;
          this.lastOut = (this.lastOut + (0.02 * white)) / 1.02;
          channel[i] = this.lastOut * 0.7;
        }
        return true;
      }
    }
    registerProcessor('brown-noise', BrownNoiseProcessor);
  `;

  async function initAudio() {
    if (isAudioReady) return;
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioContext.createGain();
    masterGain.gain.value = 0;
    masterGain.connect(audioContext.destination);

    const blob = new Blob([workletCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    await audioContext.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);

    createVoidDrone();
    isAudioReady = true;
  }

  function createVoidDrone() {
    noiseNode = new AudioWorkletNode(audioContext, 'brown-noise');

    lpf1 = audioContext.createBiquadFilter();
    lpf2 = audioContext.createBiquadFilter();
    lpf1.type = 'lowpass';
    lpf2.type = 'lowpass';
    lpf1.frequency.value = BASE_LP_FREQ;
    lpf2.frequency.value = BASE_LP_FREQ;
    lpf1.Q.value = 0.7;
    lpf2.Q.value = 0.7;

    const lfo = audioContext.createOscillator();
    const lfoGain = audioContext.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = 0.1;
    lfoGain.gain.value = 20;
    lfo.connect(lfoGain);
    lfoGain.connect(lpf1.frequency);
    lfo.start();

    panner = audioContext.createStereoPanner();
    const panLfo = audioContext.createOscillator();
    const panLfoGain = audioContext.createGain();
    panLfo.type = 'sine';
    panLfo.frequency.value = 0.08;
    panLfoGain.gain.value = 0.7;
    panLfo.connect(panLfoGain);
    panLfoGain.connect(panner.pan);
    panLfo.start();

    noiseNode.connect(lpf1);
    lpf1.connect(lpf2);
    lpf2.connect(panner);
    panner.connect(masterGain);
    masterGain.gain.linearRampToValueAtTime(0.5, audioContext.currentTime + 3);
  }

  function triggerBondTone() {
    if (bondActive) return;
    bondActive = true;

    const freqs = [440, 659.25];
    const bondGain = audioContext.createGain();
    bondGain.gain.setValueAtTime(0, audioContext.currentTime);
    bondGain.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 2);
    bondGain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 40);

    const conv = createFakeReverb(audioContext, 4.0);
    bondGain.connect(conv.input);
    conv.output.connect(masterGain);

    freqs.forEach(f => {
      const osc = audioContext.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      osc.connect(bondGain);
      osc.start();
      osc.stop(audioContext.currentTime + 40);
      bondOscillators.push(osc);
    });

    if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
      document.body.style.backgroundColor = '#fff';
      setTimeout(() => document.body.style.backgroundColor = '#000', 300);
    }
  }

  function createFakeReverb(ctx, decay) {
    const input = ctx.createGain();
    const output = ctx.createGain();
    const delays = [0.113, 0.127, 0.139, 0.151];
    delays.forEach(d => {
      const del = ctx.createDelay(0.2);
      const fb = ctx.createGain();
      del.delayTime.value = d;
      fb.gain.value = 0.6;
      input.connect(del);
      del.connect(fb);
      fb.connect(del);
      del.connect(output);
    });
    return { input, output };
  }

  function updateFilterByDistance(distance) {
    if (!lpf1) return;
    const norm = Math.min(1, distance / MAX_DISTANCE);
    const cutoff = BASE_LP_FREQ + (100 * (1 - norm));
    lpf1.frequency.value = cutoff;
    lpf2.frequency.value = cutoff;
  }

  let lastX = window.innerWidth / 2;
  let lastY = window.innerHeight / 2;

  function simulateMovement(e) {
    if (!isAudioReady) return;
    const x = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : lastX);
    const y = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : lastY);
    lastX = x;
    lastY = y;

    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const dx = x - centerX;
    const dy = y - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    updateFilterByDistance(distance);

    if (distance < 10 && !bondActive) {
      triggerBondTone();
      document.getElementById('screen').classList.add('hidden');
    }
  }

  document.getElementById('screen').addEventListener('pointerdown', () => {
    initAudio();
    document.getElementById('screen').classList.add('hidden');
    document.body.addEventListener('pointermove', simulateMovement);
    document.body.addEventListener('touchmove', simulateMovement, { passive: false });
  }, { once: true });
})();
