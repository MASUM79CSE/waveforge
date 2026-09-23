import { Brand } from '../../brand';
import { t } from '../../i18n';
import { closeAbout, closeWelcome } from '../actions';
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
        <p class="welcome-privacy">{t().welcomePrivacy}</p>
        <p class="welcome-milestone">{t().welcomeMilestone}</p>
        <button class="btn-primary welcome-start" onClick={closeWelcome}>
          {t().welcomeStart}
        </button>
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
