# Arquitetura do Sistema — Game Alvorada (Santuário Cinzento)

## 1. Visão geral e componentes
Action RPG (ARPG) isométrico 3D client-side rodando diretamente no navegador via WebGL (Three.js), com suporte a PC e dispositivos móveis na mesma rede local.

Componentes principais:
- **Core (`src/core/`):**
  - `Game.ts`: inicializa `WebGLRenderer`, `THREE.Scene`, luzes/neblina, loop principal (`requestAnimationFrame`), resolução de colisões e atualização do HUD.
  - `Input.ts`: captura teclado (`WASD`/setas/`Shift`), roda do mouse (zoom) e combina com entrada touch.
  - `TouchControls.ts`: analógico virtual 360° e botão de corrida multi-touch para telas sensíveis ao toque.
  - `MobileUi.ts`: modal com QR Code para acesso mobile via Wi-Fi local, controle de tela cheia e suporte iOS/PWA.
- **Câmera (`src/camera/`):**
  - `IsometricCamera.ts`: câmera em perspectiva isométrica próxima com suavização exponencial, zoom dinâmico e projeção de entrada de tela para o plano `XZ`.
- **Entidades (`src/entities/`):**
  - `Player.ts`: protagonista 3D carregado via `GLTFLoader` (`public/models/protagonist.glb`), arma `Weapon_Dawnblade` presa ao osso `Weapon_R`, animação esquelética em camadas (`UpperBody` / `LowerBody` via `AnimationMixer`) permitindo ataques em movimento sem *foot-sliding* (`Idle`, `Walk`, `Run`, `Dodge`, `AttackSlash`, `AttackSlash2`, `AttackSlash3`, `SkillSpin`, `SkillThrust`, `SkillUlt`) e sockets presos a ossos reais (`head`, `chest`, `back`, `rightHand`, `leftHand`).
  - `SwordVfx.ts`: efeitos visuais 3D em Three.js com textura procedural de rastro crescente estilo LoL para o combo de 3 golpes do Corte Simples, ciclone circular 360°, feixe perfurante e onda de choque/pilar da Ultimate.
- **Mundo (`src/world/`):**
  - `HubMap.ts`: cenário da Home (*Salão Real da Alvorada*), portas monumentais (Portal das Masmorras acionável, Forja, Loja), partículas de poeira/pétalas, Jardim Real externo e zonas de interação (`InteractionZone`).
  - `DungeonMap.ts`: gerador procedural/randômico de masmorras em grade `48x48` (`generateDungeonLayout`) com 6–8 salas conectadas (`entrance`, `chamber`, `treasure`, `sanctum`), corredores de 2 células, paredes mescladas (greedy 2D) com recorte *cutaway* para visão isométrica, fundações subterrâneas, anfiteatro cavernoso "dentro da montanha" com névoa em paralaxe, pool dinâmico de 5 `PointLight`s de fogo seguindo o jogador, feixes de luz de fenda, props CC0, Portal de Retorno, Fenda Abissal para descer andares e renderização de minimapa em Canvas.
  - `DungeonAssets.ts`: biblioteca compartilhada de cache/normalização (`dungeonAssetLibrary`) para carregamento único e clonagem dos `.glb` CC0 1.0 de masmorra e montanha (`public/models/dungeon/`).
  - `Collision.ts`: resolução de colisão círculo-vs-círculo e círculo-vs-AABB com deslizamento suave (*wall-sliding*), limite circular e seleção da `InteractionZone` mais próxima (`findNearbyInteraction`).
  - `ProceduralTextures.ts`: geração procedural de texturas via HTML5 Canvas (`createHallTextures` claro e `createDungeonTextures` sombrio com lajes de ardósia, corredores e alvenaria).
- **Pipeline 3D e Build (`vite.config.ts`, `assets-src/`, `public/`):**
  - `assets-src/protagonist.blend`: arquivo fonte editável no Blender 5.3.0 (conectado via MCP `mcp-for-blender`).
  - `public/models/protagonist.glb`: asset 3D exportado pronto para WebGL.
  - `mobileQrPlugin` em `vite.config.ts`: expõe rota de desenvolvimento `/__mobile-qr.json` e imprime QR Code no terminal.

## 2. Stack e versões
- **Linguagem:** TypeScript (`^5.6.0`, target `ES2022`, `module: ESNext`, `strict: true`).
- **Engine 3D:** Three.js (`^0.170.0`, `@types/three ^0.170.0`).
- **Bundler / Dev Server:** Vite (`^6.0.0`) com plugin customizado `mobile-qr-plugin`.
- **Utilitário QR Code:** `qrcode` (`^1.5.4`, `@types/qrcode ^1.5.6`).
- **Modelagem 3D:** Blender `5.3.0` integrado localmente via `mcp-for-blender` (`localhost:9876`) exportando glTF 2.0 binário (`.glb`).
- **PWA / Mobile:** `public/manifest.webmanifest`, viewport `cover` e controles multi-touch nativos.

## 3. Estrutura de diretórios
```text
game-alvorada/
├── .agents/                    # Fonte da verdade (config, 5 docs, stacks, backlog, sessions)
├── assets-src/
│   └── protagonist.blend       # Fonte Blender do protagonista
├── planejamentos-e-instrucoes/
│   └── BACKLOG.md              # Guia histórico de fases do protótipo
├── public/
│   ├── manifest.webmanifest    # Manifesto PWA mobile
│   └── models/
│       ├── protagonist.glb     # Protagonista rigado e animado (23 ossos, 10 clipes)
│       ├── items/              # Itens, armaduras, armas, baús e poções CC0 (.glb)
│       └── characters/         # NPCs e inimigos iniciais CC0 (.glb)
├── src/
│   ├── camera/
│   │   └── IsometricCamera.ts
│   ├── core/
│   │   ├── Game.ts
│   │   ├── Input.ts
│   │   ├── MobileUi.ts
│   │   └── TouchControls.ts
│   ├── entities/
│   │   ├── Player.ts
│   │   └── SwordVfx.ts
│   ├── world/
│   │   ├── Collision.ts
│   │   ├── HubMap.ts
│   │   └── ProceduralTextures.ts
│   ├── main.ts
│   └── style.css
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 4. Padrões de projeto
- **Game Loop desacoplado:** `Game.ts` coordena leitura de input, projeção de câmera, atualização da entidade `Player`, resolução de colisão em `Collision.ts`, atualização do mapa e renderização.
- **Sockets baseados em ossos reais:** `Player.ts` cria grupos `THREE.Group` imediatamente na construção e os reparenta aos ossos (`Head`, `Spine2`, `RightHand`, `LeftHand`) após o carregamento assíncrono do `.glb`, evitando acoplamento direto de futuros itens à malha base.
- **Física e colisão 2.5D no plano XZ:** colisores estáticos (círculos e caixas AABB) mantidos em listas planas no mapa e resolvidos de forma iterativa sem motor de física pesado externo, mantendo 60 fps em desktop e celular.
- **Texturas procedurais + hand-painted embarcadas:** cenários usam Canvas 2D procedural (`ProceduralTextures.ts`) e personagens usam texturas *hand-painted* empacotadas no `.glb`.

## 5. Ciclo de vida da requisição
1. **Inicialização do cliente (`src/main.ts` → `Game.ts`):**
   - Localiza `#game-canvas`; instancia `WebGLRenderer`, `Scene`, `IsometricCamera`, `Input`, `HubMap` e `Player`.
   - `Player` inicia `GLTFLoader` assíncrono para `${import.meta.env.BASE_URL}models/protagonist.glb`, configura `AnimationMixer` e prende sockets aos ossos.
2. **Ciclo por frame (`Game.loop`):**
   - Calcula `dt` limitado a `[0.001, 0.05]` s.
   - Lê `Input.getMoveInput()` (teclado ou `TouchControls`).
   - Converte o vetor 2D de tela para o mundo `XZ` via `IsometricCamera.screenInputToWorld()`.
   - Atualiza posição, rotação, inclinação e blend de animações em `Player.update()`.
   - Corrige colisões via `resolveCollisions()` contra `circleColliders`, `boxColliders` e `boundsRadius`.
   - Atualiza `IsometricCamera.update()`, `HubMap.update()`, HUD (`updateHud`) e renderiza a cena.
3. **Requisição de desenvolvimento mobile (`GET /__mobile-qr.json`):**
   - `MobileUi.ts` requisita `/__mobile-qr.json` ao plugin Vite, que lê as interfaces IPv4 locais (`os.networkInterfaces()`) e retorna SVGs de QR Code para acesso direto pelo smartphone.

## 6. Autenticação/autorização
N/A — aplicação single-player client-side sem contas de usuário, autenticação ou controle de acesso no escopo atual.

## 7. Segurança e privacidade
- Nenhuma credencial, token ou dado pessoal é coletado, armazenado ou trafegado.
- O servidor `vite --host` em desenvolvimento expõe apenas os arquivos estáticos do jogo e IPs locais de rede em `/__mobile-qr.json` para pareamento local via Wi-Fi.
- Arquivos `.env`, `.env.local` e `.env.*.local` estão listados no `.gitignore` para evitar exposição acidental caso variáveis de ambiente sejam adicionadas futuramente.

## 8. Diretrizes de UX/UI
- **Contraste de atmosfera:** a Home (*Salão Real da Alvorada*) mantém estética clara, luminosa e legível (mármore/cerâmica branca, azul-real, dourado e luz solar lateral), reservando atmosfera mais sombria para futuras masmorras específicas.
- **Leitura isométrica:** câmera próxima (`FOV 36`, offset `(10.5, 13.0, 10.5)`), balaustrada frontal baixa no salão para não obstruir o personagem e anel discreto sob os pés com seta direcional frontal.
- **HUD e responsividade:** indicador direcional `WASD` + estado (`Parado`/`Andando`/`Correndo`), alerta contextual discreto ao aproximar de portas/estações, modal QR Code no canto superior direito e controles touch automáticos (analógico 360° à esquerda e botão `CORRER` à direita + botão `Tela Cheia`) em dispositivos móveis.
