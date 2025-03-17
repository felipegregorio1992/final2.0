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

// Configuração do servidor Express
app.use(express.static(__dirname));

// Criação do servidor WebSocket
const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Servidor rodando em http://0.0.0.0:${port}`);
});
const wss = new WebSocket.Server({ server });

// Armazena as conexões WebSocket ativas
const clients = new Set();

// Gerenciamento de conexões WebSocket
wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('Cliente WebSocket conectado');

    ws.on('close', () => {
        clients.delete(ws);
        console.log('Cliente WebSocket desconectado');
    });
});

// Função para enviar mensagem para todos os clientes conectados
function broadcast(message) {
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

// Inicializa o cliente do WhatsApp com opções adicionais
const client = new Client({
    puppeteer: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-extensions',
            '--disable-default-apps',
            '--disable-sync',
            '--disable-background-networking',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-breakpad',
            '--disable-client-side-phishing-detection',
            '--disable-component-extensions-with-background-pages',
            '--disable-features=TranslateUI,BlinkGenPropertyTrees',
            '--disable-ipc-flooding-protection',
            '--disable-renderer-backgrounding',
            '--enable-features=NetworkService,NetworkServiceInProcess',
            '--force-color-profile=srgb',
            '--metrics-recording-only',
            '--mute-audio',
            '--headless=new'
        ],
        headless: "new",
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',
        timeout: 60000,
        protocolTimeout: 60000
    }
});

// Gera o QR Code para autenticação
client.on('qr', async (qr) => {
    console.log('QR Code gerado. Escaneie-o com seu WhatsApp:');
    
    try {
        // Gera o QR code como uma string de dados URL
        const qrDataURL = await qrcode.toDataURL(qr);
        
        // Envia o QR code para a página web
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
    const tempPath = path.join(__dirname, `temp_${Date.now()}${extension}`);
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
            const media = await message.downloadMedia();
            
            if (!media || !media.data) {
                throw new Error('Dados da mídia não encontrados');
            }

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
            
            // Lê o arquivo como base64
            const pdfBase64 = (await fs.readFile(tempFilePath)).toString('base64');

            // Cria o arquivo de mídia para enviar
            const pdfMedia = new MessageMedia(
                'application/pdf',
                pdfBase64,
                'documento.pdf'
            );

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