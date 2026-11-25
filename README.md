# Santuário Cinzento — ARPG Isométrico (Pré-Alfa)

Protótipo de um **Action RPG (ARPG)** isométrico 3D rodando direto no navegador, inspirado em *AnimA ARPG*, *Diablo* e na câmera/estética estilizada de *League of Legends*.

## Visão do Projeto

- **Gênero:** Action RPG (ARPG) isométrico 3D no navegador (WebGL via Three.js).
- **Câmera:** Isométrica próxima e detalhada, permitindo boa leitura do personagem e do cenário.
- **Controles:** Movimentação direta em `WASD` (estilo analógico em 8 direções alinhadas à câmera), corrida com `Shift` e ajuste de zoom com o `Scroll`.
- **Estrutura do Mundo:**
  - **Área Central (Hub Seguro):** ponto de encontro mais claro e legível onde o jogador poderá interagir com lojas, ferreiro e sistemas para comprar, equipar e aprimorar armaduras e armas.
  - **Masmorras / Áreas de Exploração Randômicas:** acessadas a partir da área central, com geração procedural, inimigos, itens aleatórios (loot) e atmosferas variadas — reservando o visual mais sombrio e escuro para masmorras específicas.

## O que já está funcionando (v0.2 — Pré-Alfa)

- [x] Estrutura base com **Vite + TypeScript + Three.js**.
- [x] Câmera isométrica próxima com follow suave e controle de zoom (`Scroll`).
- [x] Movimentação `WASD` (e setas) em 8 direções normalizadas relativas à tela + sprint (`Shift`).
- [x] Personagem 3D inicial com rotação suave, anel de base e animação procedural de parada/caminhada/corrida.
- [x] **Home — Salão Circular Real (*Salão Real da Alvorada*):** piso de cerâmica branca desenhada (azul-real e dourado), paredes curvas com balaustrada frontal baixa, janelões de vitral com feixes diagonais de luz do sol, poeira dourada e 3 portas monumentais estilizadas (Portal das Masmorras, Forja e Loja Real), além de bigorna e baú preparados.
- [x] Sistema de colisão circular e com deslizamento suave (*wall-sliding*) contra obstáculos e limites do salão.
- [x] HUD claro com indicador direcional `WASD` e alerta contextual ao se aproximar das portas e estações da Home.
- [x] **Modo PC + Celular (via QR Code):** servidor local gera QR Code automático no terminal e no botão `Jogar no Celular` para abrir direto no smartphone com **analógico 360°** e **botão de correr** multi-touch.

## Como Rodar Localmente

```bash
# Instalar dependências
npm install

# Rodar em modo desenvolvimento (PC + rede local para celular)
npm run dev

# Verificar tipos e gerar build de produção
npm run build
```

Depois de iniciar com `npm run dev`:
- **No PC:** abra `http://localhost:5173/` no navegador (`WASD` + `Shift` + `Scroll`).
- **No Celular:** clique em **`Jogar no Celular`** no canto superior direito (ou escaneie o QR Code exibido no terminal) estando no mesmo Wi-Fi para entrar direto no jogo com analógico 360° e botão de correr.

## Estrutura de Pastas

```text
src/
├── camera/
│   └── IsometricCamera.ts   # Câmera isométrica próxima, follow suave e projeção tela->mundo
├── core/
│   ├── Game.ts              # Renderer, cena, loop principal e atualização do HUD
│   └── Input.ts             # Teclado (WASD/Shift) e zoom (Scroll)
├── entities/
│   └── Player.ts            # Personagem jogável, movimentação e animações procedurais
├── world/
│   ├── Collision.ts         # Colisão círculo-vs-círculo e círculo-vs-AABB (wall-sliding)
│   ├── HubMap.ts            # Cenário da área central (Santuário Cinzento)
│   └── ProceduralTextures.ts # Texturas procedurais via Canvas
├── main.ts                  # Ponto de entrada
└── style.css                # Estilos e HUD
```

## Próximos Passos (Roadmap)

### 1. Refinamento Visual e Personagem (Prioridade Imediata)
- [x] **Clarear e Revitalizar a Área Central (Home):** Salão Circular Real claro com cerâmica branca desenhada, janelões de vidro e luz solar lateral.
- [ ] **Redesign do Personagem (Estética estilo LoL / Cyberpunk 2077):** substituir a geometria "quadradona"/blocada atual por um modelo estilizado mais orgânico e detalhado.
- [ ] **Contraste de Atmosfera por Bioma:** manter a Home clara e reservar iluminação mais sombria apenas para masmorras e catacumbas específicas.

### 2. Expansão da Área Central (Hub)
- [ ] **NPCs e Bancadas no Hub:** adicionar espaços dedicados na praça central para comércio e progressão (ferreiro/forja, mercador de armaduras e armas, baú de armazenamento).
- [ ] **Sistema de Compra e Modificação de Armaduras:** permitir comprar equipamentos, melhorar peças existentes e refletir mudanças nos atributos e visual do personagem.

### 3. Combate, Masmorras Randômicas e Loot
- [ ] **Combate ARPG e Esquiva:** ataque básico, habilidades com tempo de recarga, dash/esquiva e inimigos com IA simples.
- [ ] **Entrada das Catacumbas Funcional:** interagir com o portal ao norte para descer em masmorras geradas de forma randômica e retornar ao hub.
- [ ] **Atributos, Inventário e Loot Aleatório:** drops procedurais com raridades e bônus de status (dano, defesa, vida, velocidade, etc.).
