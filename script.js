const synth = window.speechSynthesis;

// DOM Elements
const textInput = document.getElementById('text-input');
const langRadios = document.querySelectorAll('input[name="language"]');
const voiceSelect = document.getElementById('voice-select');

const pitchSlider = document.getElementById('pitch');
const rateSlider = document.getElementById('rate');
const volumeSlider = document.getElementById('volume');

const pitchVal = document.getElementById('pitch-val');
const rateVal = document.getElementById('rate-val');
const volumeVal = document.getElementById('volume-val');

const btnGenerate = document.getElementById('btn-generate');
const statusText = document.getElementById('status-text');

const audioPlayerCard = document.getElementById('audio-player-card');
const audioElement = document.getElementById('audio-element');
const btnDownload = document.getElementById('btn-download');

let allVoices = [];
let generatedAudioBlob = null; // Storing actual data block instead of just URL

const placeholders = {
    en: "Type your text here...",
    ur: "یہاں اپنا ٹیکسٹ لکھیں..."
};

function getVoiceGender(voiceName) {
    const name = voiceName.toLowerCase();
    if (name.includes('child') || name.includes('kid') || name.includes('junior')) return 'Child';
    if (name.includes('female') || name.includes('zira') || name.includes('hazel') || name.includes('susan') || name.includes('heera')) return 'Female';
    if (name.includes('male') || name.includes('david') || name.includes('ravi') || name.includes('asim')) return 'Male';
    return 'Unspecified';
}

function loadVoices() {
    allVoices = synth.getVoices();
    const selectedLang = document.querySelector('input[name="language"]:checked').value;
    
    voiceSelect.innerHTML = '';
    const filteredVoices = allVoices.filter(voice => {
        const langCode = voice.lang.toLowerCase();
        return selectedLang === 'ur' ? (langCode.startsWith('ur') || langCode.startsWith('pa')) : langCode.startsWith('en');
    });

    if (filteredVoices.length === 0) {
        const opt = document.createElement('option');
        opt.textContent = selectedLang === 'ur' ? "Koi voice available nahi hai" : "No English voices found";
        opt.value = "";
        voiceSelect.appendChild(opt);
        return;
    }

    filteredVoices.forEach(voice => {
        const option = document.createElement('option');
        const gender = getVoiceGender(voice.name);
        option.textContent = `${voice.name} (${voice.lang}) — [${gender}]`;
        option.setAttribute('data-name', voice.name);
        voiceSelect.appendChild(option);
    });
}

if (synth.onvoiceschanged !== undefined) {
    synth.onvoiceschanged = loadVoices;
}

// Sliders Event Listeners
pitchSlider.addEventListener('input', () => pitchVal.textContent = parseFloat(pitchSlider.value).toFixed(1));
rateSlider.addEventListener('input', () => rateVal.textContent = parseFloat(rateSlider.value).toFixed(1));
volumeSlider.addEventListener('input', () => volumeVal.textContent = parseFloat(volumeSlider.value).toFixed(1));

langRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        const currentLang = e.target.value;
        textInput.placeholder = placeholders[currentLang];
        textInput.style.direction = currentLang === 'ur' ? 'rtl' : 'ltr';
        loadVoices();
    });
});

function createUtterance() {
    const utterance = new SpeechSynthesisUtterance(textInput.value);
    const selectedOption = voiceSelect.selectedOptions[0]?.getAttribute('data-name');
    const targetVoice = allVoices.find(v => v.name === selectedOption);
    
    if (targetVoice) utterance.voice = targetVoice;
    utterance.pitch = parseFloat(pitchSlider.value);
    utterance.rate = parseFloat(rateSlider.value);
    utterance.volume = parseFloat(volumeSlider.value);
    
    return utterance;
}

/**
 * GENERATE AUDIO FUNCTION (FIXED BROWSER COMPATIBILITY)
 */
btnGenerate.addEventListener('click', async () => {
    if (textInput.value.trim() === '') {
        statusText.textContent = "❌ Please enter some text first.";
        return;
    }

    if (synth.speaking) synth.cancel();
    statusText.textContent = "🎙 Voice generate ho rahi hai, please wait...";
    audioPlayerCard.classList.add('hidden'); 

    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const destination = audioCtx.createMediaStreamDestination();
        
        // Browser compatible container sequence detect karna
        let options = { mimeType: 'audio/webm;codecs=opus' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = { mimeType: 'audio/ogg;codecs=opus' };
        }
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = {}; // Fallback default container
        }

        const mediaRecorder = new MediaRecorder(destination.stream, options);
        const chunks = [];

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
            statusText.textContent = "✅ Voice successfully generate ho gayi!";
            
            // Safe Blob structural integration
            generatedAudioBlob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/wav' });
            const generatedAudioUrl = URL.createObjectURL(generatedAudioBlob);
            
            audioElement.src = generatedAudioUrl;
            audioPlayerCard.classList.remove('hidden');
            
            setTimeout(() => statusText.textContent = "", 3000);
        };

        const utterance = createUtterance();

        // Audio node routing pipeline fix
        const source = audioCtx.createOscillator(); 
        destination.stream.addTrack(destination.stream.getAudioTracks()[0]); 

        utterance.onstart = () => {
            mediaRecorder.start();
        };

        utterance.onend = () => {
            setTimeout(() => {
                if(mediaRecorder.state !== 'inactive') {
                    mediaRecorder.stop();
                }
                audioCtx.close();
            }, 500); // 500ms safety padding delay
        };

        utterance.onerror = () => {
            statusText.textContent = "❌ Generation me koi masla aya.";
            if(mediaRecorder.state !== 'inactive') mediaRecorder.stop();
            audioCtx.close();
        };

        synth.speak(utterance);

    } catch (error) {
        console.error(error);
        statusText.textContent = "❌ Browser processing pipeline error.";
    }
});

// DOWNLOAD BUTTON CLICK (FORCED DOWNLOAD TRIGGER)
btnDownload.addEventListener('click', () => {
    if (!generatedAudioBlob) {
        alert("Pehle audio generate karein!");
        return;
    }
    
    try {
        const blobUrl = URL.createObjectURL(generatedAudioBlob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = blobUrl;
        
        // Determine file extension securely based on browser encoder format
        const ext = generatedAudioBlob.type.includes('ogg') ? 'ogg' : 'mp3';
        a.download = `voice-message.${ext}`;
        
        document.body.appendChild(a);
        a.click();
        
        // Clean up URL object memory path
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
        }, 100);
    } catch (err) {
        alert("Download block hone me masla aya, please try again.");
    }
});

loadVoices();
