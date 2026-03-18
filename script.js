/**
 * Smart Sign Language Speaker Pro - Advanced UI & Math Loop
 */

// --- DOM ELEMENTS ---
// Left
const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const videoContainer = document.getElementById('video-container');

const handStatusBadge = document.getElementById('hand-status');
const gestureNameBadge = document.getElementById('gesture-name');
const camOverlay = document.getElementById('cam-overlay');
const spokenOutputText = document.getElementById('spoken-output');
const fullscreenBtn = document.getElementById('fullscreen-btn');

// Right Controls
const startBtn = document.getElementById('start-btn');
const resetBtn = document.getElementById('reset-btn');
const soundBtn = document.getElementById('sound-btn');
const sensitivitySlider = document.getElementById('sensitivity-slider');
const sensVal = document.getElementById('sens-val');
const historyList = document.getElementById('history-list');

// Trainer
const trainNameInput = document.getElementById('train-name');
const trainSentenceInput = document.getElementById('train-sentence');
const captureBtn = document.getElementById('capture-btn');
const clearCustomBtn = document.getElementById('clear-custom-btn');
const trainerListDOM = document.getElementById('trainer-list');


// --- STATE ---
let isTracking = false;
let handsModel = null;
let currentLandmarks = null;
let camera = null;

let CONFIDENCE_THRESHOLD = 65;
let isMuted = false;
let gestureHistoryLogs = [];

const GESTURES = {
    peace: 'peace',
    thumbsUp: 'thumbsup',
    palm: 'palm',
    indexUp: 'indexup',
    pinch: 'pinch'
};

const TEXT_MAP = {
    [GESTURES.peace]:    { name: "Peace Sign", text: "I love you" },
    [GESTURES.thumbsUp]: { name: "Thumbs Up", text: "Approved" },
    [GESTURES.palm]:     { name: "Open Palm", text: "Hello Bro" },
    [GESTURES.indexUp]:  { name: "Index Finger", text: "I am Pritish" }
};


// --- MODULES ---

const SettingsManager = {
    init() {
        // Sensitivity
        sensitivitySlider.addEventListener('input', (e) => {
            CONFIDENCE_THRESHOLD = parseInt(e.target.value);
            sensVal.innerText = `${CONFIDENCE_THRESHOLD}%`;
        });

        // Sound Mute Toggle
        soundBtn.addEventListener('click', () => {
            isMuted = !isMuted;
            if (isMuted) {
                soundBtn.classList.remove('active');
                soundBtn.innerText = "🔇 Sound Off";
                if(window.speechSynthesis.speaking) window.speechSynthesis.cancel();
            } else {
                soundBtn.classList.add('active');
                soundBtn.innerText = "🔊 Sound On";
            }
        });

        // Fullscreen
        fullscreenBtn.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                videoContainer.requestFullscreen().catch(err => {
                    alert(`Error: ${err.message}`);
                });
            } else {
                document.exitFullscreen();
            }
        });

        // Reset
        resetBtn.addEventListener('click', () => {
            SpeechManager.resetSession();
            spokenOutputText.innerText = "Waiting for your sign...";
            spokenOutputText.classList.remove('pop');
            HistoryManager.clear();
            
            document.querySelectorAll('.gesture-card, .custom-list li').forEach(el => el.classList.remove('active'));
            gestureNameBadge.innerText = "Tracking...";
            
            if(isTracking && !currentLandmarks) {
                videoContainer.classList.remove('active-glow');
            }
        });
    }
};

const HistoryManager = {
    add(gestureName, spokenText) {
        const now = new Date();
        const timeStr = now.getHours().toString().padStart(2, '0') + ':' + 
                        now.getMinutes().toString().padStart(2, '0') + ':' + 
                        now.getSeconds().toString().padStart(2, '0');

        gestureHistoryLogs.unshift({ timeStr, gestureName, spokenText });
        if (gestureHistoryLogs.length > 5) gestureHistoryLogs.pop(); // Keep only last 5

        this.render();
    },
    
    clear() {
        gestureHistoryLogs = [];
        this.render();
    },

    render() {
        historyList.innerHTML = '';
        if (gestureHistoryLogs.length === 0) {
            historyList.innerHTML = '<li class="history-empty">No gestures logged yet.</li>';
            return;
        }

        gestureHistoryLogs.forEach(log => {
            const li = document.createElement('li');
            li.innerHTML = `<span class="time">[${log.timeStr}]</span> <span class="action">${log.gestureName} → "${log.spokenText}"</span>`;
            historyList.appendChild(li);
        });
    }
};

const SpeechManager = {
    synth: window.speechSynthesis,
    lastSpokenId: null,
    cooldownEnd: 0,
    
    speak(id, name, sentence) {
        const now = Date.now();

        if (this.lastSpokenId === id && now < this.cooldownEnd) {
            return; // Exact same intent within hold period
        }

        if (this.synth.speaking) this.synth.cancel();

        if (!isMuted) {
            const utterance = new SpeechSynthesisUtterance(sentence);
            this.synth.speak(utterance);
        }

        this.lastSpokenId = id;
        this.cooldownEnd = now + 4000; // 4 second hard block for same gesture continuous hold

        // UI DOM Update
        spokenOutputText.innerText = sentence;
        spokenOutputText.classList.remove('pop');
        void spokenOutputText.offsetWidth; // Trigger reflow
        spokenOutputText.classList.add('pop');

        HistoryManager.add(name, sentence);
        
        // Enhance camera glow
        videoContainer.classList.add('active-glow');
        setTimeout(() => videoContainer.classList.remove('active-glow'), 800);
    },

    resetSession() {
        this.lastSpokenId = null;
        this.cooldownEnd = 0;
    }
};

const TrainerManager = {
    customList: [],
    
    init() {
        this.load();
        captureBtn.addEventListener('click', () => this.capture());
        clearCustomBtn.addEventListener('click', () => {
            if(confirm("Clear custom gestures?")) {
                this.customList = [];
                this.save();
            }
        });
    },
    
    normalize(landmarks) {
        const wrist = landmarks[0];
        let refDist = Math.hypot(landmarks[9].x - wrist.x, landmarks[9].y - wrist.y);
        if (refDist === 0) refDist = 0.0001;
        
        return landmarks.map(lm => ({
            x: (lm.x - wrist.x) / refDist,
            y: (lm.y - wrist.y) / refDist
        }));
    },
    
    capture() {
        if (!currentLandmarks) return;
        const name = trainNameInput.value.trim();
        const sentence = trainSentenceInput.value.trim();
        if (!name || !sentence) return alert("Fill in Name and Sentence!");
        
        const norm = this.normalize(currentLandmarks);
        const newGest = { id: 'custom_' + Date.now(), name, sentence, landmarks: norm };
        
        this.customList.push(newGest);
        this.save();
        
        trainNameInput.value = ''; trainSentenceInput.value = '';
    },
    
    load() {
        try {
            const data = localStorage.getItem('hq_smart_gestures');
            if (data) this.customList = JSON.parse(data);
        } catch(e) {}
        this.render();
    },
    
    save() {
        localStorage.setItem('hq_smart_gestures', JSON.stringify(this.customList));
        this.render();
    },
    
    render() {
        trainerListDOM.innerHTML = '';
        if (this.customList.length === 0) {
            trainerListDOM.innerHTML = '<li style="color:var(--text-secondary);font-size:0.85rem;">No custom poses yet.</li>';
            return;
        }
        
        this.customList.forEach(g => {
            const li = document.createElement('li');
            li.id = 'card-' + g.id;
            li.innerHTML = `<span class="g-title">${g.name}</span><span class="g-text">"${g.sentence}"</span>`;
            trainerListDOM.appendChild(li);
        });
    },

    match(norm) {
        let best = null, maxConf = 0;
        
        for (const g of this.customList) {
            let error = 0;
            for(let i=0; i<norm.length; i++) {
                error += Math.hypot(norm[i].x - g.landmarks[i].x, norm[i].y - g.landmarks[i].y);
            }
            error /= norm.length;
            
            // Map error to confidence %
            let conf = 100 - (error * 80); 
            if (conf > maxConf) {
                maxConf = conf;
                best = g;
            }
        }
        if (best && maxConf >= CONFIDENCE_THRESHOLD) {
            return { id: best.id, name: best.name, text: best.sentence, confidence: maxConf };
        }
        return null;
    }
};

const GestureEngine = {
    fingerExtensionScore(lm, tip, pip) {
        const tipD = Math.hypot(lm[tip].x - lm[0].x, lm[tip].y - lm[0].y);
        const pipD = Math.hypot(lm[pip].x - lm[0].x, lm[pip].y - lm[0].y);
        const ratio = tipD / (pipD + 0.001);
        if (ratio < 0.9) return 0.0;
        if (ratio > 1.25) return 1.0;
        return (ratio - 0.9) / 0.35;
    },

    thumbExtensionScore(lm) {
        const thumbBaseD = Math.hypot(lm[2].x - lm[17].x, lm[2].y - lm[17].y);
        const thumbTipD = Math.hypot(lm[4].x - lm[17].x, lm[4].y - lm[17].y);
        const ratio = thumbTipD / (thumbBaseD + 0.001);
        if (ratio < 1.0) return 0.0;
        if (ratio > 1.5) return 1.0;
        return (ratio - 1.0) / 0.5;
    },

    getGestureConfidence(lm, gestureId) {
        const T = this.thumbExtensionScore(lm);
        const I = this.fingerExtensionScore(lm, 8, 6);
        const M = this.fingerExtensionScore(lm, 12, 10);
        const R = this.fingerExtensionScore(lm, 16, 14);
        const P = this.fingerExtensionScore(lm, 20, 18);

        let sScore = 0;

        switch (gestureId) {
            case GESTURES.palm:
                sScore = (T + I + M + R + P) / 5;
                break;
            case GESTURES.thumbsUp:
                sScore = (T + (1-I) + (1-M) + (1-R) + (1-P)) / 5;
                break;
            case GESTURES.indexUp:
                sScore = ((1-T) + I + (1-M) + (1-R) + (1-P)) / 5;
                break;
            case GESTURES.peace:
                // Peace implies: I and M up, others down, and specifically I and M apart
                const distIdxMid = Math.hypot(lm[8].x - lm[12].x, lm[8].y - lm[12].y);
                const refDist = Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y);
                const normDist = distIdxMid / refDist;
                
                let separation = 0;
                if (normDist > 0.15) separation = 1.0;
                else if (normDist > 0.05) separation = (normDist - 0.05) / 0.1;
                
                sScore = ((1-T) + I + M + (1-R) + (1-P) + separation) / 6;
                break;
        }

        return sScore * 100;
    },

    evaluate(landmarks) {
        // Priority 1: Custom Gestures
        const norm = TrainerManager.normalize(landmarks);
        const customMatch = TrainerManager.match(norm);
        if (customMatch) return customMatch;

        // Priority 2: Standard
        let bestBase = null;
        let maxBaseConf = 0;

        for (const [id, data] of Object.entries(TEXT_MAP)) {
            const conf = this.getGestureConfidence(landmarks, id);
            if (conf > maxBaseConf) {
                maxBaseConf = conf;
                bestBase = { id, name: data.name, text: data.text, confidence: conf };
            }
        }

        if (bestBase && maxBaseConf >= CONFIDENCE_THRESHOLD) {
            return bestBase;
        }
        
        return null;
    }
};


// --- CORE CAMERA LOOP ---

function highlightCard(gestureId) {
    document.querySelectorAll('.gesture-card, .custom-list li').forEach(el => el.classList.remove('active'));
    if (gestureId) {
        const card = document.getElementById('card-' + gestureId);
        if (card) card.classList.add('active');
    }
}

function updateFrameFeedback(result) {
    if (!result) {
        gestureNameBadge.innerText = "Tracking...";
        gestureNameBadge.className = "badge gray";
        highlightCard(null);
        return;
    }

    gestureNameBadge.innerText = `${result.name} (${Math.round(result.confidence)}%)`;
    gestureNameBadge.className = "badge green";
    highlightCard(result.id);
    SpeechManager.speak(result.id, result.name, result.text);
}

function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.translate(canvasElement.width, 0);
    canvasCtx.scale(-1, 1);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        currentLandmarks = results.multiHandLandmarks[0];
        
        handStatusBadge.innerHTML = '<span class="blinker"></span> Hand Detected';
        handStatusBadge.className = "badge green";
        captureBtn.disabled = false;

        // Draw connections
        drawConnectors(canvasCtx, currentLandmarks, HAND_CONNECTIONS, {color: 'rgba(59, 130, 246, 0.5)', lineWidth: 3});
        drawLandmarks(canvasCtx, currentLandmarks, {color: '#60a5fa', lineWidth: 1, radius: 3});

        const gestureParam = GestureEngine.evaluate(currentLandmarks);
        updateFrameFeedback(gestureParam);

    } else {
        currentLandmarks = null;
        captureBtn.disabled = true;
        
        handStatusBadge.innerHTML = '<span class="blinker"></span> No Hand';
        handStatusBadge.className = "badge red";
        
        SpeechManager.resetSession();
        updateFrameFeedback(null);
    }
    canvasCtx.restore();
}

// --- INIT ---

function init() {
    SettingsManager.init();
    TrainerManager.init();
    
    startBtn.addEventListener('click', () => {
        if (!handsModel) return;
        
        isTracking = true;
        startBtn.disabled = true;
        startBtn.innerText = "Camera Active";
        camOverlay.style.display = 'none';

        camera = new Camera(videoElement, {
            onFrame: async () => { await handsModel.send({image: videoElement}); },
            width: 1280, height: 720, facingMode: "user"
        });
        camera.start();
    });

    camOverlay.innerHTML = "<span>Loading ML Models...</span>";
    
    handsModel = new Hands({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});
    handsModel.setOptions({
        maxNumHands: 1,
        modelComplexity: 1, // Higher accuracy mapping
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7
    });
    handsModel.onResults(onResults);
    
    handsModel.initialize().then(() => {
        camOverlay.innerHTML = "<span>Ready. Click 'Start Camera'</span>";
    });
}

init();
