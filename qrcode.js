const { Client, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const WebSocket = require('ws');
const express = require('express');
const app = express();
const port = process.env.PORT || 3001;

// Cria diretório temporário se não existir
const tempDir = path.join(__dirname, 'temp');
fs.mkdir(tempDir, { recursive: true }).catch(console.error);

// Configuração do servidor Express
app.use(express.static(__dirname));

// Rota para verificar status
app.get('/status', (req, res) => {
    res.json({ status: 'online' });
});

// Criação do servidor WebSocket
const server = app.listen(port, '0.0.0.0', () => {
    console.log('=================================');
    console.log(`🚀 Servidor rodando na porta ${port}`);
    if (process.env.RAILWAY_STATIC_URL) {
        console.log(`📡 URL de acesso: ${process.env.RAILWAY_STATIC_URL}`);
    } else {
        console.log(`📡 URL de acesso local: http://localhost:${port}`);
    }
    console.log('=================================');
});

const wss = new WebSocket.Server({ server });

// Armazena as conexões WebSocket ativas
const clients = new Set();

// Função para enviar heartbeat para os clientes
function heartbeat() {
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.ping();
        }
    });
}

// Inicia o heartbeat a cada 30 segundos
setInterval(heartbeat, 30000);

// Gerenciamento de conexões WebSocket
wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('Cliente WebSocket conectado');

    // Configura ping/pong para manter a conexão viva
    ws.isAlive = true;
    ws.on('pong', () => {
        ws.isAlive = true;
    });

    // Envia o último QR code se disponível
    if (lastQrCode) {
        ws.send(JSON.stringify({
            type: 'qr',
            qr: lastQrCode,
            timestamp: Date.now()
        }));
    }

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'disconnect') {
                console.log('Cliente solicitou desconexão do WhatsApp');
                await client.destroy();
                lastQrCode = null;
                broadcast({ type: 'disconnected' });
            }
        } catch (error) {
            console.error('Erro ao processar mensagem do cliente:', error);
        }
    });

    ws.on('close', () => {
        clients.delete(ws);
        console.log('Cliente WebSocket desconectado');
    });

    ws.on('error', (error) => {
        console.error('Erro no WebSocket:', error);
        clients.delete(ws);
    });
});

// Verifica conexões mortas a cada 30 segundos
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            clients.delete(ws);
            return ws.terminate();
        }
        ws.isAlive = false;
    });
}, 30000);

// Limpa o intervalo quando o servidor é fechado
wss.on('close', () => {
    clearInterval(interval);
});

// Variável para armazenar o último QR code
let lastQrCode = null;

// Função para enviar mensagem para todos os clientes conectados
function broadcast(message) {
    const messageStr = JSON.stringify(message);
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(messageStr);
            } catch (error) {
                console.error('Erro ao enviar mensagem para cliente:', error);
                clients.delete(client);
            }
        }
    });
}

// Inicializa o cliente do WhatsApp
const client = new Client({
    puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--window-size=1280,720',
            '--user-data-dir=/app/.chrome-data',
            '--remote-debugging-port=9222',
            '--disable-extensions',
            '--disable-software-rasterizer',
            '--disable-notifications',
            '--disable-default-apps',
            '--disable-popup-blocking',
            '--disable-sync',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-site-isolation-trials'
        ],
        ignoreHTTPSErrors: true,
        defaultViewport: {
            width: 1280,
            height: 720
        },
        timeout: 120000,
        protocolTimeout: 120000,
        waitForTimeout: 120000,
        handleSIGINT: false,
        handleSIGTERM: false,
        handleSIGHUP: false
    },
    qrMaxRetries: 5,
    authTimeoutMs: 120000,
    takeoverOnConflict: true,
    takeoverTimeoutMs: 120000,
    qrQuality: 0.8,
    qrMargin: 4,
    puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--window-size=1280,720',
            '--user-data-dir=/app/.chrome-data',
            '--remote-debugging-port=9222',
            '--disable-extensions',
            '--disable-software-rasterizer',
            '--disable-notifications',
            '--disable-default-apps',
            '--disable-popup-blocking',
            '--disable-sync',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-site-isolation-trials'
        ],
        ignoreHTTPSErrors: true,
        defaultViewport: {
            width: 1280,
            height: 720
        },
        timeout: 120000,
        protocolTimeout: 120000,
        waitForTimeout: 120000,
        handleSIGINT: false,
        handleSIGTERM: false,
        handleSIGHUP: false
    }
});

// Modifica o evento qr para armazenar o último QR code
client.on('qr', async (qr) => {
    console.log('QR Code gerado. Escaneie-o com seu WhatsApp:');
    
    try {
        const qrDataURL = await qrcode.toDataURL(qr);
        lastQrCode = qrDataURL;
        
        broadcast({ 
            type: 'qr', 
            qr: qrDataURL,
            timestamp: Date.now()
        });
        console.log('QR Code enviado para a página web');
    } catch (error) {
        console.error('Erro ao gerar/enviar QR code:', error);
    }
});

// Quando o cliente estiver pronto
client.on('ready', () => {
    console.log('Cliente WhatsApp conectado!');
    broadcast({ type: 'ready' });
});

// Função para validar base64
function isValidBase64(str) {
    try {
        return Buffer.from(str, 'base64').toString('base64') === str;
    } catch (err) {
        return false;
    }
}

// Função para salvar arquivo temporário
async function saveTempFile(buffer, extension) {
    const tempPath = path.join(tempDir, `temp_${Date.now()}${extension}`);
    await fs.writeFile(tempPath, buffer);
    return tempPath;
}

// Função para converter imagem para PDF
async function convertImageToPDF(imageBuffer) {
    try {
        // Converte a imagem para PNG usando sharp
        const pngBuffer = await sharp(imageBuffer)
            .png()
            .toBuffer();

        // Cria um novo documento PDF
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([595, 842]); // Tamanho A4

        // Incorpora a imagem no PDF
        const pngImage = await pdfDoc.embedPng(pngBuffer);
        
        // Calcula as dimensões mantendo a proporção
        const pageWidth = page.getWidth();
        const pageHeight = page.getHeight();
        const imageWidth = pngImage.width;
        const imageHeight = pngImage.height;
        
        // Calcula a escala para ajustar a imagem na página
        const scale = Math.min(
            (pageWidth * 0.9) / imageWidth,
            (pageHeight * 0.9) / imageHeight
        );
        
        const width = imageWidth * scale;
        const height = imageHeight * scale;

        // Desenha a imagem na página centralizada
        page.drawImage(pngImage, {
            x: (pageWidth - width) / 2,
            y: (pageHeight - height) / 2,
            width,
            height,
        });

        // Salva o PDF como buffer
        return await pdfDoc.save();
    } catch (error) {
        console.error('Erro ao converter imagem para PDF:', error);
        throw error;
    }
}

// Função para limpar arquivos temporários
async function cleanupTempFile(filePath) {
    try {
        await fs.unlink(filePath);
    } catch (error) {
        console.error('Erro ao limpar arquivo temporário:', error);
    }
}

// Manipula as mensagens recebidas
client.on('message', async (message) => {
    let tempFilePath = null;
    
    try {
        // Verifica se a mensagem contém mídia e é uma imagem
        if (message.hasMedia) {
            console.log('Mensagem com mídia recebida');
            const media = await message.downloadMedia();
            
            if (!media || !media.data) {
                throw new Error('Dados da mídia não encontrados');
            }

            console.log('Tipo de mídia:', media.mimetype);

            if (!media.mimetype.startsWith('image/')) {
                await message.reply('Por favor, envie apenas imagens.');
                return;
            }

            await message.reply('Processando sua imagem... 🔄');

            // Converte o base64 da imagem em buffer
            const imageBuffer = Buffer.from(media.data, 'base64');
            
            console.log('Convertendo imagem para PDF...');
            
            // Converte a imagem para PDF
            const pdfBuffer = await convertImageToPDF(imageBuffer);
            
            // Salva o PDF temporariamente
            tempFilePath = await saveTempFile(pdfBuffer, '.pdf');
            console.log('PDF salvo em:', tempFilePath);
            
            // Lê o arquivo como base64
            const pdfBase64 = (await fs.readFile(tempFilePath)).toString('base64');

            // Cria o arquivo de mídia para enviar
            const pdfMedia = new MessageMedia(
                'application/pdf',
                pdfBase64,
                'documento.pdf'
            );

            console.log('Enviando PDF de volta...');
            // Envia o PDF de volta para o usuário
            await message.reply(pdfMedia);
            await message.reply('Aqui está seu PDF! 📄');
        }
    } catch (error) {
        console.error('Erro ao processar mensagem:', error);
        await message.reply('Desculpe, ocorreu um erro ao processar sua imagem. Por favor, tente enviar novamente.');
    } finally {
        // Limpa o arquivo temporário se ele existir
        if (tempFilePath) {
            await cleanupTempFile(tempFilePath);
        }
    }
});

// Inicia o cliente do WhatsApp
client.initialize().catch(err => {
    console.error('Erro ao inicializar cliente do WhatsApp:', err);
}); 