interface MobileQrTarget {
  label: string;
  url: string;
  qrSvg: string;
}

export function initMobileUi(): () => void {
  const openBtn = document.getElementById('qr-open-btn');
  const closeBtn = document.getElementById('qr-close-btn');
  const modal = document.getElementById('qr-modal');
  const tabsEl = document.getElementById('qr-network-tabs');
  const svgBox = document.getElementById('qr-svg-box');
  const urlLink = document.getElementById('qr-url-link') as HTMLAnchorElement | null;
  const fullscreenBtn = document.getElementById('fullscreen-btn');

  let cachedTargets: MobileQrTarget[] | null = null;

  const renderTarget = (target: MobileQrTarget, idx: number): void => {
    if (svgBox) {
      svgBox.innerHTML = target.qrSvg;
    }
    if (urlLink) {
      urlLink.textContent = target.url;
      urlLink.href = target.url;
    }
    if (tabsEl) {
      Array.from(tabsEl.children).forEach((child, childIdx) => {
        child.classList.toggle('active', childIdx === idx);
      });
    }
  };

  const loadQrTargets = async (): Promise<void> => {
    if (!svgBox || !tabsEl) return;

    if (!cachedTargets) {
      try {
        const res = await fetch('/__mobile-qr.json');
        if (!res.ok) throw new Error('QR endpoint unavailable');
        const data = (await res.json()) as { targets?: MobileQrTarget[] };
        cachedTargets = data.targets ?? [];
      } catch {
        cachedTargets = [];
      }
    }

    if (cachedTargets.length === 0) {
      svgBox.innerHTML =
        '<span class="qr-loading">Rode com <b>npm run dev</b> para gerar o QR Code da rede local.</span>';
      if (urlLink) {
        urlLink.textContent = window.location.href;
        urlLink.href = window.location.href;
      }
      tabsEl.innerHTML = '';
      return;
    }

    tabsEl.innerHTML = '';
    if (cachedTargets.length > 1) {
      cachedTargets.forEach((t, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'qr-tab-btn';
        btn.textContent = t.label;
        btn.addEventListener('click', () => renderTarget(t, idx));
        tabsEl.appendChild(btn);
      });
    }

    renderTarget(cachedTargets[0], 0);
  };

  const openModal = (): void => {
    modal?.classList.remove('hidden');
    void loadQrTargets();
  };

  const closeModal = (): void => {
    modal?.classList.add('hidden');
  };

  const onBackdropClick = (event: MouseEvent): void => {
    if (event.target === modal) {
      closeModal();
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
      closeModal();
    }
  };

  const isStandalone =
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

  const isIos =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const onFullscreenClick = (): void => {
    if (document.fullscreenEnabled) {
      if (!document.fullscreenElement) {
        void document.documentElement.requestFullscreen?.().catch(() => {});
      } else {
        void document.exitFullscreen?.().catch(() => {});
      }
      return;
    }

    if (isIos) {
      window.alert(
        'Para Tela Cheia no iPhone:\n1. Toque no botão Compartilhar (quadrado com seta ↑)\n2. Toque em "Adicionar à Tela de Início"\n3. Abra o jogo pelo ícone criado — ele abrirá em 100% tela cheia!',
      );
    }
  };

  if (fullscreenBtn && (isStandalone || (!document.fullscreenEnabled && !isIos))) {
    fullscreenBtn.style.display = 'none';
  }

  openBtn?.addEventListener('click', openModal);
  closeBtn?.addEventListener('click', closeModal);
  modal?.addEventListener('click', onBackdropClick);
  window.addEventListener('keydown', onKeyDown);
  fullscreenBtn?.addEventListener('click', onFullscreenClick);

  return () => {
    openBtn?.removeEventListener('click', openModal);
    closeBtn?.removeEventListener('click', closeModal);
    modal?.removeEventListener('click', onBackdropClick);
    window.removeEventListener('keydown', onKeyDown);
    fullscreenBtn?.removeEventListener('click', onFullscreenClick);
  };
}
