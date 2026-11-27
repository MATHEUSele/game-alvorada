# Modelo de Dados e Persistência — Game Alvorada (Santuário Cinzento)

## 1. Entidades e relacionamentos
Atualmente todas as entidades vivem em memória no runtime client-side (TypeScript):

- **Player (`src/entities/Player.ts`):**
  - Estado espacial e cinemático: `group` (`THREE.Group`), `radius` (`0.45`), `velocity` (`Vector3`), `targetVelocity` (`Vector3`), `walkSpeed` (`5.8`), `sprintSpeed` (`8.4`), `isSprinting` (`boolean`), impulso direcional (`dashTimer`, `dashSpeed`, `dashDir`).
  - Estado de animação e combate: `mixer` (`THREE.AnimationMixer`), clipes cíclicos (`Idle`, `Walk`, `Run`), ações one-shot (`AttackSlash`, `AttackSlash2`, `AttackSlash3`, `SkillSpin`, `SkillThrust`, `SkillUlt`, `Dodge`), combo de 3 golpes no Corte Simples (`slashComboStep`, `slashComboWindow`), catálogo `SKILL_CONFIG` (`SwordSkillSlot = 'slash' | 'spin' | 'thrust' | 'ult'`) e `cooldowns` por slot.
  - **PlayerAttackHitbox (`src/entities/Player.ts`):** eventos de colisão ofensiva (`arc` / `circle`, `damage`, `knockback`) consumidos pelo mapa ativo.
  - **SkeletonEnemy (`src/entities/SkeletonEnemy.ts`):** inimigo esqueleto (`minion`, `rogue`, `warrior`, `champion`) com `hp`/`maxHp`, estados `'patrol' | 'chase' | 'attack' | 'dead'`, `AnimationMixer` e barra de vida 3D.
  - **SwordVfx (`src/entities/SwordVfx.ts`):** efeitos visuais 3D temporizados (`slash`, `spin`, `thrust`, `ult`) acoplados ao `bodyPivot` do jogador.
  - **PlayerEquipmentSockets:** relação 1:1 com grupos anexados aos ossos do esqueleto (`head` → `Head`, `chest` → `Spine2`, `back` → `Spine2`, `rightHand` → `RightHand`, `leftHand` → `LeftHand`).
- **MoveInput (`src/core/Input.ts`):** `{ x: number, y: number, sprint: boolean }`, unificando teclado e `TouchControls`.
- **Colisores e Interação (`src/world/Collision.ts`):**
  - `CircleCollider`: `{ x: number, z: number, radius: number }`.
  - `BoxCollider`: `{ minX: number, maxX: number, minZ: number, maxZ: number }`.
  - `InteractionAction`: `'enter-dungeon' | 'exit-dungeon' | 'next-dungeon-floor'`.
  - `InteractionZone` / `InteractionPrompt`: `{ x, z, radiusSq, label, action?, actionLabel? }`.
- **HubMap (`src/world/HubMap.ts`):**
  - `BannerEntry`: `{ mesh: THREE.Mesh, phase: number }`.
- **DungeonMap (`src/world/DungeonMap.ts`):**
  - `DungeonRoom`: `{ id, gx, gz, w, h, centerX, centerZ, connections, kind: 'entrance' | 'chamber' | 'treasure' | 'sanctum' }`.
  - `DungeonCorridor` e `MergedWallRect`: corredores de 2 células e paredes mescladas (*lowCutaway* `1.08m` vs *high* `3.6m`).
  - `DungeonLayout`: layout completo gerado por `generateDungeonLayout(seed)` com semente `mulberry32`, código `#XXXX` e `spawnYaw`.
- **NetworkTarget (`vite.config.ts` / `src/core/MobileUi.ts`):** `{ label: string, ip: string, priority: number }` no servidor e `{ label: string, url: string, qrSvg: string }` no payload JSON.
- **Entidades planejadas no backlog (a detalhar nas tarefas futuras):**
  - Atributos de personagem (vida, dano, defesa, velocidade), inventário e catálogo de equipamentos/loot com raridades.
  - NPCs e estações da Home (Ferreiro/Forja, Mercador/Loja, Baú de armazenamento).
  - Instâncias de masmorra procedural (salas, corredores, inimigos e drops).

## 2. DDL/schemas (tipos, PK, FK, restrições, índices)
N/A — o projeto é um jogo WebGL client-side em memória sem banco de dados relacional ou NoSQL no escopo atual; os contratos estruturais são interfaces e classes TypeScript em `src/`.

## 3. Estratégia de migrations
N/A — não há banco de dados persistente ou migrations no escopo atual. Caso persistência local (`localStorage` / `IndexedDB`) seja adotada no futuro para inventário/progresso, o versionamento de schema de save deverá ser definido antes da implementação.

## 4. Camada analítica (se aplicável)
N/A — não há camada analítica, warehouse ou telemetria definida no escopo atual.
