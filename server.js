const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve file statis dari folder public
app.use(express.static(path.join(__dirname, 'public')));

// Rute untuk halaman kasir (default)
app.get('/', (req, res) => {
    res.sendFile('index.html', { root: path.join(__dirname, 'public') });
});

// Rute untuk halaman pemindai
app.get('/scanner', (req, res) => {
    res.sendFile('scanner.html', { root: path.join(__dirname, 'public') });
});

// Penanganan WebSocket (Socket.io)
io.on('connection', (socket) => {
    console.log('Perangkat terhubung:', socket.id);

    // Menerima barcode dari scanner (HP)
    socket.on('scan_barcode', (data) => {
        console.log('Barcode diterima:', data.barcode);
        // Meneruskan barcode ke semua perangkat lain (Laptop/Kasir)
        io.emit('barcode_scanned', { barcode: data.barcode });
    });

    socket.on('disconnect', () => {
        console.log('Perangkat terputus:', socket.id);
    });
});

// Dapatkan alamat IP Lokal agar bisa diakses lewat HP
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

const PORT = 3000;
const IP_ADDRESS = getLocalIP();

server.listen(PORT, '0.0.0.0', () => {
    console.log(`===========================================`);
    console.log(`🚀 SERVER KASIR DUAL-DEVICE BERJALAN`);
    console.log(`===========================================`);
    console.log(`🖥️  Buka di Laptop (Kasir): http://localhost:${PORT}`);
    console.log(`📱 Buka di HP (Scanner)  : http://${IP_ADDRESS}:${PORT}/scanner`);
    console.log(`===========================================`);
});
