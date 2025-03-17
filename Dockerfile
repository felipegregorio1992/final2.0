FROM ubuntu:22.04

# Evita interações durante a instalação de pacotes
ENV DEBIAN_FRONTEND=noninteractive

# Instala as dependências necessárias
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    wget \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && echo "deb http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list \
    && apt-get update \
    && apt-get install -y \
    nodejs \
    google-chrome-stable \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-symbola \
    fonts-noto-color-emoji \
    fonts-freefont-ttf \
    libxss1 \
    xvfb \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Configura as variáveis de ambiente para o Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
ENV NODE_ENV=production

# Adiciona um usuário não-root
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/Downloads \
    && chown -R pptruser:pptruser /home/pptruser \
    && chown -R pptruser:pptruser /app

USER pptruser

WORKDIR /app

# Copia os arquivos de dependências
COPY package*.json ./

# Instala as dependências
RUN npm install

# Copia o resto dos arquivos
COPY --chown=pptruser:pptruser . .

# Expõe a porta que a aplicação usa
EXPOSE 3001

# Inicia a aplicação com Xvfb
CMD ["xvfb-run", "--server-args='-screen 0 1280x800x24'", "npm", "start"] 