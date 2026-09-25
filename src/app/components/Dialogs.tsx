import { useState } from 'preact/hooks';
import { Brand } from '../../brand';
import { t } from '../../i18n';
import { closeAbout, closeWelcome, loadSample, pickAudioFile } from '../actions';
import { aboutOpen, welcomeOpen } from '../state';
import { Modal } from './Modal';
import { BrandMark } from './MenuBar';

/** Developer profile image with a graceful monogram fallback. */
function DevAvatar() {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span class="dev-avatar dev-avatar-mono" aria-hidden="true">
        MM
      </span>
    );
  }
  return (
    <img
      class="dev-avatar"
      src="https://pbs.twimg.com/profile_images/2045439954629849088/9jL1-cqa.jpg"
      alt=""
      width={52}
      height={52}
      onError={() => setFailed(true)}
    />
  );
}

export function WelcomeDialog() {
  if (!welcomeOpen.value) return null;
  return (
    <Modal title={t().welcomeTitle} onClose={closeWelcome}>
      <div class="welcome">
        <div class="welcome-logo">
          <BrandMark />
        </div>
        <p class="welcome-lead">{t().welcomeLead}</p>
        <div class="empty-actions">
          <button
            class="btn-primary"
            onClick={() => {
              closeWelcome();
              pickAudioFile();
            }}
          >
            {t().quickOpen}
          </button>
          <button
            class="btn-secondary"
            onClick={() => {
              closeWelcome();
              void loadSample();
            }}
          >
            {t().quickSample}
          </button>
        </div>
        <p class="welcome-privacy">{t().welcomePrivacy}</p>
        <p class="welcome-tips">{t().welcomeTips}</p>

        <div class="welcome-dev" role="contentinfo" aria-label={t().welcomeDevBy}>
          <DevAvatar />
          <div class="dev-info">
            <span class="dev-name">Mir Md. Masum</span>
            <span class="dev-role">{t().welcomeDevRole}</span>
            <div class="dev-links">
              <a href="mailto:mirmasum@mail.com">{t().devEmail}: mirmasum@mail.com</a>
              <a href="https://instagram.com/mirmd_masum" target="_blank" rel="noreferrer">
                Instagram · mirmd_masum
              </a>
              <span class="dev-chip">Discord · mir_masum</span>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function AboutDialog() {
  if (!aboutOpen.value) return null;
  return (
    <Modal title={t().aboutTitle} onClose={closeAbout}>
      <div class="about">
        <div class="welcome-logo">
          <BrandMark />
        </div>
        <p class="about-name">
          {Brand.name} v{Brand.version}
        </p>
        <p>{Brand.tagline}</p>
        <p>{t().aboutBuilt}</p>
        <p>{t().aboutGovernance}</p>
        <p class="welcome-attribution">{Brand.attribution}</p>
        <button class="btn-primary" onClick={closeAbout}>
          {t().ok}
        </button>
      </div>
    </Modal>
  );
}
