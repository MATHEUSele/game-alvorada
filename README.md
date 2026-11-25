# Santuário Cinzento — ARPG Isométrico (Pré-Alfa)

Protótipo de um **Action RPG (ARPG)** isométrico 3D rodando direto no navegador, inspirado em *AnimA ARPG*, *Diablo* e na câmera/estética estilizada de *League of Legends*.

## Visão do Projeto

- **Gênero:** Action RPG (ARPG) isométrico 3D no navegador (WebGL via Three.js).
- **Câmera:** Isométrica próxima e detalhada, permitindo boa leitura do personagem e do cenário.
- **Controles:** Movimentação direta em `WASD` (estilo analógico em 8 direções alinhadas à câmera), corrida com `Shift` e ajuste de zoom com o `Scroll`.
- **Estrutura do Mundo:**
  - **Área Central (Hub Seguro):** ponto de encontro mais claro e legível onde o jogador poderá interagir com lojas, ferreiro e sistemas para comprar, equipar e aprimorar armaduras e armas.
  - **Masmorras / Áreas de Exploração Randômicas:** acessadas a partir da área central, com geração procedural, inimigos, itens aleatórios (loot) e atmosferas variadas — reservando o visual mais sombrio e escuro para masmorras específicas.

## O que já está funcionando (v0.1 — Pré-Alfa)

- [x] Estrutura base com **Vite + TypeScript + Three.js**.
- [x] Câmera isométrica próxima com follow suave e controle de zoom (`Scroll`).
- [x] Movimentação `WASD` (e setas) em 8 direções normalizadas relativas à tela + sprint (`Shift`).
- [x] Personagem 3D inicial com rotação suave, anel de base e animação procedural de parada/caminhada/corrida.
- [x] Mapa inicial da área central (*Santuário Cinzento*) com texturas procedurais, pilares, muretas, braseiros, partículas e entrada visual das Catacumbas.
- [x] Sistema de colisão com deslizamento suave (*wall-sliding*) contra obstáculos e limites do mapa.
- [x] HUD minimalista com indicador direcional `WASD` e alerta de proximidade da entrada da masmorra.

## Como Rodar Localmente

```bash
# Instalar dependências
npm install

# Rodar em modo desenvolvimento
npm run dev

# Verificar tipos e gerar build de produção
npm run build
```

Depois de iniciar com `npm run dev`, abra `http://localhost:5173/` no navegador.

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

### 1. Refinamento Visual e Iluminação (Prioridade Imediata)
- [ ] **Redesign do Personagem (Estética estilo LoL):** substituir a geometria "quadradona"/blocada atual por um modelo estilizado mais orgânico e detalhado (proporções estilizadas, silhueta marcante, armadura/arma mais refinadas — seja via geometria estilizada avançada ou modelos 3D `.glb` animados).
- [ ] **Clarear e Revitalizar a Área Central (Hub):** aumentar a luminosidade e a legibilidade geral do pátio central, saindo do clima excessivamente escuro atual para uma atmosfera de fantasia mais clara e convidativa.
- [ ] **Contraste de Atmosfera por Bioma:** manter a área central mais clara e reservar iluminação pesada/escura apenas para masmorras e catacumbas específicas.

### 2. Expansão da Área Central (Hub)
- [ ] **NPCs e Bancadas no Hub:** adicionar espaços dedicados na praça central para comércio e progressão (ferreiro/forja, mercador de armaduras e armas, baú de armazenamento).
- [ ] **Sistema de Compra e Modificação de Armaduras:** permitir comprar equipamentos, melhorar peças existentes e refletir mudanças nos atributos e visual do personagem.

### 3. Combate, Masmorras Randômicas e Loot
- [ ] **Combate ARPG e Esquiva:** ataque básico, habilidades com tempo de recarga, dash/esquiva e inimigos com IA simples.
- [ ] **Entrada das Catacumbas Funcional:** interagir com o portal ao norte para descer em masmorras geradas de forma randômica e retornar ao hub.
- [ ] **Atributos, Inventário e Loot Aleatório:** drops procedurais com raridades e bônus de status (dano, defesa, vida, velocidade, etc.).
