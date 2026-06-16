// --- WebRTC PeerJS Setup ---
const connStatus = document.getElementById('connection-status');
const connDot = document.getElementById('connection-dot');

let isHoldToScanActive = false;

const peer = new Peer('zhafran-kasir-utama');

// --- Database & State ---
const productDB = {
  "1234567890128": { name: "Indomie Goreng Spesial", price: 3500 },
  "8999999195674": { name: "Aqua Botol 600ml", price: 3000 },
  "8998009010041": { name: "Taro Snack Seaweed", price: 5000 },
  "8990381100224": { name: "Teh Pucuk Harum 350ml", price: 4000 }
};

let cart = {};

// --- Elements ---
const cartList = document.getElementById('cart-list');
const totalPriceEl = document.getElementById('total-price');
const btnPay = document.getElementById('btn-pay');

peer.on('open', (id) => {
  connStatus.textContent = "Sistem Utama Siap (WebRTC)";
  connDot.classList.add('connected');
});

peer.on('connection', (conn) => {
  conn.on('data', (data) => {
    if (data.barcode) {
      addToCart(data.barcode);
    }
    if (data.ocrText) {
      const text = data.ocrText.toLowerCase();
      let found = false;
      for (const [barcode, product] of Object.entries(productDB)) {
        const productNameWords = product.name.toLowerCase().split(' ');
        if (productNameWords.some(word => word.length > 3 && text.includes(word))) {
          addToCart(barcode);
          found = true;
          break;
        }
      }
      if (!found) {
        alert("Scanner membaca teks: " + data.ocrText.substring(0, 30) + "...\nTapi tidak ada nama barang yang cocok di sistem.");
      }
    }
  });
});

peer.on('disconnected', () => {
  connStatus.textContent = "Menyambung Ulang...";
  connDot.classList.remove('connected');
  // Coba reconnect secara otomatis
  setTimeout(() => {
    if (!peer.destroyed) peer.reconnect();
  }, 2000);
});

peer.on('error', (err) => {
  console.error("PeerJS Error:", err);
  if (err.type === 'unavailable-id') {
    connStatus.textContent = "Mode Mandiri (Utama Aktif di Tempat Lain)";
    connDot.style.backgroundColor = 'orange';
  } else {
    connStatus.textContent = "Sistem Offline";
    connDot.classList.remove('connected');
  }
});

// --- Logic ---
function formatRupiah(number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(number);
}

function updateCartUI() {
  cartList.innerHTML = '';
  const items = Object.values(cart);
  
  if (items.length === 0) {
    cartList.innerHTML = '<li class="empty-cart-message">Keranjang masih kosong. Silakan scan dari HP Anda...</li>';
    btnPay.disabled = true;
    totalPriceEl.textContent = formatRupiah(0);
    return;
  }

  let total = 0;
  btnPay.disabled = false;

  items.forEach(item => {
    const subtotal = item.price * item.qty;
    total += subtotal;

    const li = document.createElement('li');
    li.className = 'cart-item';
    li.innerHTML = `
      <div>
        <span class="item-name">${item.name}</span>
        <span class="item-price">${formatRupiah(item.price)}</span>
      </div>
      <span>x${item.qty}</span>
      <span>${formatRupiah(subtotal)}</span>
    `;
    cartList.appendChild(li);
  });

  totalPriceEl.textContent = formatRupiah(total);
  cartList.scrollTop = cartList.scrollHeight;
}

function addToCart(barcode) {
  const product = productDB[barcode];
  
  if (!product) {
    const randomPrice = Math.floor(Math.random() * 20 + 5) * 500; 
    productDB[barcode] = { name: `Produk Tdk Dikenal (${barcode.slice(-4)})`, price: randomPrice };
    return addToCart(barcode);
  }

  if (cart[barcode]) {
    cart[barcode].qty += 1;
  } else {
    cart[barcode] = { ...product, qty: 1 };
  }

  playBeep();
  updateCartUI();
}

btnPay.addEventListener('click', () => {
  if (Object.keys(cart).length === 0) return;
  alert("Pembayaran Berhasil!\nTerima kasih.");
  cart = {}; 
  updateCartUI();
});

// Sound Effect
function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000, ctx.currentTime);
    gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch(e) {}
}

updateCartUI();

// --- Local Laptop Scanner & AI Logic ---
const btnToggleScanner = document.getElementById('btn-toggle-scanner');
const laptopReader = document.getElementById('laptop-reader');
const laptopReaderContainer = document.getElementById('laptop-reader-container');
const aiLoading = document.getElementById('ai-loading');
const aiCanvas = document.getElementById('laptop-ai-canvas');
const modeRadios = document.getElementsByName('laptop-mode');

let localScanner = null;
let isLocalScannerRunning = false;
let currentMode = 'ai'; // 'barcode' or 'ai'

let cocoModel = null;
let aiInterval = null;

// AI Item Mapping
const aiItemMap = {
  "bottle": { id: "AI-BOTTLE", name: "Minuman Botol", price: 5000 },
  "apple": { id: "AI-APPLE", name: "Apel Segar", price: 3000 },
  "banana": { id: "AI-BANANA", name: "Pisang", price: 2000 },
  "cup": { id: "AI-CUP", name: "Gelas Minuman", price: 4000 },
  "cell phone": { id: "AI-PHONE", name: "HP / Smartphone", price: 5000000 },
  "mouse": { id: "AI-MOUSE", name: "Mouse Komputer", price: 75000 },
  "keyboard": { id: "AI-KEYBOARD", name: "Keyboard", price: 150000 }
};

let lastAiDetectTime = 0;

let isOcrRunning = false;

async function runBackgroundOCR() {
  if (currentMode !== 'ai' || !isAiDetecting || isOcrRunning || !isHoldToScanActive) return;
  const video = document.querySelector('#laptop-reader video');
  if (!video || video.videoWidth === 0) return;

  isOcrRunning = true;
  
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  try {
    const result = await Tesseract.recognize(canvas, 'ind');
    const text = result.data.text.toLowerCase();
    
    for (const [barcode, product] of Object.entries(productDB)) {
      const productNameWords = product.name.toLowerCase().split(' ');
      if (productNameWords.some(word => word.length > 3 && text.includes(word))) {
        const now = Date.now();
        if (now - lastAiDetectTime > 4000) {
           addToCart(barcode);
           lastAiDetectTime = now;
           break;
        }
      }
    }
  } catch (err) {
    // Abaikan error background
  }
  
  isOcrRunning = false;
}

// Jalankan OCR setiap 3 detik di latar belakang
setInterval(runBackgroundOCR, 3000);

modeRadios.forEach(radio => {
  radio.addEventListener('change', async (e) => {
    currentMode = e.target.value;
    const ctx = aiCanvas.getContext('2d');
    ctx.clearRect(0, 0, aiCanvas.width, aiCanvas.height);
    const targetBox = document.getElementById('laptop-targeting-box');

    if (currentMode === 'ai') {
      targetBox.style.display = 'block';
      if (!cocoModel) {
        aiLoading.style.display = 'flex';
        aiLoading.textContent = "Mendownload Otak AI (Tergantung Internet)...";
        cocoSsd.load().then(model => {
          cocoModel = model;
          aiLoading.style.display = 'none';
          if (isLocalScannerRunning && currentMode === 'ai') startAIDetection();
        }).catch(err => {
          console.error("Gagal memuat AI", err);
          aiLoading.textContent = "Gagal memuat AI. Pastikan internet stabil.";
        });
      } else {
        if (isLocalScannerRunning) startAIDetection();
      }
    } else {
      targetBox.style.display = 'none';
      stopAIDetection();
    }
  });
});

// Update Cart UI (Bisa Edit)
function updateCartUI() {
  const cartList = document.getElementById('cart-items');
  const totalPriceEl = document.getElementById('cart-total');
  const btnPay = document.getElementById('btn-pay');
  
  cartList.innerHTML = '';
  let total = 0;
  
  const itemKeys = Object.keys(cart);
  if (itemKeys.length === 0) {
    cartList.innerHTML = '<div class="empty-state">Keranjang kosong.</div>';
    btnPay.disabled = true;
    totalPriceEl.textContent = 'Rp 0';
    return;
  }
  
  btnPay.disabled = false;
  
  itemKeys.forEach(id => {
    const item = cart[id];
    const subtotal = item.price * item.qty;
    total += subtotal;
    
    const li = document.createElement('div');
    li.className = 'cart-item';
    li.innerHTML = `
      <div class="item-info">
        <h3>${item.name}</h3>
        <p>${item.qty} x Rp ${item.price.toLocaleString('id-ID')}</p>
      </div>
      <div class="item-actions">
        <span class="item-price">Rp ${subtotal.toLocaleString('id-ID')}</span>
        <button class="btn-icon edit" onclick="editCartItem('${id}')">✏️</button>
        <button class="btn-icon danger" onclick="removeFromCart('${id}')">🗑️</button>
      </div>
    `;
    cartList.appendChild(li);
  });
  
  totalPriceEl.textContent = `Rp ${total.toLocaleString('id-ID')}`;
}

// Fungsi Edit Barang menggunakan Modal
const editModal = document.getElementById('edit-modal');
const editItemName = document.getElementById('edit-item-name');
const editItemPrice = document.getElementById('edit-item-price');
const editItemId = document.getElementById('edit-item-id');
const btnCancelEdit = document.getElementById('btn-cancel-edit');
const btnSaveEdit = document.getElementById('btn-save-edit');

window.editCartItem = function(id) {
  const item = cart[id];
  editItemId.value = id;
  editItemName.value = item.name;
  editItemPrice.value = item.price;
  editModal.style.display = 'flex';
};

btnCancelEdit.addEventListener('click', () => {
  editModal.style.display = 'none';
});

btnSaveEdit.addEventListener('click', () => {
  const id = editItemId.value;
  if (cart[id]) {
    const newName = editItemName.value.trim();
    const newPrice = parseInt(editItemPrice.value);
    
    if (newName) cart[id].name = newName;
    if (!isNaN(newPrice)) cart[id].price = newPrice;
    
    updateCartUI();
  }
  editModal.style.display = 'none';
});

window.removeFromCart = function(id) {
  delete cart[id];
  updateCartUI();
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
  const video = document.querySelector('#laptop-reader video');
  if (!video) return;

  const ctx = aiCanvas.getContext('2d');
  isAiDetecting = true;
  
  async function detectFrame() {
    if (!isAiDetecting) return;
    if (!isHoldToScanActive) {
      ctx.clearRect(0, 0, aiCanvas.width, aiCanvas.height);
      requestAnimationFrame(detectFrame);
      return;
    }
    if (localScanner && localScanner.getState() === Html5QrcodeScannerState.PAUSED) {
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
             const mappedItem = aiItemMap[prediction.class] || { 
               id: `AI-${prediction.class.toUpperCase()}`, 
               name: itemNameIdn, 
               price: 0 
             };
             
             lastAiDetectTime = now;
             
             if (cart[mappedItem.id]) {
               cart[mappedItem.id].qty += 1;
             } else {
               cart[mappedItem.id] = { name: mappedItem.name, price: mappedItem.price, qty: 1 };
             }
             playBeep();
             updateCartUI();
             
             localScanner.pause();
             setTimeout(() => localScanner.resume(), 3000);
          }
        }
      });
    }
    
    // Panggil frame berikutnya secara mulus
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

const laptopCameraSelect = document.getElementById('laptop-camera-select');
// --- Setup Hold-to-Scan UI ---
const laptopContainer = document.getElementById('laptop-reader-container');
const laptopHoldOverlay = document.createElement('div');
laptopHoldOverlay.style.position = 'absolute';
laptopHoldOverlay.style.top = '0';
laptopHoldOverlay.style.left = '0';
laptopHoldOverlay.style.width = '100%';
laptopHoldOverlay.style.height = '100%';
laptopHoldOverlay.style.backgroundColor = 'rgba(0,0,0,0.6)';
laptopHoldOverlay.style.color = 'white';
laptopHoldOverlay.style.display = 'flex';
laptopHoldOverlay.style.flexDirection = 'column';
laptopHoldOverlay.style.alignItems = 'center';
laptopHoldOverlay.style.justifyContent = 'center';
laptopHoldOverlay.style.zIndex = '8'; // Di bawah loading AI tapi di atas canvas
laptopHoldOverlay.style.cursor = 'pointer';
laptopHoldOverlay.style.transition = 'opacity 0.2s';
laptopHoldOverlay.style.userSelect = 'none';
laptopHoldOverlay.style.webkitUserSelect = 'none';
laptopHoldOverlay.style.webkitTouchCallout = 'none';
laptopHoldOverlay.style.touchAction = 'none';
laptopHoldOverlay.innerHTML = `
  <div style="font-size: 40px; margin-bottom: 10px;">👆</div>
  <div style="font-weight: bold; letter-spacing: 1px;">Tahan Layar Untuk Scan</div>
`;
laptopContainer.appendChild(laptopHoldOverlay);

const startLaptopScan = (e) => {
  isHoldToScanActive = true;
  laptopHoldOverlay.style.opacity = '0';
};
const stopLaptopScan = (e) => {
  isHoldToScanActive = false;
  laptopHoldOverlay.style.opacity = '1';
};

laptopHoldOverlay.addEventListener('mousedown', startLaptopScan);
laptopHoldOverlay.addEventListener('touchstart', startLaptopScan, {passive: false});
window.addEventListener('mouseup', stopLaptopScan);
window.addEventListener('touchend', stopLaptopScan);
laptopHoldOverlay.addEventListener('contextmenu', (e) => e.preventDefault());

function startLocalCamera(cameraId) {
  if (!localScanner) {
    localScanner = new Html5Qrcode("laptop-reader");
  }

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

  const startFn = () => {
    localScanner.start(cameraId, config, (decodedText) => {
      if (currentMode !== 'barcode' || !isHoldToScanActive) return;
      if (localScanner.getState() === Html5QrcodeScannerState.PAUSED) return;
      
      localScanner.pause();
      addToCart(decodedText);
      
      setTimeout(() => {
        localScanner.resume();
      }, 3000);
    }).then(() => {
      if (currentMode === 'ai') startAIDetection();
    }).catch(err => {
      console.error("Camera start error:", err);
    });
  };

  if (localScanner.isScanning) {
    stopAIDetection();
    localScanner.stop().then(startFn);
  } else {
    startFn();
  }
}

btnToggleScanner.addEventListener('click', () => {
  if (!isLocalScannerRunning) {
    laptopReaderContainer.style.display = 'block';
    btnToggleScanner.textContent = 'Tutup Kamera Laptop';
    btnToggleScanner.style.backgroundColor = 'var(--danger-color)';
    
    Html5Qrcode.getCameras().then(devices => {
      if (devices && devices.length) {
        laptopCameraSelect.innerHTML = '';
        devices.forEach(device => {
          const option = document.createElement('option');
          option.value = device.id;
          option.text = device.label || `Kamera ${laptopCameraSelect.length + 1}`;
          laptopCameraSelect.appendChild(option);
        });

        let defaultCamera = devices.find(d => d.label.toLowerCase().includes('back') && !d.label.toLowerCase().includes('wide'));
        if (!defaultCamera) defaultCamera = devices.find(d => d.label.toLowerCase().includes('back'));
        
        const selectedCameraId = defaultCamera ? defaultCamera.id : devices[devices.length - 1].id;
        laptopCameraSelect.value = selectedCameraId;

        // Terapkan efek cermin HANYA jika bukan kamera belakang
        const isBackCamera = defaultCamera !== undefined || (devices[devices.length - 1].label && devices[devices.length - 1].label.toLowerCase().includes('back'));
        if (isBackCamera) {
          laptopReader.classList.remove('mirror-camera');
        } else {
          laptopReader.classList.add('mirror-camera');
        }

        startLocalCamera(selectedCameraId);

        laptopCameraSelect.addEventListener('change', (e) => {
          const selectedOption = laptopCameraSelect.options[laptopCameraSelect.selectedIndex].text.toLowerCase();
          if (selectedOption.includes('back') || selectedOption.includes('belakang') || selectedOption.includes('environment')) {
            laptopReader.classList.remove('mirror-camera');
          } else {
            laptopReader.classList.add('mirror-camera');
          }
          startLocalCamera(e.target.value);
        });
      }
    }).catch(err => {
      console.error(err);
    });
    
    isLocalScannerRunning = true;
  } else {
    stopAIDetection();
    if (localScanner) {
      localScanner.stop().then(() => {
        laptopReaderContainer.style.display = 'none';
        btnToggleScanner.textContent = '📷 Gunakan Kamera Laptop';
        btnToggleScanner.style.backgroundColor = 'var(--primary-color)';
        isLocalScannerRunning = false;
      });
    }
  }
});

window.addEventListener('load', () => {
  // Langsung nyalakan kamera tanpa menunggu AI
  setTimeout(() => {
    btnToggleScanner.click();
  }, 1000);

  // Muat AI secara background agar tidak membuat web freeze
  if (currentMode === 'ai') {
    const targetBox = document.getElementById('laptop-targeting-box');
    targetBox.style.display = 'block';
    
    if (!cocoModel) {
      aiLoading.style.display = 'flex';
      aiLoading.textContent = "Mendownload Otak AI (Tergantung Internet)...";
      
      cocoSsd.load().then(model => {
        cocoModel = model;
        aiLoading.style.display = 'none';
        if (isLocalScannerRunning) startAIDetection();
      }).catch(err => {
        console.error("Gagal memuat AI on load", err);
        aiLoading.textContent = "Gagal memuat AI. Pastikan internet stabil.";
      });
    }
  }
});
