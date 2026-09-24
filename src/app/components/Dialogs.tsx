import { Brand } from '../../brand';
import { t } from '../../i18n';
import { closeAbout, closeWelcome, loadSample, pickAudioFile } from '../actions';
import { aboutOpen, welcomeOpen } from '../state';
import { Modal } from './Modal';
import { BrandMark } from './MenuBar';

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
        <p class="welcome-attribution">{Brand.attribution}</p>
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
