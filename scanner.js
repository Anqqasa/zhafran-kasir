// --- WebRTC PeerJS Setup ---
const statusFooter = document.getElementById('status-footer');

const peer = new Peer();
let hostConn = null;

peer.on('open', (id) => {
  statusFooter.textContent = '🟡 Mencari Kasir Utama...';
  statusFooter.style.color = 'orange';
  
  hostConn = peer.connect('zhafran-kasir-utama', { reliable: true });
  
  hostConn.on('open', () => {
    statusFooter.textContent = '🟢 Terhubung ke Kasir';
    statusFooter.style.color = 'var(--success-color)';
  });
  
  hostConn.on('close', () => {
    statusFooter.textContent = '🔴 Terputus dari Kasir';
    statusFooter.style.color = 'var(--danger-color)';
  });
});

peer.on('error', (err) => {
  console.error("PeerJS Error:", err);
  statusFooter.textContent = '🔴 Gagal Terhubung';
  statusFooter.style.color = 'var(--danger-color)';
});

let lastScannedBarcode = null;

// Send data helper
function sendToHost(data) {
  if (hostConn && hostConn.open) {
    hostConn.send(data);
  } else {
    alert("Belum terhubung ke layar kasir utama!");
  }
}

// --- AI Detection Logic ---
const modeRadios = document.getElementsByName('hp-mode');
const aiLoading = document.getElementById('ai-loading');
const aiCanvas = document.getElementById('hp-ai-canvas');
let currentMode = 'barcode';
let cocoModel = null;
let aiInterval = null;

modeRadios.forEach(radio => {
  radio.addEventListener('change', async (e) => {
    currentMode = e.target.value;
    const ctx = aiCanvas.getContext('2d');
    ctx.clearRect(0, 0, aiCanvas.width, aiCanvas.height);

    if (currentMode === 'ai') {
      if (!cocoModel) {
        aiLoading.style.display = 'flex';
        aiLoading.textContent = "Mendownload Otak AI (Tergantung Internet)...";
        cocoSsd.load().then(model => {
          cocoModel = model;
          aiLoading.style.display = 'none';
          if (currentMode === 'ai') startAIDetection();
        }).catch(err => {
          console.error(err);
          aiLoading.textContent = "Gagal memuat AI.";
          setTimeout(() => { aiLoading.style.display = 'none'; }, 2000);
        });
      } else {
        startAIDetection();
      }
    } else {
      stopAIDetection();
    }
  });
});

let lastAiDetectTime = 0;
const aiItemMap = {
  "bottle": "AI-BOTTLE", "apple": "AI-APPLE", "banana": "AI-BANANA", 
  "cup": "AI-CUP", "cell phone": "AI-PHONE", "mouse": "AI-MOUSE", "keyboard": "AI-KEYBOARD"
};

const idnTranslations = {
  "book": "Buku", "chair": "Kursi", "laptop": "Laptop", "tv": "Televisi",
  "remote": "Remot TV", "scissors": "Gunting", "clock": "Jam", "backpack": "Tas Ransel",
  "umbrella": "Payung", "handbag": "Tas Tangan", "tie": "Dasi", "suitcase": "Koper",
  "bottle": "Botol", "cup": "Gelas", "fork": "Garpu", "knife": "Pisau",
  "spoon": "Sendok", "bowl": "Mangkuk", "banana": "Pisang", "apple": "Apel",
  "sandwich": "Sandwich", "orange": "Jeruk", "broccoli": "Brokoli", "carrot": "Wortel",
  "hot dog": "Hot Dog", "pizza": "Pizza", "donut": "Donat", "cake": "Kue",
  "potted plant": "Tanaman Hias", "bed": "Kasur", "dining table": "Meja Makan",
  "toilet": "Toilet", "mouse": "Mouse", "keyboard": "Keyboard", "cell phone": "Handphone",
  "microwave": "Microwave", "oven": "Oven", "toaster": "Pemanggang Roti",
  "sink": "Wastafel", "refrigerator": "Kulkas", "vase": "Vas Bunga",
  "teddy bear": "Boneka Beruang", "hair drier": "Pengering Rambut", "toothbrush": "Sikat Gigi",
  "bicycle": "Sepeda", "car": "Mobil", "motorcycle": "Motor", "cat": "Kucing", "dog": "Anjing"
};

let isAiDetecting = false;

function startAIDetection() {
  const video = document.querySelector('#reader video');
  if (!video) {
    setTimeout(startAIDetection, 1000);
    return;
  }

  const ctx = aiCanvas.getContext('2d');
  isAiDetecting = true;
  
  async function detectFrame() {
    if (!isAiDetecting) return;
    if (html5QrCode && html5QrCode.getState() === Html5QrcodeScannerState.PAUSED) {
      requestAnimationFrame(detectFrame);
      return;
    }
    
    if (aiCanvas.width !== video.videoWidth) {
      aiCanvas.width = video.videoWidth;
      aiCanvas.height = video.videoHeight;
    }

    if (video.videoWidth > 0 && cocoModel) {
      const predictions = await cocoModel.detect(video);
      ctx.clearRect(0, 0, aiCanvas.width, aiCanvas.height);
      
      const centerX = video.videoWidth / 2;
      const centerY = video.videoHeight / 2;

      ctx.beginPath();
      ctx.rect(centerX - 100, centerY - 100, 200, 200);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.5)';
      ctx.stroke();

      predictions.forEach(prediction => {
        if (prediction.class === 'person') return;
        
        const [x, y, w, h] = prediction.bbox;
        const isTargeted = (centerX >= x && centerX <= x + w && centerY >= y && centerY <= y + h);

        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.lineWidth = 4;

        if (isTargeted) {
            ctx.strokeStyle = '#10b981';
            ctx.fillStyle = '#10b981';
        } else {
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
        }
        ctx.stroke();
        
        const itemNameIdn = idnTranslations[prediction.class] || prediction.class.toUpperCase();
        
        ctx.font = '24px Arial';
        ctx.fillText(`${itemNameIdn} (${Math.round(prediction.score * 100)}%)`, x, y > 20 ? y - 5 : 20);

        if (isTargeted && prediction.score > 0.65) {
          const now = Date.now();
          if (now - lastAiDetectTime > 3000) {
             const mappedId = aiItemMap[prediction.class] || `AI-${prediction.class.toUpperCase()}`;
             
             lastAiDetectTime = now;
             sendToHost({ barcode: mappedId });
             
             statusFooter.textContent = `✅ AI: ${itemNameIdn}`;
             statusFooter.style.color = 'var(--success-color)';
             if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

             html5QrCode.pause();
             setTimeout(() => {
               statusFooter.textContent = '⏳ Menunggu jeda...';
               statusFooter.style.color = 'orange';
             }, 1000);
             setTimeout(() => {
               html5QrCode.resume();
               statusFooter.textContent = '🟢 Siap Deteksi...';
               statusFooter.style.color = 'var(--success-color)';
             }, 3000);
          }
        }
      });
    }
    
    // Panggil frame berikutnya
    requestAnimationFrame(detectFrame);
  }
  
  detectFrame();
}

function stopAIDetection() {
  isAiDetecting = false;
  if (aiInterval) clearInterval(aiInterval);
  const ctx = aiCanvas.getContext('2d');
  ctx.clearRect(0, 0, aiCanvas.width, aiCanvas.height);
}

function onScanSuccess(decodedText, decodedResult) {
  if (currentMode !== 'barcode') return; // Abaikan jika mode AI

  if (html5QrCode && html5QrCode.getState() === Html5QrcodeScannerState.PAUSED) {
    return;
  }
  
  html5QrCode.pause();
  sendToHost({ barcode: decodedText });

  statusFooter.textContent = `✅ Scan: ${decodedText}`;
  statusFooter.style.color = 'var(--success-color)';

  if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
  }

  setTimeout(() => {
    statusFooter.textContent = '⏳ Menunggu jeda...';
    statusFooter.style.color = 'orange';
  }, 1000);

  setTimeout(() => {
    html5QrCode.resume();
    statusFooter.textContent = '🟢 Siap Scan Lagi...';
    statusFooter.style.color = 'var(--success-color)';
  }, 3000);
}

// Inisialisasi Scanner
const html5QrCode = new Html5Qrcode("reader");
const cameraSelect = document.getElementById('camera-select');

const config = { 
  fps: 30, 
  formatsToSupport: [ 
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.QR_CODE
  ]
};

function startCamera(cameraId) {
  if (html5QrCode.isScanning) {
    html5QrCode.stop().then(() => {
      html5QrCode.start(cameraId, config, onScanSuccess).catch(console.error);
    });
  } else {
    html5QrCode.start(cameraId, config, onScanSuccess).catch(console.error);
  }
}

Html5Qrcode.getCameras().then(devices => {
  if (devices && devices.length) {
    cameraSelect.innerHTML = '';
    
    // Filter kamera belakang jika ada banyak
    devices.forEach(device => {
      const option = document.createElement('option');
      option.value = device.id;
      // Beri nama yang jelas
      option.text = device.label || `Kamera ${cameraSelect.length + 1}`;
      cameraSelect.appendChild(option);
    });

    // Coba temukan kamera utama/bukan wide
    let defaultCamera = devices.find(d => d.label.toLowerCase().includes('back') && !d.label.toLowerCase().includes('wide'));
    if (!defaultCamera) defaultCamera = devices.find(d => d.label.toLowerCase().includes('back'));
    
    const selectedCameraId = defaultCamera ? defaultCamera.id : devices[devices.length - 1].id;
    cameraSelect.value = selectedCameraId;

    const hpReader = document.getElementById('reader');
    
    // Terapkan efek cermin HANYA jika bukan kamera belakang
    const isBackCamera = defaultCamera !== undefined || (devices[devices.length - 1].label && devices[devices.length - 1].label.toLowerCase().includes('back'));
    if (isBackCamera) {
      hpReader.classList.remove('mirror-camera');
    } else {
      hpReader.classList.add('mirror-camera');
    }

    startCamera(selectedCameraId);

    // Ubah kamera saat pengguna memilih dari dropdown
    cameraSelect.addEventListener('change', (e) => {
      const selectedOption = cameraSelect.options[cameraSelect.selectedIndex].text.toLowerCase();
      if (selectedOption.includes('back') || selectedOption.includes('belakang') || selectedOption.includes('environment')) {
        hpReader.classList.remove('mirror-camera');
      } else {
        hpReader.classList.add('mirror-camera');
      }
      startCamera(e.target.value);
    });

  } else {
    cameraSelect.innerHTML = '<option value="">Tidak ada kamera</option>';
  }
}).catch(err => {
  statusFooter.textContent = 'Gagal memuat daftar kamera';
  statusFooter.style.color = 'var(--danger-color)';
});
