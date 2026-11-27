# DevOps, CI/CD e Deployment — Game Alvorada (Santuário Cinzento)

## 1. Docker/compose
N/A — o projeto executa diretamente via Node.js + Vite em desenvolvimento e gera bundle estático em `dist/`, sem containers Docker no escopo atual.

## 2. Variáveis de ambiente (`.env.example`)
N/A — nenhuma variável de ambiente ou segredo é exigido pela aplicação no escopo atual. Apenas `import.meta.env.BASE_URL` nativo do Vite é utilizado para resolver caminhos de assets em `public/`.

## 3. CI/CD (testes, lint, build, deploy)
- **Checks configurados em `.agents/project.config.yml`:**
  - `build`: `npm run build` (executa `tsc --noEmit && vite build`).
  - `lint`: `""` (não configurado no momento).
  - `test`: `""` (não configurado no momento).
- **Pipeline de CI/CD automatizado:** N/A — ainda não há workflows em `.github/workflows/` ou deploy automatizado configurados no repositório.

## 4. Ambientes
- **Desenvolvimento local (`npm run dev`):** executa `vite --host` na porta padrão `5173`, expondo o jogo para o PC (`http://localhost:5173/`) e para dispositivos móveis na mesma rede Wi-Fi com QR Code automático no terminal e no HUD.
- **Pré-visualização (`npm run preview`):** executa `vite preview` para validar localmente o bundle gerado em `dist/`.
- **Produção (build estático):** saída gerada em `dist/` via `npm run build`, composta exclusivamente por HTML/CSS/JS estáticos e assets de `public/` (`models/protagonist.glb`, `manifest.webmanifest`).
