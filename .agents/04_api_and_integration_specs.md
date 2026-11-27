# Especificações de API e Integrações — Game Alvorada (Santuário Cinzento)

## 1. Convenções de rotas
Não há API de backend de produção no escopo atual. Em ambiente de desenvolvimento (Vite), existem apenas:
- **Endpoint utilitário do dev server:** `GET /__mobile-qr.json` (servido pelo plugin `mobileQrPlugin` em `vite.config.ts`).
- **Assets estáticos públicos:** servidos a partir de `public/` respeitando `${import.meta.env.BASE_URL}` (ex.: `/models/protagonist.glb` e `/manifest.webmanifest`).

## 2. Contratos (request/response/status)
### `GET /__mobile-qr.json` (apenas `vite dev`)
- **Request:** sem parâmetros ou corpo.
- **Response (`200 OK`, `Content-Type: application/json`):**
```json
{
  "targets": [
    {
      "label": "Wi-Fi / Rede Local",
      "url": "http://192.168.x.x:5173/",
      "qrSvg": "<svg>...</svg>"
    }
  ]
}
```
- **Regras:** `targets` é ordenado por prioridade de interface IPv4 (`192.168.*` > `10.*` / `172.16-31.*` > outras interfaces > `100.*`).

### `GET /models/protagonist.glb`
- **Response (`200 OK`):** arquivo binário glTF 2.0 (~1,39 MB) contendo as 9 malhas modulares do protagonista, 15 texturas *hand-painted* embarcadas, armature `ProtagonistRig` (22 ossos) e 5 clipes de animação (`Idle`, `Walk`, `Run`, `AttackCombo`, `Dodge`).

## 3. Paginação e filtros
N/A — não há APIs de listagem, paginação ou filtros no escopo atual.

## 4. Workers/ingestão
N/A — não há background workers ou pipelines de ingestão no escopo atual.

## 5. Integrações, webhooks, filas e retentativas
- **Pipeline de arte 3D (ambiente de autoria local):** integração com **Blender 5.3.0** via servidor MCP `mcp-for-blender` (`localhost:9876`) para modelagem, rigging, animações NLA e exportação direta de `public/models/protagonist.glb` a partir de `assets-src/protagonist.blend`.
- **Webhooks, filas e retentativas em runtime:** N/A — aplicação inteiramente client-side sem serviços externos ou mensageria.
