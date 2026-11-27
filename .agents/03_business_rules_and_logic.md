# Regras de Negócio e Lógica — Game Alvorada (Santuário Cinzento)

## 1. Casos de uso e fluxos
**Fluxos implementados (v0.2 / Fase 2.5):**
1. **Exploração da Home (*Salão Real da Alvorada*):** jogador inicia no centro `(0, 0, 0)` e se move livremente em 8 direções (teclado `WASD`/setas) ou 360° (analógico touch), com corrida (`Shift` ou botão `CORRER`) e zoom da câmera (`Scroll`).
2. **Feedback de proximidade:** ao se aproximar de uma `InteractionZone` (Portal das Masmorras, Forja ou Loja Real), o HUD exibe o alerta contextual correspondente (`#dungeon-prompt`).
3. **Acesso multiplataforma via QR Code:** no PC, o botão `Jogar no Celular` consulta `/__mobile-qr.json` e exibe o QR Code da rede local para abrir o jogo no smartphone com controles touch e opção de tela cheia/PWA.

**Fluxos planejados no backlog:**
- **Lore e narrativa:** definir universo, função da Home, origem das masmorras randômicas, protagonista e NPCs.
- **Comércio, Forja e Baú na Home:** interagir com Ferreiro, Mercador e Baú para comprar, armazenar, equipar e aprimorar armaduras e armas acopladas aos sockets reais do modelo `.glb`.
- **Combate ARPG e Masmorras Randômicas:** executar ataque básico e esquiva (`AttackCombo` / `Dodge`), enfrentar inimigos, entrar em masmorras geradas proceduralmente com bioma contrastante (mais sombrio), coletar loot com raridades e retornar à Home.

## 2. Validações e restrições
- **Delta time (`Game.ts`):** `dt` limitado ao intervalo `[0.001, 0.05]` segundos para evitar saltos físicos em quedas de frame.
- **Zoom da câmera (`Input.ts`):** `zoomTarget` restrito ao intervalo `[0.72, 1.45]`, com passo de `0.08` por evento `wheel`.
- **Normalização de movimento (`Input.ts`):** vetor de entrada `(x, y)` normalizado quando `x² + y² > 1` para evitar velocidade maior nas diagonais.
- **Limites espaciais e colisão (`HubMap.ts` / `Collision.ts`):** `player.radius = 0.45`, limite interno da rotunda `boundsRadius = 16.35` e resolução de colisões em `3` iterações por frame.
- **Performance multiplataforma (`Game.ts`):** `devicePixelRatio` limitado a `<= 1.5` em dispositivos touch e `<= 2` no desktop.

## 3. Fórmulas, algoritmos e máquinas de estado
- **Projeção tela → mundo (`IsometricCamera.screenInputToWorld`):** projeta a direção da câmera no plano `XZ` (`forwardXZ`), obtém `rightXZ = forwardXZ × WORLD_UP`, combina `rightXZ * inputX + forwardXZ * inputY` e multiplica pela magnitude limitada a `[0, 1]`.
- **Suavização de movimento e rotação (`Player.update`):**
  - Aceleração exponencial: `accelAlpha = 1 - Math.exp(-18 * dt)` interpolando `velocity` até `targetVelocity` (`walkSpeed = 5.8`, `sprintSpeed = 8.4`).
  - Rotação pelo menor ângulo (`normalizeAngleDiff`) com `rotAlpha = 1 - Math.exp(-15 * dt)` e inclinação lateral (`bankTarget`) limitada a `[-0.14, 0.14]` rad.
- **Máquina de estados / blend de animações (`Player.updateAnimations`):**
  - Estados locomotores contínuos (`Idle`, `Walk`, `Run`) em `LoopRepeat` com interpolação `blendAlpha = 1 - Math.exp(-12 * dt)`.
  - Abaixo de `speed <= 0.35`: alvo `Idle = 1`. Em caminhada: `Walk = clamp(speed / walkSpeed, 0.25, 1)` e `Idle = 1 - Walk`, com `timeScale` em `[0.75, 1.45]`. Em corrida (`isSprinting` ou `speed > walkSpeed * 1.12`): `Run = 1` com `timeScale` em `[0.85, 1.4]`.
  - Ações one-shot (`AttackCombo`, `Dodge`) via `triggerAction(...)` em `LoopOnce` (`clampWhenFinished = true`), reduzindo temporariamente o peso das ações base para `0.15` até o evento `finished`.
- **Colisão com deslizamento suave (`resolveCollisions`):** garante `dist <= boundsRadius - playerRadius`, empurra fora de cada `BoxCollider` usando o ponto mais próximo (tratando penetração total pelo menor eixo) e resolve cada `CircleCollider` somando `playerRadius + c.radius`.

## 4. Exceções e mensagens de erro de negócio
- **Canvas ausente (`src/main.ts`):** lança `Error('Canvas #game-canvas não encontrado.')` na inicialização caso o elemento `#game-canvas` não exista no DOM.
- **Falha ao carregar modelo 3D (`src/entities/Player.ts`):** erros no `GLTFLoader` registram `console.error('Erro ao carregar protagonista 3D (protagonist.glb):', err)` sem interromper o loop principal nem quebrar referências a `player.sockets`.
- **Indisponibilidade de QR Code (`src/core/MobileUi.ts`):** quando a busca em `/__mobile-qr.json` falha ou não há interfaces de rede detectadas, o modal informa erro/indisponibilidade amigavelmente sem bloquear o jogo.
