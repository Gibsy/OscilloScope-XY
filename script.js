const cnv = document.getElementById('XYscope');
const vc  = cnv.getContext('2d');
const ac  = new (window.AudioContext || window.webkitAudioContext)();
const aS  = ac.createChannelSplitter(2);
const aGO = ac.createGain();
aGO.gain.value = 0.1;
var aAnL = ac.createAnalyser(); aAnL.fftSize = 8192;
var aAnR = ac.createAnalyser(); aAnR.fftSize = 8192;
aS.connect(aAnL, 0);
aS.connect(aAnR, 1);
const aM = ac.createChannelMerger(2);
aS.connect(aM, 0, 0);
aS.connect(aM, 1, 1);
aM.connect(aGO);
aGO.connect(ac.destination);

var phosD      = false;
var phosDS     = 0.24;
var visualGain = 1.0;

var abNode    = null;  
var abBuffer  = null;  
var abStart   = 0;     
var abOffset  = 0;  
var abPlaying = false;

function setPlaybackVol(val) {
    playback_vol_text.innerText = val;
    aGO.gain.value = val;
}

function abPlay() {
    if (!abBuffer) return;
    if (abPlaying) abStop();
    abNode = ac.createBufferSource();
    abNode.buffer = abBuffer;
    abNode.loop = true;
    abNode.connect(aS);
    abStart = ac.currentTime;
    abNode.start(0, abOffset);
    abPlaying = true;
    play_btn.textContent = "⏸";
}

function abStop() {
    if (abNode) {
        abNode.onended = null;
        try { abNode.stop(); } catch(e) {}
        abNode.disconnect();
        abNode = null;
    }
    if (abPlaying) {
        abOffset = (ac.currentTime - abStart + abOffset) % abBuffer.duration;
    }
    abPlaying = false;
    play_btn.textContent = "▶";
}

function abCurrentTime() {
    if (!abBuffer) return 0;
    if (abPlaying) return (ac.currentTime - abStart + abOffset) % abBuffer.duration;
    return abOffset;
}

function formatTime(sec) {
    if (!sec || isNaN(sec)) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ":" + (s < 10 ? "0" + s : s);
}

setInterval(() => {
    if (!abBuffer) return;
    const ct = abCurrentTime();
    seek_bar.value = ct;
    time_label.textContent = `${formatTime(ct)} / ${formatTime(abBuffer.duration)}`;
}, 250);

const play_btn  = document.getElementById("play_btn");
const seekBar   = document.getElementById("seek_bar");
const timeLabel = document.getElementById("time_label");

play_btn.addEventListener("click", () => {
    if (abPlaying) abStop(); else abPlay();
});

seekBar.addEventListener("input", () => {
    const wasPlaying = abPlaying;
    if (abPlaying) abStop();
    abOffset = parseFloat(seekBar.value);
    if (wasPlaying) abPlay();
});

function startAudio() {
    ac.resume().then(() => {
        aGO.gain.value = parseFloat(playback_vol.value);
    });
    document.querySelector('.fullscreen_block').remove();
}

function updateTimeBase(val) {
    const size = Math.pow(2, parseInt(val));
    time_base_text.innerText = size;
    aAnL.fftSize = size;
    aAnR.fftSize = size;
}

function fileSel(e) {
    const file = e.files[0];
    if (!file) return;
    const wasPlaying = abPlaying;
    abStop();
    abBuffer = null;
    abOffset = 0;
    seek_bar.value = 0;
    seek_bar.max = 100;
    time_label.textContent = "0:00 / 0:00";
    play_btn.textContent = "▶";

    const reader = new FileReader();
    reader.onload = ev => {
        ac.decodeAudioData(ev.target.result.slice(0), buf => {
            abBuffer = buf;
            seek_bar.max = buf.duration;
            time_label.textContent = `0:00 / ${formatTime(buf.duration)}`;
            if (wasPlaying) abPlay();
        }, err => alert("Decode error: " + err));
    };
    reader.readAsArrayBuffer(file);
}

var aMi;
function getMic() {
    setPlaybackVol(0);
    playback_vol.value = 0;
    try { aMi.disconnect(); } catch {}
    navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation:false, autoGainControl:false, noiseSuppression:false, channelCount:2 }
    })
    .then(stream => { aMi = ac.createMediaStreamSource(stream); aMi.connect(aS); })
    .catch(err   => { alert(err); });
}

function selSource() {
    abStop();
    try { aMi.disconnect(); } catch {}
    file_control.style.display = "none";
    mic_control.style.display  = "none";
    switch (input_mode.value) {
        case "file": file_control.style.display = "inline-block"; break;
        case "mic":  mic_control.style.display  = "inline-block"; getMic(); break;
    }
}
selSource();

function swapLR(on) {
    aS.disconnect();
    if (on) { aS.connect(aAnL,1); aS.connect(aAnR,0); }
    else    { aS.connect(aAnL,0); aS.connect(aAnR,1); }
    aS.connect(aM, 0, 0);
    aS.connect(aM, 1, 1);
}

function mapfloat(x, in_min, in_max, out_min, out_max) {
    return (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
}

function resChange() {
    const m256 = scope_div.clientWidth - (scope_div.clientWidth % 256);
    cnv.width  = m256;
    cnv.height = m256;
}
resChange();
window.addEventListener('resize', resChange);

function drawBuf() {
    vc.fillStyle = phosD ? `rgba(0,0,0,${phosDS})` : 'black';
    vc.fillRect(0, 0, cnv.width, cnv.height);
    const bLen = Math.max(aAnL.frequencyBinCount, aAnR.frequencyBinCount);
    const datL = new Uint8Array(bLen);
    const datR = new Uint8Array(bLen);
    aAnL.getByteTimeDomainData(datL);
    aAnR.getByteTimeDomainData(datR);
    const center = 128;
    for (let i = 0; i < bLen; i++) {
        const scaledL = center + (datL[i] - center) * visualGain;
        const scaledR = center + (datR[i] - center) * visualGain;
        const x = mapfloat(scaledL, 0, 255, 0, cnv.width);
        const y = mapfloat(scaledR, 0, 255, cnv.height, 0);
        const grad = vc.createRadialGradient(x, y, 0, x, y, 2);
        grad.addColorStop(0, 'rgba(0,255,0,1)');
        grad.addColorStop(1, 'rgba(0,255,0,0)');
        vc.fillStyle = grad;
        vc.fillRect(x - 1, y - 1, 3, 3);
    }
    requestAnimationFrame(drawBuf);
}
drawBuf();
