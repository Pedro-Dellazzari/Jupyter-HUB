# Jupyter HUB

Um app desktop de produtividade com estética terminal e integração com IA, construído com Electron, React e Tailwind CSS.

## 🚀 Funcionalidades

- **AI Chat Assistant** - Comunicação por texto e voz com integração LLM
- **Gestão de Tarefas** - Sistema completo de to-dos com prioridades
- **Rastreador de Hábitos** - Acompanhamento de hábitos diários, semanais e mensais
- **Calendário** - Visualização e agendamento de eventos
- **Gerenciador de Reuniões** - Organização de reuniões virtuais e presenciais
- **Pomodoro Timer** - Timer integrado na sidebar para produtividade
- **Configurações de API** - Suporte para OpenAI, Anthropic, Google AI e APIs customizadas

## 🎨 Design

- Interface inspirada em terminal com design minimalista
- Estética Apple com cores suaves (slate, azul, roxo)
- Glassmorphism e backdrop blur
- Animações suaves e transições fluidas
- Tema escuro com gradientes vibrantes

## 📦 Instalação

### Pré-requisitos

- Node.js 18+ instalado
- npm ou pnpm

### Desenvolvimento

```bash
# Instalar dependências
npm install

# Executar em modo de desenvolvimento
npm run electron:dev
```

### Build para Windows

```bash
# Build completo (instalador + portable)
npm run electron:build:win

# Os arquivos serão gerados na pasta /release:
# - JupyterHUB-1.0.0-Setup.exe (instalador)
# - JupyterHUB-1.0.0-Portable.exe (versão portátil)
```

### Build para outras plataformas

```bash
# macOS
npm run electron:build:mac

# Linux
npm run electron:build:linux
```

## 🔧 Configuração da API

1. Abra o app e vá para **Settings**
2. Escolha seu provedor de IA:
   - **OpenAI** (GPT-4, GPT-3.5)
   - **Anthropic** (Claude 3)
   - **Google AI** (Gemini)
   - **Custom API** (endpoint customizado)
3. Insira sua API Key
4. Configure temperatura e max tokens
5. Teste a conexão
6. Salve as configurações

## 💾 Armazenamento de Dados

Todos os dados são armazenados localmente no seu computador:
- **API Keys**: Armazenadas em localStorage (nunca enviadas para servidores externos)
- **Tarefas, Hábitos, Eventos**: Persistidos em localStorage
- **Privacidade**: Seus dados nunca saem do seu dispositivo

## 🛠️ Tecnologias

- **Electron** - Framework para apps desktop
- **React** - UI library
- **TypeScript** - Tipagem estática
- **Tailwind CSS v4** - Estilização
- **React Router** - Navegação
- **Vite** - Build tool
- **Lucide Icons** - Ícones

## 📁 Estrutura do Projeto

```
productivity-hub/
├── electron/           # Arquivos do Electron
│   ├── main.js        # Processo principal
│   └── preload.js     # Script de preload
├── src/
│   ├── app/
│   │   ├── components/  # Componentes React
│   │   ├── App.tsx     # Componente principal
│   │   └── routes.tsx  # Configuração de rotas
│   └── styles/         # Estilos globais
├── public/             # Arquivos estáticos
└── package.json
```

## 🎯 Scripts Disponíveis

- `npm run dev` - Inicia o servidor de desenvolvimento Vite
- `npm run build` - Build da aplicação web
- `npm run electron` - Inicia o Electron
- `npm run electron:dev` - Desenvolvimento com hot reload
- `npm run electron:build:win` - Build para Windows
- `npm run electron:build:mac` - Build para macOS
- `npm run electron:build:linux` - Build para Linux

## 🔒 Segurança

- As API keys são armazenadas apenas localmente
- Não há coleta de dados ou telemetria
- Todas as comunicações com APIs são feitas diretamente do seu dispositivo
- Código-fonte aberto e auditável

## 📝 Notas

- O app suporta entrada de voz usando Web Speech API (disponível no Chrome/Edge)
- Requer conexão com internet para usar as funcionalidades de IA
- Os dados são persistidos mesmo após fechar o app

## 🤝 Contribuindo

Este é um projeto de código aberto. Sinta-se livre para fazer fork e contribuir!

## 📄 Licença

MIT License - sinta-se livre para usar em projetos pessoais ou comerciais.