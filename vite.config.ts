import os from 'node:os';
import QRCode from 'qrcode';
import { defineConfig, type Plugin } from 'vite';

interface NetworkTarget {
  label: string;
  ip: string;
  priority: number;
}

function getLocalNetworkTargets(): NetworkTarget[] {
  const nets = os.networkInterfaces();
  const targets: NetworkTarget[] = [];

  for (const [ifaceName, addrs] of Object.entries(nets)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family !== 'IPv4' || addr.internal) continue;

      let priority = 3;
      let label = `Rede (${ifaceName})`;

      if (addr.address.startsWith('192.168.')) {
        priority = 1;
        label = 'Wi-Fi / Rede Local';
      } else if (addr.address.startsWith('10.')) {
        priority = 2;
        label = 'Rede Local (10.x)';
      } else if (/^172\.(1[6-9]|2\d|3[01])\./.test(addr.address)) {
        priority = 2;
        label = 'Rede Local (172.x)';
      } else if (addr.address.startsWith('100.')) {
        priority = 4;
        label = 'VPN / Tailscale';
      }

      targets.push({ label, ip: addr.address, priority });
    }
  }

  return targets.sort((a, b) => a.priority - b.priority);
}

function mobileQrPlugin(): Plugin {
  let activePort = 5173;

  return {
    name: 'mobile-qr-plugin',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        const address = server.httpServer?.address();
        if (address && typeof address === 'object') {
          activePort = address.port;
        }

        const targets = getLocalNetworkTargets();
        const primary = targets[0];
        if (!primary) return;

        const url = `http://${primary.ip}:${activePort}/`;
        void QRCode.toString(url, { type: 'terminal', small: true }).then(
          (qrText) => {
            console.log('\n  📱 Escaneie no celular para jogar direto:');
            console.log(`  ➜  ${primary.label}: ${url}\n`);
            console.log(qrText);
          },
        );
      });

      server.middlewares.use('/__mobile-qr.json', async (_req, res) => {
        const targets = getLocalNetworkTargets();
        const payload = await Promise.all(
          targets.map(async (t) => {
            const url = `http://${t.ip}:${activePort}/`;
            const qrSvg = await QRCode.toString(url, {
              type: 'svg',
              margin: 1,
              color: {
                dark: '#14233f',
                light: '#f7f4ec',
              },
            });
            return {
              label: t.label,
              url,
              qrSvg,
            };
          }),
        );

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ targets: payload }));
      });
    },
  };
}

export default defineConfig({
  plugins: [mobileQrPlugin()],
});
