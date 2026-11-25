# Backlog & Guia de Planejamento

Este arquivo é o painel central de orientação do projeto. Conforme cada tarefa for concluída, basta marcar o checkbox (`[x]`) e seguir para o próximo passo.

---

## Concluído (Base / Pré-Alfa v0.1)

- [x] Setup inicial do projeto web 3D (Vite + TypeScript + Three.js)
- [x] Câmera isométrica próxima com follow suave e zoom via scroll
- [x] Movimentação `WASD` em 8 direções (estilo analógico) + corrida (`Shift`)
- [x] Colisão com deslizamento suave (*wall-sliding*)
- [x] Primeiro mapa jogável de teste + commit inicial organizado

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
- [ ] **Enriquecer o background / vista externa ao redor do Salão:**
  - [ ] Melhorar o horizonte e o cenário do lado de fora da balaustrada e dos janelões (céu detalhado, nuvens, montanhas/torres ou vista da capital real ao longe) para dar a impressão de um lugar ainda mais bonito e vivo.

---

## Fase 2 — Modelagem e Estética do Personagem

> Evoluir o boneco saindo do visual "quadradão"/blocado para uma estética mais bonita, detalhada e estilizada — tendo como referências de direção visual **League of Legends** (leitura clara em câmera isométrica) e **Cyberpunk 2077** (acabamento, silhueta e presença marcante, adaptado à nossa paleta).

- [ ] **Definir direção visual final do personagem:** proporções, silhueta, estilo de armadura/roupa e paleta de cores (mais visível e destacada do cenário).
- [ ] **Escolher pipeline 3D do personagem:** integrar modelo `.glb`/`.gltf` com esqueleto (*rig*) e animações (idle, andar, correr) ou construir malha estilizada de maior fidelidade.
- [ ] **Implementar novo modelo na cena:** substituir o personagem atual mantendo a responsividade do `WASD` e a rotação suave.
- [ ] **Preparar encaixes visuais (sockets):** deixar pronto para trocar armas e peças de armadura no futuro.

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
