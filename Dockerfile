FROM ubuntu:22.04

# Evita interações durante a instalação de pacotes
ENV DEBIAN_FRONTEND=noninteractive

# Instala Node.js e outras dependências necessárias
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y \
    nodejs \
    chromium-browser \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    && rm -rf /var/lib/apt/lists/*

# Define a variável de ambiente para o Puppeteer usar o Chromium instalado
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Define o diretório de trabalho
WORKDIR /app

# Copia os arquivos do projeto
COPY package*.json ./

# Instala as dependências
RUN npm install

# Copia o resto dos arquivos
COPY . .

# Expõe a porta 3001
EXPOSE 3001

# Comando para iniciar a aplicação
CMD ["npm", "start"] 