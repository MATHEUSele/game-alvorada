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

> A **Home** é a área segura onde o jogador inicia e passa boa parte do tempo entre explorações. Diferente de masmorras específicas, ela **não deve ser tão escura** — precisa ser clara, legível e convidativa.

- [ ] **Revisar iluminação e atmosfera da Home:** clarear o ambiente (luz diurna suave / entardecer claro ou céu aberto bem iluminado), reduzindo a neblina pesada e mantendo contraste nítido.
- [ ] **Definir o layout funcional da Home:**
  - [ ] Praça central de chegada / ponto de respawn
  - [ ] Espaço para **Ferreiro / Forja** (modificação e melhoria de armaduras e armas)
  - [ ] Espaço para **Mercador / Loja** (compra e venda de itens e equipamentos)
  - [ ] Espaço para **Baú / Armazenamento**
  - [ ] Portal / passagem bem sinalizada para as **Masmorras e Áreas de Exploração**
- [ ] **Refinar cenário e detalhes visuais da Home:** melhorar piso, vegetação/arquitetura e props para dar identidade própria à base.

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
