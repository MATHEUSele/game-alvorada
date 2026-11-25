# Backlog & Guia de Planejamento

Este arquivo é o painel central de orientação do projeto. Conforme cada tarefa for concluída, basta marcar o checkbox (`[x]`) e seguir para o próximo passo.

---

## Concluído (Base / Pré-Alfa v0.1)

- [x] Setup inicial do projeto web 3D (Vite + TypeScript + Three.js)
- [x] Câmera isométrica próxima com follow suave e zoom via scroll
- [x] Movimentação `WASD` em 8 direções (estilo analógico) + corrida (`Shift`)
- [x] Colisão com deslizamento suave (*wall-sliding*)
- [x] Primeiro mapa jogável de teste + commit inicial organizado

- [x] **Suporte PC + Celular (Multiplataforma no mesmo servidor):**
  - [x] Geração automática de **QR Code** no terminal e na tela do PC (`Jogar no Celular`) apontando direto para o servidor local.
  - [x] **Analógico virtual 360°** proporcional no canto inferior esquerdo + **Botão de Correr** multi-touch no canto inferior direito.
  - [x] Botão de **Tela Cheia** e adaptação automática da interface para dispositivos touch.

---

## Fase 1 — Configurar a Home (Área Central / Hub)

> A **Home** é a área segura onde o jogador inicia e passa boa parte do tempo entre explorações. Diferente de masmorras específicas (que serão mais escuras), ela deve ter uma estética **clara, majestosa e bem iluminada**.
>
> **Referências Visuais:** Salão do **Rei Mago (*Black Clover*)** (grandioso, mármore/cerâmica branca, dourado, azul-real/safira, clima mágico claro) + iluminação solar lateral do **Castelo do Pico Alto (*Dead Cells*)**.

- [x] **Transformar o mapa em um Salão Circular (Rotunda):**
  - [x] Paredes curvas altas nas costas e laterais com colunas brancas e detalhes dourados.
  - [x] Borda/balaustrada frontal baixa para nunca obstruir a visão isométrica do personagem.
- [x] **Criar piso de cerâmica branca desenhada:**
  - [x] Textura procedural de cerâmica/mármore branco-marfim polido com anéis geométricos, bordas finas e rosácea/brasão arcano dourado e azul-real no centro.
- [x] **Janelões de vidro e iluminação solar lateral:**
  - [x] Janelas altas arqueadas de vidro/vitral nas laterais do salão.
  - [x] Feixes diagonais de luz do sol (raios volumétricos) atravessando o salão e projetando brilho no chão, com partículas finas de poeira dourada flutuando na luz.
  - [x] Iluminação geral clara, quente e legível (removendo o excesso de escuridão e neblina pesada da v0.1).
- [x] **Criar portas monumentais super estilizadas:**
  - [x] **Centro-Norte (Principal):** Grande Portal das Masmorras / Expedições (arco ornamentado branco e dourado, porta dupla trabalhada, estandartes e selo arcano luminoso).
  - [x] **Esquerda (Oeste):** Porta estilizada da **Forja / Armaduras** (futura área de modificação e melhoria de equipamentos).
  - [x] **Direita (Leste):** Porta estilizada da **Loja / Mercado Real** (futura área de compra e venda).
  - [x] Feedback discreto no HUD ao se aproximar de cada porta.
- [x] **Preparar espaços funcionais futuros na Home:**
  - [x] Áreas definidas para NPCs (ferreiro, mercador) e baú de armazenamento.
- [x] **Enriquecer o background / vista externa ao redor do Salão:**
  - [x] Jardim Real ensolarado ao redor do salão (gramado claro, espelho d'água com pontes, canteiros floridos, fontes baixas, árvores frondosas e floridas, torres da capital ao longe e pétalas flutuando na brisa).

---

## Fase 2 — Modelagem e Estética do Personagem

> Evoluir o boneco saindo do visual "quadradão"/blocado para uma estética humana mais bonita, detalhada e estilizada — combinando o porte atlético e silhueta carismática do **Sett (*League of Legends*)** com roupa inicial simples de sobrevivente/aventureiro estilo ***Last Day on Earth***.

- [x] **Definir direção visual final do personagem:** humano estilizado atlético com cabelo espetado jogado para trás, faixas de lutador nas mãos/antebraços, colete aberto simples, tira transversal de couro, cinto utilitário e botas.
- [x] **Construir modelo 3D orgânico e articulado:** substituir geometrias quadradas por formas esculpidas arredondadas com articulação em 2 juntas (ombros, cotovelos, quadris, joelhos, pelve e peitoral).
- [x] **Implementar novo modelo na cena:** substituir o personagem atual mantendo a responsividade do `WASD`/analógico 360° e animação natural de idle, caminhada e corrida.
- [x] **Preparar encaixes visuais (sockets):** `head`, `chest`, `back`, `rightHand` e `leftHand` prontos para equipar armas e peças de armadura no futuro.

---

## Fase 2.5 — Modelo 3D Real do Personagem (Blender via MCP + Mixamo) — 🔥 PRIORIDADE ATUAL

> Evoluir o protagonista do protótipo procedural para um **modelo 3D real (`.glb`)** com esqueleto e animações fluidas, buscando máxima fidelidade à estética e proporções heroicas do **Sett (*League of Legends*)** em fluxo **100% gratuito**.

- [x] **Instalar Blender e conectar via Blender MCP:** Blender 5.3.0 configurado localmente com o addon `MCP for Blender` v2.0 integrado ao Antigravity (`mcp-for-blender` ativo em `localhost:9876`) para criar, ajustar e exportar modelos 3D diretamente da conversa.
- [x] **Criar base estilizada do protagonista no Blender:** malha humana estilizada construída no Blender 5.3.0 (`assets-src/protagonist.blend`) com proporções heroicas estilo *Sett* (ombros largos em V, tronco atlético, rosto expressivo com olhos âmbar e cicatriz, mãos articuladas, cabelo volumoso em mechas), roupa inicial detalhada estilo *Last Day on Earth* e texturas *hand-painted* embarcadas.
- [x] **Rigging e Animações reais (`protagonist.glb`):** esqueleto humanoide de 22 ossos (`Hips`, `Spine`, `Spine1`, `Spine2`, `Neck`, `Head`, braços e pernas) com skinning limpo e 5 animações (`Idle`, `Walk`, `Run`, `AttackCombo`, `Dodge`) exportadas em `public/models/protagonist.glb` (~1.39 MB) para rodar a 60fps no PC e no celular.
- [x] **Integrar modelo `.glb` no jogo (`GLTFLoader` + `AnimationMixer`):** `Player.ts` atualizado carregando `public/models/protagonist.glb` com blend fluido entre `Idle`, `Walk` e `Run`, suporte a ações de combate/esquiva (`AttackCombo`/`Dodge`) e sockets presos aos ossos reais (`Head`, `Spine2`, `RightHand`, `LeftHand`).

---

## Fase 3 — História, Mundo e Lore *(para discutir em profundidade)*

> Espaço reservado para construirmos juntos a identidade narrativa do jogo.

- [ ] **Tema e universo do jogo:** definir se será fantasia pura, fantasia sombria moderada, ou alguma mistura original.
- [ ] **O que é a Home:** qual o nome oficial da área central, por que ela é segura e quem vive lá?
- [ ] **O que são as Masmorras / Áreas de Exploração:** por que o jogador desce/explora esses lugares e por que eles mudam (geração randômica)?
- [ ] **Protagonista e motivação:** quem é o personagem jogável e qual o objetivo principal da jornada?
- [ ] **NPCs principais da Home:** definir o ferreiro, mercador e possíveis guias/personagens com personalidade.

---

## Fase 4 — Combate, Masmorras Randômicas e Progressão (Futuro)

- [ ] **Combate básico e esquiva:** ataque principal, dash/esquiva, feedback visual e primeiros inimigos.
- [ ] **Masmorras Randômicas:** geração procedural de salas/corredores ao sair da Home, com atmosferas próprias (incluindo masmorras mais escuras e tensas).
- [ ] **Atributos e Loot Aleatório:** itens dropados com raridades e status que melhoram o personagem.
- [ ] **Lojas e Forja funcionais na Home:** comprar, equipar e aprimorar armaduras e armas usando recursos obtidos nas explorações.
